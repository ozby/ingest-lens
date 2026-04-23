---
type: system
last_updated: "2026-04-24"
---

# Architecture

## Problem statement

Delivering webhooks reliably is harder than it looks. The naive approach — HTTP call inside the
publish request — fails silently when the receiver is down, slow, or returning 5xx. The caller gets
no signal, the message is lost, and there is no retry.

The harder version of the same problem is that stateless compute makes it worse. Cloudflare Workers
run in V8 isolates that are garbage-collected after the request. You cannot hold a background goroutine
that retries failed deliveries. You cannot maintain a long-lived TCP connection to Postgres between
requests. Every piece of state must be either persisted externally or passed through a queue.

This system is built around that constraint rather than fighting it.

## System components

### Cloudflare Workers (Hono)

The HTTP layer runs entirely on Workers. No Node.js server, no idle cost, no scaling configuration.
The Hono framework provides a familiar Express-like routing API over the Workers `fetch` handler.

Entry point: `apps/workers/src/index.ts`  
Routes: `apps/workers/src/routes/`

The Worker exports two handlers: `fetch` for HTTP requests and `queue` for the delivery consumer.
Both share the same `Env` type, which describes all bindings (Hyperdrive, Queues, JWT secret).

### Hyperdrive (Postgres connection pooling)

Workers isolates cannot hold persistent TCP connections. Without a pooler, every request would pay
200-500ms for a fresh TCP + TLS + Postgres protocol handshake to a remote database.

Hyperdrive solves this by running a persistent connection pool at each Cloudflare PoP. The Worker
opens a short-lived local connection to the PoP-local pool manager, which maintains long-lived
connections to the origin Postgres. From the Worker's perspective, the connection string is just
`env.HYPERDRIVE.connectionString`.

Schema and queries: `apps/workers/src/db/schema.ts`, `apps/workers/src/db/client.ts`

One meaningful gap: Hyperdrive's read query cache is disabled in `wrangler dev`. Local development
connects directly to Postgres with no pooling or caching, so cache-dependent latency targets are
not testable locally. See [ADR 003](decisions/003-hyperdrive-connection-pooling.md).

### Cloudflare Queues (delivery)

When a message is published to a queue with a `pushEndpoint`, the system enqueues a delivery payload
rather than calling the endpoint directly. This decouples the publish latency from the delivery
attempt and gives the system an ack/retry primitive without managing a separate job scheduler.

The delivery consumer (`apps/workers/src/consumers/deliveryConsumer.ts`) processes batches of up
to 10 messages. For each message:

1. Fetch the message record from Postgres to get the full payload.
2. POST to the push endpoint.
3. On 2xx: `msg.ack()`.
4. On 5xx or network error: `msg.retry({ delaySeconds })` with exponential backoff.
5. If the DB row is missing (message deleted before delivery): `msg.ack()` — safe drop, nothing
   to deliver.

After `max_retries = 5` failures, Cloudflare moves the payload to `delivery-dlq`.

The delivery guarantee is **at-least-once**. The consumer may deliver the same message more than
once if it crashes between a successful POST and calling `msg.ack()`. See
[delivery-guarantees.md](delivery-guarantees.md) for the full contract including idempotency keys.

### Durable Objects — shipped

The completed `durable-objects-fan-out` blueprint adds a `TopicRoom` Durable Object per topic. Connected
browser clients subscribe over WebSockets. When the delivery consumer acks a message that carries a
`topicId`, it notifies the DO, which broadcasts to all connected sockets. The completed
`message-replay-cursor` blueprint extends the same DO with a short-lived SQLite replay log, so a
client reconnecting with `GET /api/topics/:topicId/ws?cursor=<cursor>` receives missed messages
with a Durable-Object-issued replay cursor greater than the one it last observed. Live and replay
payloads still carry the original Postgres `seq` as an ordering hint, but reconnect correctness is
anchored to DO emission order rather than DB insertion order.

The DO uses the WebSocket hibernation API: Cloudflare holds the connections at the network edge
while the DO sleeps between events. This makes long-lived idle WebSocket connections economically
viable — you pay for CPU time, not connection duration.

A single `TopicRoom` DO handles thousands of connections, but broadcasting to all of them is O(n)
in connected client count. At high message volume the DO becomes the bottleneck.
See [scale-considerations.md](scale-considerations.md) for the sharding plan.

## IngestLens adaptive ingestion architecture — planned

The queue/topic platform remains the delivery substrate. The IngestLens product
layer adds a generic, human-approved mapping-repair path on top of it. Public job
postings are the first demo lens; the architecture is not HR-specific. The
canonical decision record is
[ADR 0004](adrs/0004-ingestlens-ai-intake-architecture.md).

AI is used in exactly one production place: mapping repair suggestion. It
receives a bounded source payload, a target contract, the current approved mapping
revision, and a prompt version. It returns suggested source paths, drift
categories, missing fields, ambiguous fields, confidence, and notes.
Everything after that point is deterministic code: schema validation,
source-path validation, compatibility checks, approval, approved-mapping-revision
promotion, normalization, publishing, telemetry, retention, and replay.

Planned v1 keeps the code surface intentionally small:

- contracts as code, not a runtime schema-registry UI;
- one intake route tree under `/api/intake/*`;
- one shared type file for attempts, approved mapping revisions and review states;
- pure functions for drift detection, mapping validation, and mapping
  application;
- one admin review UI for approve/reject;
- deterministic pinned fixtures by default; no live fetch in the critical path.

Planned flow:

```text
GET /api/intake/public-fixtures
  -> list bundled fixture metadata for the first demo lens

POST /api/intake/mapping-suggestions
  -> authenticate + rate-limit
  -> validate payload envelope and size/depth limits
  -> select target contract + current approved mapping revision
  -> detect drift and create intakeAttemptId + mappingTraceId
  -> call Workers AI adapter or deterministic fallback
  -> parse JSON, validate schema, validate source paths, check compatibility
  -> persist redacted attempt metadata and short-lived review payload reference

GET /api/intake/mapping-suggestions?status=pending_review
  -> admin panel lists suggestions awaiting review

POST /api/intake/mapping-suggestions/:id/approve
  -> authenticate
  -> verify attempt owner and queue/topic target ownership
  -> reject expired review payloads
  -> create approved mapping revision
  -> replay source payload through the approved mapping
  -> normalize with deterministic code into eventType ingest.record.normalized + schemaVersion v1
  -> insert message and publish through existing DELIVERY_QUEUE rails
  -> emit telemetry using the same mappingTraceId

Manual replay after approval is deferred from v1; approval itself performs the deterministic replay+ingest path.
```

The deterministic demo bundles a curated subset of
`data/payload-mapper/payloads/ats/open-apply-sample.jsonl` into Worker code so
it works after deployment without runtime filesystem access. Optional live public fetch is a future enhancement, not part of the v1 critical path.

## Request lifecycle

### Path A — Direct queue publish

```
POST /api/messages/:queueId
  → authenticate (JWT verification, user set on context)
  → check Idempotency-Key header
      → if present and duplicate: return 200 with existing message
  → INSERT message into Postgres (data, queueId, expiresAt, receivedCount = 0)
  → if queue.pushEndpoint is set:
      → DELIVERY_QUEUE.send({ messageId, seq, queueId, pushEndpoint, topicId: null, attempt: 0 })
  → return 201 Created
```

Source: `apps/workers/src/routes/message.ts`

### Path B — Topic fan-out

```
POST /api/topics/:topicId/publish
  → authenticate
  → SELECT topic by ID (verify ownership)
  → SELECT all subscribed queues (inArray on subscribedQueues column)
  → for each queue:
      → INSERT message
      → if queue.pushEndpoint: DELIVERY_QUEUE.send({ ..., seq, topicId })
  → return 201 with all created messages
```

Source: `apps/workers/src/routes/topic.ts`

### Delivery consumer

```
DELIVERY_QUEUE batch (up to 10 messages)
  → for each message:
      → SELECT message by ID from Postgres
      → if not found: msg.ack() — continue
      → POST pushEndpoint with message body
      → on 2xx: msg.ack()
          → if topicId exists: notify TopicRoom with { messageId, seq, queueId, topicId }
      → on 5xx/error: msg.retry({ delaySeconds: backoff[attempt] })
```

Source: `apps/workers/src/consumers/deliveryConsumer.ts`

## Delivery guarantees

At-least-once. Full contract in [delivery-guarantees.md](delivery-guarantees.md).

Short version: messages may be delivered more than once. Use the `Idempotency-Key` header on
publish to deduplicate at the storage layer. Receivers must be idempotent regardless.

## What this is not

- **Not a message broker**: there is no message ordering guarantee, no consumer group management,
  and no offset tracking. If you need Kafka semantics, use Kafka.
- **Not a full browser messaging platform**: WebSocket fan-out and short reconnect replay now
  exist, but there is still no client SDK, no durable per-user cursor store, and no long-term
  event archive.
- **Not multi-region**: all Postgres data lives in one region. Cloudflare Workers run globally,
  but every query travels to the same database. Latency from geographically distant PoPs is
  real — the Hyperdrive pool helps but does not eliminate it.
- **Not a quota system**: the rate limiting binding enforces per-PoP token bucket limits, not
  global quotas. A distributed attacker can exceed any nominal limit you set. See
  [ADR 004](decisions/004-per-pop-rate-limiting.md).
