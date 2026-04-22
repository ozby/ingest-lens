---
type: blueprint
status: completed
complexity: M
created: "2026-04-22"
last_updated: "2026-04-22"
progress: "100%"
depends_on: [workers-hono-port, cloudflare-pulumi-infra]
tags:
  - cloudflare-workers
  - queues
  - reliability
  - delivery
---

# CF Queues delivery

**Goal:** Replace the fire-and-forget `waitUntil(fetch(pushEndpoint))`
delivery in both `apps/workers/src/routes/message.ts` and
`apps/workers/src/routes/topic.ts` with Cloudflare Queues, explicit consumer
ack / retry behavior, and a dead-letter queue.

## Planning Summary

- **Why now:** The current Worker silently drops failed push deliveries in both
  direct queue sends and topic publish fan-out.
- **Scope:** One producer binding, one consumer configuration, one queue
  consumer module, and route wiring for both message-send and topic-publish
  paths.
- **Out of scope:** WebSocket fan-out, replay cursors, and long-running
  recovery workflows.

## Refinement Summary

- Expanded the blueprint beyond `routes/message.ts` to also cover
  `routes/topic.ts`, which currently performs the same fire-and-forget push
  pattern.
- Removed the inaccurate promise that this blueprint introduces an external
  idempotency cache. It does not. It preserves at-least-once delivery and uses
  `messageId` as the receiver-visible dedupe key.
- Corrected the consumer design so it **rehydrates the persisted message from
  Postgres by `messageId`** before POSTing to the subscriber. The queue payload
  should remain a compact envelope, not become the message body.
- Added optional `topicId` to the delivery envelope now, so later blueprints do
  not need to break the queue contract just to enable fan-out / replay.

## Pre-execution audit (2026-04-22)

**Readiness:** ready-next

**What is already true**

- The two target fire-and-forget delivery paths are real and present today in
  `apps/workers/src/routes/message.ts` and `apps/workers/src/routes/topic.ts`.
- `@cloudflare/workers-types` in the current workspace already exposes
  `Queue<Body>`.
- The repo already persists canonical message rows in Postgres via Hyperdrive,
  so the consumer can rehydrate by `messageId` without adding a new store.

**Main gaps before implementation**

- `apps/workers/wrangler.toml` has no queue bindings yet, and there is no
  generated binding file in the workspace today.
- `infra/` currently provisions Hyperdrive, KV, R2, routes, and custom domain,
  but does not yet codify Queue resources. Treat queue provisioning as a deploy
  prerequisite for this blueprint.
- The workspace has no `deliveryConsumer.ts` or `message.test.ts` yet, so the
  first TDD pass must create both rather than assuming they already exist.

**First-build notes**

- Replace the fire-and-forget push path in both route files in the same wave.
- Keep the queue payload compact and rehydrate the full message row in the
  consumer to preserve the current subscriber-visible body shape.
- Export the Worker entrypoint as `{ fetch, queue }` only after the consumer
  exists and targeted tests cover the new shape.

## Architecture Overview

```text
before:
  POST /api/messages/:queueId
    → insert message row
    → waitUntil(fetch(pushEndpoint, body = message)))

  POST /api/topics/:topicId/publish
    → insert N message rows
    → waitUntil(fetch(pushEndpoint, body = message))) for each subscribed queue

after:
  route handler
    → insert message row(s)
    → DELIVERY_QUEUE.send({ messageId, queueId, pushEndpoint, topicId?, attempt: 0 })

  delivery consumer
    → load canonical message row from Postgres by messageId
    → fetch(pushEndpoint, body = message row)
    → msg.ack() on 2xx
    → msg.retry({ delaySeconds }) on non-2xx / network failure
    → DLQ after configured retry limit
```

## Fact-Checked Findings

| ID  | Severity | Claim                                                                                | Source                                                           |
| --- | -------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| F1  | HIGH     | Cloudflare Queues deliver messages at least once.                                    | Cloudflare Queues docs, fetched 2026-04-22.                      |
| F2  | HIGH     | A consumer can use explicit per-message `ack()` / `retry()` behavior.                | Cloudflare Queues docs, fetched 2026-04-22.                      |
| F3  | HIGH     | DLQ support is first-class and messages move there after the configured retry limit. | Cloudflare Queues DLQ docs, fetched 2026-04-22.                  |
| F4  | MEDIUM   | Consumer concurrency scales with backlog by default.                                 | Cloudflare Queues consumer concurrency docs, fetched 2026-04-22. |

## Key Decisions

| Decision                | Choice                                                                              | Rationale                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Queue payload           | Envelope with `messageId`, `queueId`, `pushEndpoint`, optional `topicId`, `attempt` | Compact envelope; DB remains the canonical message store                            |
| Retry policy            | Retry on fetch failure and non-2xx response                                         | Current webhook semantics do not distinguish permanent vs transient failures safely |
| Backoff                 | `5s, 10s, 20s, 40s, 80s`                                                            | Simple exponential backoff within a small retry budget                              |
| Body sent to subscriber | Canonical message row from Postgres                                                 | Preserves current subscriber-visible shape                                          |

## Quick Reference (Execution Waves)

| Wave              | Tasks     | Dependencies | Parallelizable |
| ----------------- | --------- | ------------ | -------------- |
| **Wave 1**        | 1.1, 1.2  | None         | 2 agents       |
| **Wave 2**        | 1.3       | 1.1 + 1.2    | 1 agent        |
| **Critical path** | 1.1 → 1.3 | —            | 2 waves        |

---

### Phase 1: Queue binding, consumer, and route wiring [Complexity: M]

#### [config] Task 1.1: Add queue bindings + delivery envelope type

**Status:** done

**Depends:** None

Add Cloudflare Queue bindings and define the shared `DeliveryPayload` type.

**Files:**

- Modify: `apps/workers/wrangler.toml`
- Modify: `apps/workers/src/db/client.ts`

**Steps (TDD):**

1. Add producer + consumer queue config to `apps/workers/wrangler.toml`:

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

2. Extend `Env` in `apps/workers/src/db/client.ts` with
   `DELIVERY_QUEUE: Queue<DeliveryPayload>`.
3. Export:
   ```ts
   export type DeliveryPayload = {
     messageId: string;
     queueId: string;
     pushEndpoint: string;
     topicId: string | null;
     attempt: number;
   };
   ```
4. Run: `pnpm --filter @repo/workers check-types` — verify PASS.

**Acceptance:**

- [x] `wrangler.toml` declares producer and consumer blocks
- [x] `DeliveryPayload` is exported from `apps/workers/src/db/client.ts`
- [x] `pnpm --filter @repo/workers check-types` passes

---

#### [consumer] Task 1.2: Create the delivery consumer

**Status:** done

**Depends:** None

Create a consumer that rehydrates the canonical message row from Postgres,
then POSTs that row to the subscriber endpoint and acks / retries explicitly.

**Files:**

- Create: `apps/workers/src/consumers/deliveryConsumer.ts`
- Create: `apps/workers/src/tests/deliveryConsumer.test.ts`
- Modify: `apps/workers/src/db/client.ts`

**Steps (TDD):**

1. Write `deliveryConsumer.test.ts` covering:
   - DB row found + `2xx` response → `msg.ack()`
   - DB row found + `5xx` response → `msg.retry({ delaySeconds })`
   - fetch throws → `msg.retry({ delaySeconds })`
   - DB row missing → `msg.ack()` (nothing left to deliver)
2. Run: `pnpm --filter @repo/workers test` — verify FAIL.
3. Implement `deliveryConsumer.ts` so it:
   - selects the message row by `messageId`
   - POSTs `JSON.stringify(message)` to `pushEndpoint`
   - uses exponential backoff based on `attempt`
4. Run: `pnpm --filter @repo/workers test` — verify PASS.
5. Run: `pnpm --filter @repo/workers lint` — verify PASS.

**Acceptance:**

- [x] The consumer loads the canonical message row before POSTing
- [x] `msg.ack()` and `msg.retry()` are mutually exclusive per message
- [x] Missing DB rows are handled explicitly rather than retried forever
- [x] `pnpm --filter @repo/workers test` is green

---

#### [wire] Task 1.3: Enqueue from both route paths and export the queue handler

**Status:** done

**Depends:** Task 1.1, Task 1.2

Replace direct push delivery in both `message.ts` and `topic.ts`, then export
`queue()` from the Worker entry point.

**Files:**

- Modify: `apps/workers/src/routes/message.ts`
- Modify: `apps/workers/src/routes/topic.ts`
- Modify: `apps/workers/src/index.ts`

**Steps (TDD):**

1. Add or update tests so direct message send and topic publish paths assert
   that `DELIVERY_QUEUE.send()` is called instead of `waitUntil(fetch(...))`.
2. Run: `pnpm --filter @repo/workers test` — verify FAIL.
3. In `routes/message.ts`, replace the fire-and-forget fetch with:
   ```ts
   await c.env.DELIVERY_QUEUE.send({
     messageId: message.id,
     queueId,
     pushEndpoint: queue.pushEndpoint,
     topicId: null,
     attempt: 0,
   });
   ```
4. In `routes/topic.ts`, enqueue one payload per created message using the
   current `topicId`.
5. In `index.ts`, export:
   ```ts
   export default {
     fetch: app.fetch,
     queue: handleDeliveryBatch,
   };
   ```
6. Run: `pnpm --filter @repo/workers test` — verify PASS.
7. Run: `pnpm --filter @repo/workers check-types` — verify PASS.

**Acceptance:**

- [x] `routes/message.ts` no longer uses `waitUntil(fetch(...))`
- [x] `routes/topic.ts` no longer uses `waitUntil(fetch(...))`
- [x] Both paths enqueue `DeliveryPayload` envelopes
- [x] `index.ts` exports `{ fetch, queue }`

---

## Verification Gates

| Gate           | Command                                   | Success Criteria |
| -------------- | ----------------------------------------- | ---------------- |
| Types          | `pnpm --filter @repo/workers check-types` | Zero errors      |
| Lint           | `pnpm --filter @repo/workers lint`        | Zero violations  |
| Tests          | `pnpm --filter @repo/workers test`        | All suites green |
| Deploy dry-run | `pnpm --filter @repo/workers build`       | Exit 0           |

## Cross-Plan References

| Type       | Blueprint                    | Relationship                                                              |
| ---------- | ---------------------------- | ------------------------------------------------------------------------- |
| Downstream | `analytics-engine-telemetry` | The queue consumer becomes the telemetry chokepoint                       |
| Downstream | `durable-objects-fan-out`    | The queue payload already carries optional `topicId` for later DO fan-out |

## Edge Cases and Error Handling

| Edge Case                                       | Risk   | Solution                                                                                | Task |
| ----------------------------------------------- | ------ | --------------------------------------------------------------------------------------- | ---- |
| `pushEndpoint` is absent                        | Low    | Do not enqueue delivery work when there is nothing to call                              | 1.3  |
| Subscriber cannot tolerate duplicate deliveries | Medium | Preserve `messageId` in the canonical message body and document at-least-once semantics | 1.2  |
| DB row was deleted before the consumer ran      | Low    | `ack()` the queue message after a missing-row lookup                                    | 1.2  |

## Non-goals

- WebSocket fan-out
- Replay cursors
- Long-running redrive orchestration

## Risks

| Risk                                                 | Impact | Mitigation                                                                 |
| ---------------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| Queue provisioning is not yet codified in infra      | Medium | Track as deployment prerequisite until infra adds explicit Queue resources |
| Subscriber-visible payload shape changes by accident | High   | Always POST the canonical DB row, not the queue envelope                   |

## Technology Choices

| Component      | Technology        | Version     | Why                                                                             |
| -------------- | ----------------- | ----------- | ------------------------------------------------------------------------------- |
| Async delivery | Cloudflare Queues | CF platform | Native at-least-once delivery, retries, and DLQ without standing infrastructure |
