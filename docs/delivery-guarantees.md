---
type: system
last_updated: "2026-04-26"
---

# Delivery Guarantees

These guarantees describe the **current delivery substrate behind IngestLens**.
Queues/topics are shipped execution primitives; future intake/mapping features
must inherit these same guarantees instead of redefining them.

## At-least-once delivery

When a message is published to a queue with a `pushEndpoint`, the system guarantees that it will be
delivered to that endpoint **at least once**. It does not guarantee exactly once.

The contract is:

1. The message is persisted to Postgres before the queue payload is enqueued. If the enqueue fails
   after the insert, the message exists in the database but is never delivered — this is an acceptable
   silent failure for the current design (the alternative is a distributed transaction, which the
   Cloudflare Workers runtime does not support natively).

2. The Cloudflare Queue consumer (`apps/workers/src/consumers/deliveryConsumer.ts`) calls
   `msg.ack()` only after receiving a 2xx response from the push endpoint. Non-2xx responses and
   network errors call `msg.retry()` (transient failures use exponential backoff; permanent 4xx
   failures collapse retries immediately — see [Failure classification](#failure-classification)).

3. If the Worker crashes between a successful push and calling `msg.ack()`, the message is
   re-delivered. This is the fundamental source of duplicates in an at-least-once system.

**Implication for receivers:** Your push endpoint must be idempotent. The same message may arrive
twice. If duplicate processing is harmful, use idempotency keys (see below).

## Pull receive visibility leases

`GET /api/messages/:queueId` supports a queue-style pull lease with two query
parameters:

- `maxMessages` — max messages to claim in one call, capped at 10
- `visibilityTimeout` — lease length in seconds, default `30`

Behavior:

1. The route returns currently visible messages for the owned queue.
2. Returned messages are marked with `received: true`, `receivedAt: <now>`,
   and `visibilityExpiresAt: <now + visibilityTimeout>`. This lease state is
   backed by the `visibility_expires_at` database column added in
   `apps/workers/src/db/migrations/0002_jazzy_karnak.sql`.
3. While the lease is active, the same message is hidden from later receive
   calls on that queue.
4. After the lease expires, the message becomes visible again unless it has
   been acknowledged by deletion.
5. `DELETE /api/messages/:queueId/:messageId` is the acknowledgement path; it
   removes the leased row so it cannot reappear after the timeout.

**Important concurrency caveat:** the current implementation is still a
select-then-update flow, not a single atomic claim statement. Concurrent pull
consumers can race and receive the same visible row before both updates land.
This is still an at-least-once model. A message may be received more than once
if the client does not delete it before the lease expires, or if two consumers
race to claim the same row at nearly the same time.

Dashboard `activeMessages` counts only leases that are currently in-flight
(`received = true` with an unexpired `visibility_expires_at`). Expired leases do
not count as active even before a later receive call makes the row visible
again.

## Idempotency keys

Publishers can prevent duplicate _storage_ by supplying an `Idempotency-Key` header on
`POST /api/messages/:queueId`. The key is a client-generated identifier (UUID recommended).

Behavior:

| Scenario                                         | Response                                                  |
| ------------------------------------------------ | --------------------------------------------------------- |
| First request with key `abc`                     | `201 Created` — message inserted and enqueued             |
| Second request with same key `abc` to same queue | `200 OK` — existing message returned, nothing re-enqueued |
| Request without `Idempotency-Key` header         | `201 Created` — normal insert, no deduplication           |

The uniqueness constraint is scoped to `(queueId, idempotencyKey)`. The same key can be reused
across different queues without collision.

**What idempotency keys do not cover:** Duplicate _delivery_ after a successful insert. The queue
consumer may still deliver the same message more than once if the consumer crashes after a successful
push but before `msg.ack()`. Receivers must handle this case regardless of whether a key was used.

## Failure classification

Non-2xx responses are classified before deciding how to retry:

| Class         | Status codes                               | Behaviour                                                                                                                         |
| ------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **Transient** | 5xx, 408, 425, 429, network throw          | `msg.retry()` with exponential backoff                                                                                            |
| **Permanent** | All other 4xx (401, 403, 404, 410, 422, …) | `msg.retry({ delaySeconds: 0 })` — retries collapse immediately, exhausting `max_retries` quickly to route the message to the DLQ |

**Why collapse permanent failures instead of acking?** Acking a permanent failure silently discards
the message with no operator visibility. Routing to the DLQ gives operators a single place to triage
all failed deliveries regardless of cause, filterable by the `failure_class` attribute on the DLQ
message.

**Receivers: do not return 4xx for transient failures.** A `401 Unauthorized` or `410 Gone`
response tells the system the endpoint is permanently misconfigured. Return `5xx` for transient
server-side errors.

Source: `apps/workers/src/consumers/failureClassifier.ts`.

## Retry backoff

Transient failures use exponential backoff keyed on `msg.attempts` — Cloudflare's platform-tracked
delivery count (1-indexed, persists across consumer restarts):

| Platform attempt (`msg.attempts`) | Delay         |
| --------------------------------- | ------------- |
| 1                                 | 5 s           |
| 2                                 | 10 s          |
| 3                                 | 20 s          |
| 4                                 | 40 s          |
| 5+                                | 80 s (capped) |

The attempt counter comes from the CF Queues runtime, not the queue payload. This means the backoff
correctly escalates even after a consumer restart — the platform remembers how many times it has
attempted delivery regardless of which consumer instance handles the retry.

The `wrangler.toml` consumer sets `max_retries = 5`. After five attempts, Cloudflare routes the
message to the dead-letter queue.

## Dead-letter queue

`delivery-dlq-{dev,prd}` receives messages that exhausted all retries. Both the main queue and
the DLQ are provisioned via Pulumi (`infra/src/resources/exports-queues.ts`) so they survive
across deployments and cannot be accidentally recreated empty by `wrangler deploy`.

DLQ messages carry a `failure_class` attribute (`"permanent"` or `"transient"`) so operators can
distinguish misconfigured endpoints (permanent) from flaky infrastructure (transient) in one place.

Operational recovery:

1. Inspect the DLQ message: read `messageId`, `pushEndpoint`, and `failure_class`.
2. Investigate the root cause (downtime, auth failure, schema mismatch, etc.).
3. Re-enqueue by calling `DELIVERY_QUEUE.send` with the same `messageId`, `queueId`, and
   `pushEndpoint`. The `attempt` field in the payload is optional and ignored — backoff restarts
   from attempt 1 automatically via `msg.attempts`.
4. The consumer retries from the beginning of the backoff sequence.

There is no automated DLQ drain endpoint. Automated replay risks re-triggering a systematic failure.
Operational recovery is intentionally manual.

## Empirical verification — Consistency Lab

The guarantees above describe the design intent. The **Consistency Lab** (`apps/lab`) provides
empirical verification of ordering and latency across the three delivery paths:

| Path               | Guarantee                              | Lab measure                                    |
| ------------------ | -------------------------------------- | ---------------------------------------------- |
| **CfQueues**       | At-least-once; no ordering guarantee   | Inversion count + Kendall-tau ordering score   |
| **PgPolling**      | Ordered by `ORDER BY seq`; polling lag | p50/p95/p99 latency; inversion count near zero |
| **PgDirectNotify** | Session-scoped NOTIFY order            | Inversion count; reconnect drop count          |

Scenario 1a (correctness) measures how many messages arrive out-of-order relative to the send
sequence. Scenario 1b (latency) measures end-to-end delivery time at three percentiles and
annotates each path with a cost-per-million estimate from the pinned `PricingTable`.

Hyperdrive does not support `LISTEN/NOTIFY` (fact-check probe p01 confirmed this — Hyperdrive
multiplexes connections). The `PgDirectNotify` path bypasses Hyperdrive and opens a direct TCP
connection from a Durable Object using the CF Workers `connect()` API.

Results are surfaced as live SSE streams and stored in `lab.events_archive` for replay. The lab
is gated by `KillSwitchKV` and can be disabled at runtime without a deploy.

See [architecture.md](architecture.md) for the full Consistency Lab component breakdown.

## What at-least-once means for receivers

Your push endpoint should:

1. Return `2xx` only after successfully processing the message. Returning `200` before processing
   and then crashing is indistinguishable from a network failure — the message will be re-delivered.

2. Handle the same message arriving twice without corrupting state. Typical approaches:
   - Check for the message ID in a processed-IDs table before acting.
   - Use database upserts keyed on the message ID.
   - Design side effects to be naturally idempotent (e.g., setting a value rather than incrementing).

3. Return `5xx` (or 408/425/429) when processing fails transiently. Returning `2xx` for a failure
   silently drops the message — the consumer will ack it and stop retrying.

4. Do **not** return `4xx` for transient failures. Any 4xx except 408, 425, and 429 is treated as
   a permanent misconfiguration and routes directly to the DLQ after exhausting `max_retries`.
