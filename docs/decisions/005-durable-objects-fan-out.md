---
type: adr
last_updated: "2026-04-22"
---

# ADR 005: Cloudflare Durable Objects for WebSocket fan-out

**Status:** Accepted — implemented via the completed `durable-objects-fan-out` blueprint

## Context

Topic publishers need a way to reach connected browser clients without polling. The current
delivery path (Cloudflare Queues → HTTP POST to pushEndpoint) serves backend webhook receivers
but not long-lived browser connections.

A WebSocket fan-out layer needs:

1. **State**: which clients are connected to which topic.
2. **Coordination**: when a message arrives, broadcast to all connected clients.
3. **Efficiency**: idle connections should not consume continuous compute resources.

In a stateless Workers architecture, state and coordination require an external store or a
stateful primitive. The options are Redis pub/sub, a Postgres LISTEN/NOTIFY channel, or
Cloudflare Durable Objects.

## Decision

Use one `TopicRoom` Durable Object per `topicId`. Each DO accepts WebSocket upgrade requests,
maintains connected sockets using the hibernation API, and handles `/notify` POST requests from
the delivery consumer to broadcast incoming messages.

The delivery consumer calls `env.TOPIC_ROOMS.get(id).fetch(new Request("https://topic-room.internal/notify", { ... }))` only when the queue payload carries a non-null `topicId`.

Route: `GET /api/topics/:topicId/ws` — must be registered before the generic `/:id` matcher in
`routes/topic.ts` to prevent path capture.

## Consequences

**Positive:**

- **Global uniqueness**: there is exactly one `TopicRoom` instance per `topicId` across all
  Cloudflare PoPs at any given time. Multiple publishers and subscribers interact with the same
  object — no coordination protocol needed.
- **Single-writer consistency**: the DO is single-threaded. Concurrent broadcast calls are
  serialized automatically. No lock management, no race conditions on the connected socket list.
- **Hibernation economics**: the WebSocket hibernation API allows Cloudflare to evict the DO from
  memory when idle while keeping client connections alive at the network edge. The DO wakes on
  the next incoming event. You pay for CPU time, not idle connection duration. This is the key
  difference between hibernation and a traditional WebSocket server — the server doesn't hold
  the connection; Cloudflare's network does.
- **SQLite-backed storage**: DO storage is strongly consistent (serializable), durable, and
  scoped to the DO instance. No external database calls for per-connection state.

**Negative:**

- **1,000 RPS soft limit per DO**. At high message volume on a busy topic, the DO becomes the
  bottleneck. Broadcasting to 1,000 clients is O(n) and CPU-bound.
- **In-memory state is lost on hibernation**. Per-connection state (e.g., subscription filters,
  cursor positions) must be serialized using `WebSocket.serializeAttachment()` before the DO
  hibernates, and deserialized on wake. Missing this causes subtle state loss bugs.
- **Out-of-order request execution**. The DO is single-threaded but does not guarantee FIFO
  processing of concurrent requests. Two simultaneous broadcast calls execute in an
  implementation-defined order. For fan-out this is acceptable; for any protocol requiring strict
  sequencing, add application-level sequence numbers.
- **Testing in Vitest is indirect**. The Workers runtime DO APIs are not available in the Vitest
  `node` environment. Tests use lightweight stubs; correctness of the platform integration
  (routing, binding, socket lifecycle) is validated only via `wrangler build` and integration
  tests against a live Cloudflare environment.
- **Notify adds latency to the delivery hot path**. The delivery consumer makes a subrequest to
  the DO after acking a message. If the DO subrequest fails, the error is logged but remains
  best-effort: the queue delivery has already been acked, so the WebSocket client may miss the
  live event and rely on reconnect replay when available.

## Scaling beyond one DO per topic

A single `TopicRoom` DO handles thousands of idle WebSocket connections and moderate message
rates. It becomes the bottleneck when both connection count and message rate are high simultaneously
(e.g., 5,000 connected clients receiving 50 messages/second).

The fix is horizontal sharding by `topicId + shardKey`:

```
TOPIC_ROOMS.idFromName(`${topicId}:shard:${userId % SHARD_COUNT}`)
```

Each shard DO holds a subset of connections. The delivery consumer fans out notify calls to all
shard DOs. The trade-off: broadcast becomes `SHARD_COUNT` subrequests per message rather than one.
This is not implemented in the current blueprint but is the documented next step if the 1,000 RPS
limit is reached in practice. See [scale-considerations.md](../scale-considerations.md).

## Alternatives considered

**Redis pub/sub:**  
Globally replicated Redis (Upstash or similar) supports pub/sub with channel-based fan-out.
Each Worker subscriber opens a persistent connection to Redis and listens on a channel. The
problem: Workers isolates cannot hold persistent connections. The SUBSCRIBE command requires
a long-lived TCP connection, which the isolate lifecycle does not support. Rejected: fundamental
incompatibility with the Workers runtime model.

**Postgres LISTEN/NOTIFY:**  
Similar problem. LISTEN requires a persistent connection to receive notifications.
Rejected: same incompatibility.

**Server-Sent Events (SSE):**  
Unidirectional, simpler than WebSockets. But SSE in Workers requires the response stream to
remain open for the duration of the client connection, which consumes a Worker CPU budget
continuously. The hibernation API does not apply to SSE. Rejected: economically unviable for
long-lived connections at scale.
