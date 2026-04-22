---
type: blueprint
status: planned
complexity: M
created: "2026-04-22"
last_updated: "2026-04-22"
progress: "0%"
depends_on: []
tags:
  - cloudflare-workers
  - queues
  - reliability
  - delivery
---

# CF Queues delivery

**Goal:** Replace the fire-and-forget `waitUntil(fetch(pushEndpoint))`
delivery in `apps/workers/src/routes/message.ts` with Cloudflare Queues,
giving at-least-once delivery guarantees, per-message retry with configurable
delay, and a dead-letter queue for permanent failures.

## Planning Summary

- **Why now:** The current delivery in `message.ts:69-79` swallows all errors
  (`catch(() => {})`). Any failed push is silently dropped. Queues fixes this
  with zero infrastructure.
- **Scope:** One `[[queues.producers]]` binding to enqueue on publish; one
  `[[queues.consumers]]` to handle delivery with retries and DLQ; a dead-letter
  queue that archives to a separate queue for inspection. Idempotency key on
  each message prevents duplicate processing.
- **Out of scope:** Subscriber WebSocket fan-out (handled by
  `durable-objects-fan-out`). Analytics on delivery events (handled by
  `analytics-engine-telemetry`).

## Architecture Overview

```text
before:
  POST /api/messages/:queueId
    → insert to Postgres
    → waitUntil(fetch(pushEndpoint))   ← fire-and-forget, errors swallowed

after:
  POST /api/messages/:queueId
    → insert to Postgres (unchanged)
    → env.DELIVERY_QUEUE.send({ messageId, queueId, pushEndpoint, attempt: 0 })

  Queue consumer (deliveryConsumer.ts):
    → fetch(pushEndpoint) with timeout
    → msg.ack()           on 2xx
    → msg.retry({ delaySeconds: 2^attempt * 5 })  on 4xx/5xx
    → after max_retries → DLQ (delivery-dlq queue)
```

## Fact-Checked Findings

| ID  | Severity | Claim                                                                        | Source                                                                                                      |
| --- | -------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| F1  | HIGH     | Queues provides at-least-once delivery by default                            | CF docs: "guaranteed to be delivered at least once, and in rare occasions, may be delivered more than once" |
| F2  | HIGH     | `max_batch_size` max is 100; default is 10                                   | CF docs: batch settings table                                                                               |
| F3  | HIGH     | `max_retries` defaults to 3; messages at max retries go to DLQ if configured | CF docs delivery failure section                                                                            |
| F4  | MEDIUM   | Retrying a message does NOT reduce consumer concurrency                      | CF docs: "Retrying messages will not cause the consumer to autoscale down"                                  |
| F5  | MEDIUM   | Explicit per-message `msg.ack()` / `msg.retry()` prevent full-batch retry    | CF docs: explicit acknowledgement section                                                                   |
| F6  | LOW      | Queue names must be provisioned in Pulumi before wrangler can bind them      | CF infra convention; Pulumi handles resource creation                                                       |

## Key Decisions

| Decision         | Choice                                           | Rationale                                            |
| ---------------- | ------------------------------------------------ | ---------------------------------------------------- |
| Delivery payload | `{ messageId, queueId, pushEndpoint, attempt }`  | Minimal; DB holds the full message body              |
| Retry delay      | `2^attempt * 5 s` (5, 10, 20, 40 s…)             | Exponential back-off; stays within `max_retries = 5` |
| Batch size       | `max_batch_size = 10`, `max_batch_timeout = 5 s` | Low latency over throughput for push delivery        |
| DLQ              | Separate `delivery-dlq` queue                    | Inspection without re-processing                     |

## Quick Reference (Execution Waves)

| Wave              | Tasks     | Dependencies | Parallelizable                            |
| ----------------- | --------- | ------------ | ----------------------------------------- |
| **Wave 1**        | 1.1, 1.2  | None         | 2 agents (wrangler.toml vs consumer file) |
| **Wave 2**        | 1.3       | 1.1 + 1.2    | 1 agent                                   |
| **Critical path** | 1.1 → 1.3 | —            | 2 waves                                   |

---

### Phase 1: Binding, consumer, and wire-up [Complexity: M]

#### [config] Task 1.1: Wrangler bindings + Env type

**Status:** pending

**Depends:** None

Add producer + consumer queue bindings to `wrangler.toml` and extend `Env`.

**Files:**

- Modify: `apps/workers/wrangler.toml`
- Modify: `apps/workers/src/db/client.ts`

**Steps (TDD):**

1. Add to `apps/workers/wrangler.toml`:

   ```toml
   [[queues.producers]]
   binding = "DELIVERY_QUEUE"
   queue = "delivery-queue"

   [[queues.consumers]]
   queue = "delivery-queue"
   max_batch_size = 10
   max_batch_timeout = 5
   max_retries = 5
   dead_letter_queue = "delivery-dlq"
   ```

2. Add to `Env` in `apps/workers/src/db/client.ts`:
   ```ts
   DELIVERY_QUEUE: Queue<DeliveryPayload>;
   ```
3. Export `DeliveryPayload` type from `client.ts`:
   ```ts
   export type DeliveryPayload = {
     messageId: string;
     queueId: string;
     pushEndpoint: string;
     attempt: number;
   };
   ```
4. Run: `pnpm --filter @repo/workers check-types` — PASS.

**Acceptance:**

- [ ] `wrangler.toml` has producer + consumer blocks for `delivery-queue`.
- [ ] `DeliveryPayload` type exported from `db/client.ts`.
- [ ] `pnpm --filter @repo/workers check-types` passes.

---

#### [consumer] Task 1.2: Delivery consumer handler

**Status:** pending

**Depends:** None

Create `src/consumers/deliveryConsumer.ts` with explicit per-message ack/retry
and exponential back-off.

**Files:**

- Create: `apps/workers/src/consumers/deliveryConsumer.ts`
- Create: `apps/workers/src/tests/deliveryConsumer.test.ts`

**Steps (TDD):**

1. Write `deliveryConsumer.test.ts` covering:
   - 2xx response → `msg.ack()` called
   - 5xx response → `msg.retry({ delaySeconds })` called
   - Fetch throws (network error) → `msg.retry()` called
2. Run: `pnpm --filter @repo/workers test` — FAIL.
3. Implement `deliveryConsumer.ts`:

   ```ts
   import type { DeliveryPayload } from "../db/client";

   export async function handleDeliveryBatch(
     batch: MessageBatch<DeliveryPayload>,
     env: Env,
   ): Promise<void> {
     for (const msg of batch.messages) {
       const { pushEndpoint, attempt } = msg.body;
       try {
         const res = await fetch(pushEndpoint, {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify(msg.body),
           signal: AbortSignal.timeout(10_000),
         });
         if (res.ok) {
           msg.ack();
         } else {
           const delaySec = Math.pow(2, attempt) * 5;
           msg.retry({ delaySeconds: delaySec });
         }
       } catch {
         const delaySec = Math.pow(2, attempt) * 5;
         msg.retry({ delaySeconds: delaySec });
       }
     }
   }
   ```

4. Run: `pnpm --filter @repo/workers test` — PASS.
5. Run: `pnpm --filter @repo/workers lint` — PASS.

**Acceptance:**

- [ ] Tests cover 2xx ack, 5xx retry, network-error retry cases.
- [ ] `msg.ack()` / `msg.retry()` called (never both) for every message.
- [ ] `pnpm --filter @repo/workers test` green.

---

#### [wire] Task 1.3: Replace fire-and-forget + export queue handler

**Status:** pending

**Depends:** Task 1.1, Task 1.2

Replace the `waitUntil(fetch(…))` block in `message.ts` with
`env.DELIVERY_QUEUE.send()` and export the queue handler from `index.ts`.

**Files:**

- Modify: `apps/workers/src/routes/message.ts`
- Modify: `apps/workers/src/index.ts`

**Steps (TDD):**

1. In `message.ts`, replace lines 69-79:
   ```ts
   // was: c.executionCtx.waitUntil(fetch(queue.pushEndpoint, …))
   if (queue.pushEndpoint) {
     await c.env.DELIVERY_QUEUE.send({
       messageId: message.id,
       queueId,
       pushEndpoint: queue.pushEndpoint,
       attempt: 0,
     });
   }
   ```
2. In `index.ts`, change the default export from `export default app` to:

   ```ts
   import { handleDeliveryBatch } from "./consumers/deliveryConsumer";

   export default {
     fetch: app.fetch,
     queue: handleDeliveryBatch,
   };
   ```

3. Run: `pnpm --filter @repo/workers test` — full suite green.
4. Run: `pnpm --filter @repo/workers check-types` — zero errors.

**Acceptance:**

- [ ] No `waitUntil(fetch(…))` pattern remains in `routes/message.ts`.
- [ ] `index.ts` exports `{ fetch, queue }` object.
- [ ] All existing tests pass.

---

## Verification Gates

| Gate           | Command                                   | Success Criteria |
| -------------- | ----------------------------------------- | ---------------- |
| Types          | `pnpm --filter @repo/workers check-types` | Zero errors      |
| Lint           | `pnpm --filter @repo/workers lint`        | Zero violations  |
| Tests          | `pnpm --filter @repo/workers test`        | All suites green |
| Deploy dry-run | `pnpm --filter @repo/workers build`       | Exit 0           |

## Cross-Plan References

| Type       | Blueprint                    | Relationship                                                                  |
| ---------- | ---------------------------- | ----------------------------------------------------------------------------- |
| Downstream | `durable-objects-fan-out`    | DO fan-out hooks into the queue consumer after delivery ack                   |
| Downstream | `analytics-engine-telemetry` | Delivery events (ack/retry) are written to Analytics Engine from the consumer |

## Edge Cases and Error Handling

| Edge Case                              | Risk   | Solution                                                                                 | Task |
| -------------------------------------- | ------ | ---------------------------------------------------------------------------------------- | ---- |
| `pushEndpoint` is empty string         | Medium | Guard: only enqueue if `queue.pushEndpoint` is truthy                                    | 1.3  |
| Duplicate delivery (at-least-once)     | Medium | Consumer must be idempotent; push receivers should tolerate duplicates. Document in ADR. | 1.2  |
| Fetch timeout exceeds Worker CPU limit | Low    | `AbortSignal.timeout(10_000)` caps each attempt at 10 s                                  | 1.2  |

## Non-goals

- WebSocket fan-out to connected clients (handled by `durable-objects-fan-out`).
- Delivery analytics / observability (handled by `analytics-engine-telemetry`).
- Provisioning the `delivery-queue` Cloudflare resource (handled by Pulumi infra).

## Risks

| Risk                                               | Impact | Mitigation                                                             |
| -------------------------------------------------- | ------ | ---------------------------------------------------------------------- |
| `delivery-queue` not yet provisioned in Pulumi     | High   | Queue must exist before wrangler deploy; add to `infra/src/resources/` |
| Duplicate delivery to idempotent-unaware consumers | Medium | Document; add `messageId` to payload as idempotency key                |

## Technology Choices

| Component     | Technology | Version     | Why                                       |
| ------------- | ---------- | ----------- | ----------------------------------------- |
| Message queue | CF Queues  | CF platform | At-least-once, DLQ, batching — zero infra |
