# Delivery Guarantees

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
   network errors both call `msg.retry()`, which re-enqueues with the configured backoff.

3. If the Worker crashes between a successful push and calling `msg.ack()`, the message is
   re-delivered. This is the fundamental source of duplicates in an at-least-once system.

**Implication for receivers:** Your push endpoint must be idempotent. The same message may arrive
twice. If duplicate processing is harmful, use idempotency keys (see below).

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

## Retry backoff

The consumer retries failed deliveries with exponential backoff:

```
Attempt 0: 5s delay
Attempt 1: 10s delay
Attempt 2: 20s delay
Attempt 3: 40s delay
Attempt 4+: 80s delay (capped)
```

The attempt counter is carried in the queue payload (`DeliveryPayload.attempt`), not stored in
the database. This is intentional: the DB row represents the message state, not the delivery attempt
state. Keeping them separate means a failed delivery does not mutate the message record.

The `wrangler.toml` consumer configuration sets `max_retries = 5`. After five failed attempts,
Cloudflare moves the payload to the dead-letter queue.

## Dead-letter queue

The `delivery-dlq` queue receives messages that exhausted all retries. At this point the system has
given up on automatic delivery.

Operational recovery:

1. Read the DLQ payload to get the `messageId` and `pushEndpoint`.
2. Investigate why the endpoint was failing (downtime, schema mismatch, auth failure).
3. Re-enqueue manually by calling `DELIVERY_QUEUE.send` with the same payload and `attempt: 0`.
4. The consumer will retry from the beginning of the backoff sequence.

There is no automated DLQ drain endpoint. Automated replay risks re-triggering a systematic failure
(e.g., a broken endpoint that would immediately refill the DLQ). Operational recovery is intentionally
manual.

## What at-least-once means for receivers

Your push endpoint should:

1. Return `2xx` only after successfully processing the message. Returning `200` before processing
   and then crashing is indistinguishable from a network failure — the message will be re-delivered.

2. Handle the same message arriving twice without corrupting state. Typical approaches:
   - Check for the message ID in a processed-IDs table before acting.
   - Use database upserts keyed on the message ID.
   - Design side effects to be naturally idempotent (e.g., setting a value rather than incrementing).

3. Return `5xx` when processing fails transiently. Returning `2xx` for a failure silently drops
   the message — the consumer will ack it and stop retrying.
