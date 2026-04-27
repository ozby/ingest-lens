---
type: research
last_updated: "2026-04-24"
---

# Scale Considerations

This document is an honest account of where the current IngestLens delivery
substrate works, where it starts to strain, and what would need to change at
higher load. It describes the shipped queue/topic/runtime foundation, not the
future AI intake layer.

## Current design point

The current showcase is designed for a moderate-traffic integration workflow:
tens of thousands of messages per day, hundreds of concurrent publishers, and a
handful of topics with dozens of subscribers each.

At this scale, the limiting factors are all external services:

| Component          | Published limit          | Practical limit                         |
| ------------------ | ------------------------ | --------------------------------------- |
| Cloudflare Queues  | 10,000 msg/sec per queue | Effectively unlimited for this use case |
| Hyperdrive pool    | ~100 connections per PoP | Sufficient for current request rate     |
| Cloudflare Workers | 50ms CPU time (default)  | No issue for simple CRUD + enqueue      |

## First bottleneck: single Durable Object per topic

The completed `durable-objects-fan-out` blueprint creates one `TopicRoom` DO per topic. This is a
single-writer object: all WebSocket message broadcasts for a topic are serialized through one
instance.

Cloudflare documents a soft limit of **1,000 RPS per DO**. At high message volume (e.g., a high-
frequency market data topic with 500 msg/sec and 200 connected clients), a single `TopicRoom`
becomes the bottleneck — not because of connection count, but because every delivered message
triggers a broadcast loop that is O(n) in connected clients.

**Fix at 10x:** Shard `TopicRoom` by `topicId + shardKey`. Clients connect to their assigned
shard; a fan-out coordinator distributes incoming notify calls across shards. The shard key can
be derived from the client's user ID to keep related clients on the same shard:

```
TOPIC_ROOMS.idFromName(`${topicId}:shard:${userId % shardCount}`)
```

This is not built yet — it requires a coordinator layer between the delivery consumer and the
per-shard DO instances.

## Second bottleneck: O(n) broadcast

Broadcasting to n connected WebSocket clients requires n `send()` calls inside a single DO request.
This is CPU-bound. At ~1k connected clients per DO and ~10 bytes per frame, sending a 1KB message
to all clients takes roughly 10ms of CPU in the DO.

At 100 msg/sec × 1k clients, the DO is spending ~1,000ms/sec on sends — effectively at CPU
capacity.

**Fix at 100x:** Fan-out tree. Instead of one DO broadcasting to all clients, a root DO receives
the notify call and fans out to shard DOs, each of which holds a subset of connections. The root
DO does n/shard-size sends (cheap); each shard DO does shard-size sends (also cheap). Total CPU
scales as O(log n) in tree depth rather than O(n).

## Third bottleneck: Hyperdrive caching gap

Hyperdrive caches read-only SELECT results per PoP. The cache is invalidated automatically when a
write (INSERT, UPDATE, DELETE) touches the same tables.

The delivery consumer runs on Cloudflare's internal network, which may not be co-located with the
PoP serving client reads. At high publish rates, cache invalidation pressure grows: every published
message invalidates cached queue and message queries, causing subsequent reads to hit Postgres
directly.

**Fix:** Move the delivery consumer to a regional pattern — publish to a region-specific queue
tied to the PoP that holds the Hyperdrive pool for that region. This is premature optimization for
the current scale but worth planning if cache hit rate degrades measurably.

## What would require re-architecting

These scenarios require changes beyond configuration tuning:

| Scenario                                  | Why the current design breaks                                                                        | Migration path                                                                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Long-running jobs (>30s CPU)              | Workers CPU limit                                                                                    | Move heavy processing to a backend service; use Workers only for enqueue and result polling                       |
| Memory-intensive operations (>128MB)      | Workers memory limit                                                                                 | Offload to a dedicated compute layer (Cloud Run, Fargate)                                                         |
| True global rate limiting (<50ms latency) | Per-PoP limits only; global coordination requires a round-trip to a central store                    | Upstash Redis with sliding-window scripts, or a Durable Object accepting the latency penalty                      |
| Exactly-once delivery                     | At-least-once is a fundamental property of the queue; exactly-once requires distributed transactions | Two-phase commit between the DB insert and queue enqueue — impractical on Workers without a coordinator primitive |
| Multi-tenant data isolation               | Current model uses FK-backed `ownerId` row-level isolation; still no schema separation               | Migrate to per-tenant Postgres schemas or a tenant-aware proxy layer; requires schema migration strategy          |

## Reading the limits correctly

Cloudflare publishes limits per product. The important ones for this system:

- **Workers:** 30s CPU/request (configurable to 5min for scheduled workers), 128MB memory, 50 subrequests/request default
- **Queues:** 10k msg/sec, 5MB/message, 5-second processing timeout, 1000 queues/account
- **Durable Objects:** 10 GB storage/DO, 1k RPS soft limit/DO, 30s CPU/request, 128MB memory
- **Hyperdrive:** ~100 connections/PoP, TLS required, MySQL prepared statements unsupported

These limits are not walls — they are signals. Hitting a limit means your sharding model needs a
rethink, not that the platform is wrong for the workload.
