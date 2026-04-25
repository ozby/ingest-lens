---
type: system
last_updated: "2026-04-25"
---

# Architecture

## Problem statement

IngestLens uses Cloudflare delivery primitives to solve a broader IntegrationOps
problem: third-party payloads are unreliable, operators need a trustworthy path
from intake to delivery, and the system must stay honest about what is shipped
versus merely planned.

The current repo already ships the delivery substrate: authenticated queue/topic
routes, push delivery, pull receive leases, dashboard metrics, and replay-aware
WebSocket fan-out. The planned product layer adds AI-assisted mapping review on
top of that substrate rather than replacing it.

Stateless compute is the core design constraint. Cloudflare Workers run in V8
isolates that are reclaimed after the request. There is no background process to
hold retries in memory, and there is no long-lived Postgres connection per
process. Every durable fact must live in Postgres, Cloudflare Queues, Durable
Objects, or explicit route state.

This system is built around that constraint rather than fighting it.

## System components

Throughout this document, treat **queues and topics as the shipped delivery rails** and **AI-assisted mapping as a planned product layer** unless a section explicitly says otherwise.

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

## Consistency Lab (`apps/lab`)

The Consistency Lab is a shipped observability tool that empirically measures and visualizes the
ordering and latency characteristics of IngestLens's delivery paths. It is separate from the
production delivery substrate and is gated by a runtime kill switch (`KillSwitchKV` over CF KV).

### Purpose

Rather than asserting delivery properties by inspection alone, the lab runs controlled workloads
through each delivery path and surfaces concrete evidence: inversion counts, p50/p95/p99 latencies,
duplicate counts, and per-path cost estimates.

### Architecture

```text
Browser ──▶ apps/lab (Hono SSR + htmx)
              │
              ├─ KillSwitchKV middleware — 404s the entire surface when the switch is off
              ├─ Session cookie + SessionLock DO — single-writer concurrency per scenario
              ├─ LabConcurrencyGauge DO — global cap (100 active sessions)
              │
              ├─ Scenario 1a (S1aRunnerDO) — correctness across 3 delivery paths
              │     CfQueues path | PgPolling path | PgDirectNotify path (direct TCP from DO)
              │     Output: delivered count, duplicate count, inversion count, Kendall-tau classifier
              │
              ├─ Scenario 1b (S1bRunnerDO) — latency across 3 delivery paths
              │     Output: p50 / p95 / p99 per path + pricing annotation (PricingTable)
              │
              ├─ TelemetryCollector — batches ScenarioEvents at ~10Hz for SSE fan-out
              │     Persists every event to lab.events_archive for Last-Event-ID replay
              │
              ├─ HeartbeatCron (15-min synthetic run, 10k-message weekly run)
              ├─ CostEstimatorCron ($50/day auto-kill via KillSwitchKV)
              └─ Workers Assets — CSS + htmx.min.js served as pure static assets
```

Key design choices:

- **Hono SSR + htmx**: server-rendered pages with partial DOM swaps over SSE; no client-side JS framework.
- **SessionLock DO**: alarm-backed TTL (300s default) prevents stale locks on crash; `blockConcurrencyWhile` init + `getAlarm()` check before `setAlarm`.
- **PgDirectNotify path**: Hyperdrive does not support LISTEN/NOTIFY (probe p01 confirmed). The third delivery path uses a direct TCP connection from a Durable Object via the CF Workers `connect()` API.
- **Inline t-digest**: `@thi.ng/tdigest` does not exist; the Histogram module uses a ~200-line inline implementation (Dunning 2019 reference design), validated to ±2% against known distributions.
- **`lab.*` Postgres schema**: all lab tables live in the `lab` schema, never `public`. A CI guard (`scripts/check-lab-migrations.ts`) rejects any migration containing `public.` DDL.

### Packages

| Package               | What it provides                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `packages/lab-core`   | SessionLock, LabConcurrencyGauge, Sanitizer, TelemetryCollector, KillSwitchKV, Histogram, PricingTable, Drizzle schema |
| `packages/test-utils` | `deepFreeze` + `createMockEnv` extracted from `apps/workers` for cross-package test use                                |
| `apps/lab`            | Hono SSR shell, Workers Assets, HeartbeatCron, CostEstimatorCron, scenario 1a + 1b runner DOs                          |

### Operational posture

- Kill switch (`lab:kill-switch` KV key) can be flipped at runtime without a deploy.
- A `$50/day` cost ceiling triggers an automatic flip via `CostEstimatorCron`.
- Admin bypass actions write audit rows to `lab.heartbeat_audit` with a constant-time token comparison.
- All events are sanitized by `Sanitizer` (allowlist-only, default-deny) before leaving the server.

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
