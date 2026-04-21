---
type: adr
last_updated: "2026-04-22"
---

# ADR 0002: Pub/Sub In-Process vs. Durable Queue

- **Status:** accepted
- **Date:** 2026-04-22
- **Decider(s):** repo owner

## Context

The platform must fan out an inbound webhook event to one or more subscriber
endpoints. The key design question is whether that fan-out happens:

1. **In-process** — the API server that received the event also dispatches
   deliveries synchronously (with async retries held in memory), or
2. **Durable queue** — the event is enqueued in an external broker (Redis,
   RabbitMQ, Cloudflare Queues) and consumed by a separate worker process

The delivery dispatcher implementation lives in
`apps/api-server/src/platform/services/deliveryDispatcher.ts`. Retry logic
(exponential back-off, max attempts) is in
`apps/api-server/src/platform/domain/retry.ts`.

This is a principal-engineer showcase repo operating at low volume (< 100
events/s sustained). The primary constraints are:

- Operational simplicity: no external dependencies beyond Postgres
- Latency: sub-100 ms end-to-end delivery on happy path
- Deployment target: Cloudflare Workers (stateless, no persistent in-worker
  memory across requests)

## Decision

For v1, use an **in-process delivery dispatcher**. The API request handler
dispatches deliveries inline (fire-and-forget with async retries) without
introducing an external message broker. Retry state is held in memory within
the request lifecycle.

This decision is explicitly scoped to v1 / low-volume operation. The
architecture is documented here so the trade-off is visible when fan-out
volume grows.

## Consequences

### Positive

- Zero additional infrastructure — no Redis, no RabbitMQ, no Cloudflare
  Queues account setup
- Lower end-to-end latency: no enqueue/dequeue round-trip
- Simpler local development and CI (no broker container needed)

### Negative

- In-flight deliveries are lost if the worker process restarts mid-retry
  (Cloudflare Workers have a hard CPU/wall-time limit per invocation)
- No visibility into the delivery queue without adding custom metrics — a
  durable queue gives this for free
- Fan-out cannot scale horizontally beyond a single worker invocation

### Neutral / follow-ups

- Revisit when fan-out exceeds ~1 000 deliveries/second or when delivery
  durability (survive process crash) becomes a hard requirement
- Cloudflare Queues is the natural upgrade path given the deployment target
- `deliveryDispatcher.ts` should be extracted behind an interface so the
  backing implementation can be swapped without touching call sites

## Alternatives considered

- **BullMQ (Redis-backed)** — rejected because it requires a Redis instance
  which adds operational overhead and is not natively supported on Cloudflare
  Workers
- **Cloudflare Queues** — rejected for v1 because it requires a paid
  Cloudflare plan and adds binding configuration; the upgrade path is
  documented and the interface abstraction makes it viable later
- **PostgreSQL-backed queue (pg-boss / SKIP LOCKED)** — rejected because
  the platform is migrating to Cloudflare Workers where long-polling a
  Postgres queue is architecturally awkward; deferred to a future ADR if
  the CF Queues path proves undesirable
