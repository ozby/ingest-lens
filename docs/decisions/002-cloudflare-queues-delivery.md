---
type: adr
last_updated: "2026-04-22"
---

# ADR 002: Cloudflare Queues for webhook delivery

**Status:** Accepted

## Context

Reliable webhook delivery has three hard requirements:

1. **Durability**: the delivery attempt must survive a Worker crash or timeout.
2. **Retry with backoff**: transient endpoint failures should not lose messages.
3. **Decoupling**: the publish latency seen by the caller must not depend on the receiver's
   response time.

The naive implementation — calling the push endpoint inside the publish request handler — fails all
three. A 10-second endpoint response time blocks the publisher. A crash after the POST but before
returning 200 silently drops the message. There is no retry.

## Decision

Enqueue a delivery payload into Cloudflare Queues at publish time. A separate queue consumer
Worker (`handleDeliveryBatch`) handles delivery with ack/retry semantics.

The consumer calls `msg.ack()` only after a 2xx response from the endpoint. Non-2xx responses and
network errors call `msg.retry({ delaySeconds })` with the configured backoff sequence.

Configuration in `wrangler.toml`:

```toml
[[queues.consumers]]
queue = "delivery-queue"
max_batch_size = 10
max_batch_timeout = 5
max_retries = 5
dead_letter_queue = "delivery-dlq"
```

## Consequences

**Positive:**

- Publish latency is bounded by the enqueue call, not the endpoint response time.
- At-least-once delivery is guaranteed by the queue's ack contract. The message is re-delivered
  if the consumer crashes without calling `msg.ack()`.
- `max_retries = 5` and the DLQ configuration ensure permanently failing messages are surfaced
  rather than silently retried forever.
- No external dependency. The queue is a first-class Cloudflare binding — no SQS, no Redis,
  no BullMQ worker process to operate.

**Negative:**

- **At-least-once, not exactly-once.** The consumer may deliver the same message more than once.
  Receivers must be idempotent. The system provides `Idempotency-Key` support at the publish layer
  to deduplicate storage, but duplicate delivery is still possible.
- **One consumer per queue.** Cloudflare Queues does not support consumer groups or competing
  consumers on the same queue. Fan-out to multiple consumers requires fan-out at the producer:
  insert one message per subscribed queue and enqueue one delivery payload per queue.
- **No ordering guarantee within a batch.** Messages in a batch may be processed in any order.
  If processing order matters, serialize through a Durable Object.
- **400ms minimum delivery delay.** Cloudflare introduces at least 400ms between enqueue and
  first delivery attempt. This is a platform constraint, not configurable.

## Alternatives considered

**AWS SQS:**  
Comparable feature set: at-least-once, configurable retry, DLQ. Requires AWS credentials,
SQS queue provisioning, and a Lambda trigger or polling loop. The operational gap between
"deploy a Worker with a queue consumer" and "configure SQS + Lambda trigger" is significant
for a Cloudflare-native architecture. Rejected: added operational complexity with no feature
advantage.

**BullMQ (Redis-backed):**  
Supports job priorities, delayed jobs, job progress tracking, and repeatable jobs — features
this system does not need. Requires a persistent Redis instance. In a serverless Worker
architecture, every BullMQ operation requires a TCP connection to Redis, which is subject to
the same V8 isolate lifecycle problem that Hyperdrive solves for Postgres (but without a
Hyperdrive equivalent for Redis). Rejected: over-featured, requires additional infrastructure.

**In-process retry inside the publish request:**  
Retry logic runs synchronously inside the publish handler. Rejected: violates decoupling
requirement; publisher sees endpoint latency; no retry possible after Worker timeout.
