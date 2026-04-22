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

### Durable Objects — planned

The `durable-objects-fan-out` blueprint adds a `TopicRoom` Durable Object per topic. Connected
browser clients subscribe over WebSockets. When the delivery consumer acks a message that carries a
`topicId`, it notifies the DO, which broadcasts to all connected sockets.

The DO uses the WebSocket hibernation API: Cloudflare holds the connections at the network edge
while the DO sleeps between events. This makes long-lived idle WebSocket connections economically
viable — you pay for CPU time, not connection duration.

A single `TopicRoom` DO handles thousands of connections, but broadcasting to all of them is O(n)
in connected client count. At high message volume the DO becomes the bottleneck.
See [scale-considerations.md](scale-considerations.md) for the sharding plan.

## Request lifecycle

### Path A — Direct queue publish

```
POST /api/messages/:queueId
  → authenticate (JWT verification, user set on context)
  → check Idempotency-Key header
      → if present and duplicate: return 200 with existing message
  → INSERT message into Postgres (data, queueId, expiresAt, receivedCount = 0)
  → if queue.pushEndpoint is set:
      → DELIVERY_QUEUE.send({ messageId, queueId, pushEndpoint, topicId: null, attempt: 0 })
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
      → if queue.pushEndpoint: DELIVERY_QUEUE.send({ ..., topicId })
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
- **Not a browser push service**: the WebSocket fan-out via Durable Objects is planned but not
  built. There is no client SDK.
- **Not multi-region**: all Postgres data lives in one region. Cloudflare Workers run globally,
  but every query travels to the same database. Latency from geographically distant PoPs is
  real — the Hyperdrive pool helps but does not eliminate it.
- **Not a quota system**: the rate limiting binding enforces per-PoP token bucket limits, not
  global quotas. A distributed attacker can exceed any nominal limit you set. See
  [ADR 004](decisions/004-per-pop-rate-limiting.md).
