---
type: blueprint
status: planned
complexity: S
created: "2026-04-22"
last_updated: "2026-04-22"
progress: "0%"
depends_on:
  - cf-queues-delivery
tags:
  - cloudflare-workers
  - analytics
  - observability
  - telemetry
---

# Analytics Engine telemetry

**Goal:** Instrument the delivery queue consumer to write one data point per
delivery attempt to Cloudflare Analytics Engine, enabling per-topic and
per-queue delivery metrics (success rate, latency, retry counts) queryable
via the Analytics Engine SQL API with zero additional infrastructure.

## Planning Summary

- **Why now:** Once `cf-queues-delivery` lands, every delivery attempt passes
  through a single consumer function. That is the ideal instrumentation point.
  Adding Analytics Engine here costs one `writeDataPoint` call per message —
  non-blocking, fire-and-forget.
- **Scope:** One `[[analytics_engine_datasets]]` binding in `wrangler.toml`;
  one `writeDataPoint` call in `deliveryConsumer.ts` on ack and on retry;
  a thin `telemetry.ts` module wrapping the call.
- **Out of scope:** Dashboard UI over the data. Analytics Engine SQL API query
  layer. Long-term archival (handled by Pipelines → R2).

## Architecture Overview

```text
Queue consumer (deliveryConsumer.ts):
  → fetch(pushEndpoint)
  → ack / retry
  → env.ANALYTICS.writeDataPoint({         ← non-blocking
      blobs: [topicId, queueId, status],    // "ack" | "retry" | "dlq"
      doubles: [latencyMs, attempt],
      indexes: [topicId],
    })
```

## Fact-Checked Findings

| ID  | Severity | Claim                                                                           | Source                                                                                          |
| --- | -------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| F1  | HIGH     | Analytics Engine is GA and available on Workers Free plan                       | CF docs: "Available on all plans"                                                               |
| F2  | HIGH     | `writeDataPoint` is non-blocking (fire-and-forget)                              | CF docs: "Add instrumentation to frequently called code paths, without impacting performance"   |
| F3  | MEDIUM   | Analytics Engine supports unlimited-cardinality writes                          | CF docs: "unlimited-cardinality analytics at scale"                                             |
| F4  | MEDIUM   | Data is queryable via SQL API using the Cloudflare API                          | CF docs: "SQL API to query that data"                                                           |
| F5  | LOW      | Analytics Engine is used internally by Cloudflare for D1/R2 per-product metrics | CF docs: "Cloudflare uses Analytics Engine internally to store and product per-product metrics" |

## Key Decisions

| Decision              | Choice                                                                               | Rationale                                       |
| --------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Instrumentation point | `deliveryConsumer.ts` after ack/retry decision                                       | Single chokepoint; covers all delivery outcomes |
| Schema                | `blobs[topicId, queueId, status]`, `doubles[latencyMs, attempt]`, `indexes[topicId]` | Minimal; queryable by topic                     |
| Non-blocking          | Yes — `writeDataPoint` is not awaited                                                | Delivery latency must not be affected           |

## Quick Reference (Execution Waves)

| Wave              | Tasks     | Dependencies | Parallelizable |
| ----------------- | --------- | ------------ | -------------- |
| **Wave 1**        | 1.1, 1.2  | None         | 2 agents       |
| **Wave 2**        | 1.3       | 1.1 + 1.2    | 1 agent        |
| **Critical path** | 1.1 → 1.3 | —            | 2 waves        |

---

### Phase 1: Binding, telemetry module, and consumer hook [Complexity: S]

#### [config] Task 1.1: Wrangler binding + Env type

**Status:** pending

**Depends:** None

Add `[[analytics_engine_datasets]]` to `wrangler.toml` and extend `Env`.

**Files:**

- Modify: `apps/workers/wrangler.toml`
- Modify: `apps/workers/src/db/client.ts`

**Steps (TDD):**

1. Add to `apps/workers/wrangler.toml`:
   ```toml
   [[analytics_engine_datasets]]
   binding = "ANALYTICS"
   dataset = "delivery_events"
   ```
2. Add `ANALYTICS: AnalyticsEngineDataset` to the `Env` type in
   `apps/workers/src/db/client.ts`.
3. Run: `pnpm --filter @repo/workers check-types` — PASS.

**Acceptance:**

- [ ] `wrangler.toml` has `[[analytics_engine_datasets]]` block.
- [ ] `Env` includes `ANALYTICS: AnalyticsEngineDataset`.
- [ ] `pnpm --filter @repo/workers check-types` passes.

---

#### [telemetry] Task 1.2: `telemetry.ts` write helper

**Status:** pending

**Depends:** None

Create a thin module with a single function that wraps `writeDataPoint`. Keeps
the consumer readable and makes the call mockable in tests.

**Files:**

- Create: `apps/workers/src/telemetry.ts`
- Create: `apps/workers/src/tests/telemetry.test.ts`

**Steps (TDD):**

1. Write `telemetry.test.ts` verifying `recordDelivery` calls
   `env.ANALYTICS.writeDataPoint` with the correct blobs/doubles/indexes.
2. Run: `pnpm --filter @repo/workers test` — FAIL.
3. Implement `telemetry.ts`:

   ```ts
   import type { Env } from "./db/client";

   export function recordDelivery(
     env: Env,
     opts: {
       topicId: string;
       queueId: string;
       status: "ack" | "retry" | "dlq";
       latencyMs: number;
       attempt: number;
     },
   ): void {
     env.ANALYTICS.writeDataPoint({
       blobs: [opts.topicId, opts.queueId, opts.status],
       doubles: [opts.latencyMs, opts.attempt],
       indexes: [opts.topicId],
     });
   }
   ```

4. Run: `pnpm --filter @repo/workers test` — PASS.
5. Run: `pnpm --filter @repo/workers lint` — PASS.

**Acceptance:**

- [ ] `recordDelivery` calls `writeDataPoint` (not `await`ed).
- [ ] Test mocks `env.ANALYTICS` and asserts correct schema.
- [ ] `pnpm --filter @repo/workers test` green.

---

#### [wire] Task 1.3: Hook `recordDelivery` into consumer

**Status:** pending

**Depends:** Task 1.1, Task 1.2

Call `recordDelivery` after every ack and retry decision in
`deliveryConsumer.ts`.

**Files:**

- Modify: `apps/workers/src/consumers/deliveryConsumer.ts`
- Modify: `apps/workers/src/tests/deliveryConsumer.test.ts`

**Steps (TDD):**

1. Add assertions to `deliveryConsumer.test.ts` that `recordDelivery` is called
   with `status: "ack"` on success and `status: "retry"` on failure.
2. Run: `pnpm --filter @repo/workers test` — FAIL.
3. In `deliveryConsumer.ts`, after `msg.ack()`:
   ```ts
   recordDelivery(env, {
     topicId: msg.body.topicId,
     queueId: msg.body.queueId,
     status: "ack",
     latencyMs: Date.now() - start,
     attempt: msg.body.attempt,
   });
   ```
   And after `msg.retry()`:
   ```ts
   recordDelivery(env, { …, status: "retry", … });
   ```
4. Run: `pnpm --filter @repo/workers test` — PASS.
5. Run: `pnpm --filter @repo/workers check-types` — zero errors.

**Acceptance:**

- [ ] `recordDelivery` called on every delivery outcome (ack and retry).
- [ ] `latencyMs` captured from start of fetch to decision.
- [ ] Full test suite green.

---

## Verification Gates

| Gate           | Command                                   | Success Criteria |
| -------------- | ----------------------------------------- | ---------------- |
| Types          | `pnpm --filter @repo/workers check-types` | Zero errors      |
| Lint           | `pnpm --filter @repo/workers lint`        | Zero violations  |
| Tests          | `pnpm --filter @repo/workers test`        | All suites green |
| Deploy dry-run | `pnpm --filter @repo/workers build`       | Exit 0           |

## Cross-Plan References

| Type     | Blueprint            | Relationship                                              |
| -------- | -------------------- | --------------------------------------------------------- |
| Upstream | `cf-queues-delivery` | Consumer from that blueprint is the instrumentation point |

## Edge Cases and Error Handling

| Edge Case                               | Risk   | Solution                                                                            | Task |
| --------------------------------------- | ------ | ----------------------------------------------------------------------------------- | ---- |
| `writeDataPoint` throws                 | Low    | It's documented as non-blocking and does not throw synchronously                    | 1.2  |
| `topicId` absent from `DeliveryPayload` | Medium | `durable-objects-fan-out` adds `topicId` to payload; this blueprint depends on that | 1.3  |

## Non-goals

- Dashboard UI over Analytics Engine data.
- Querying the SQL API (out of scope for this blueprint).
- Long-term archival to R2 (separate Pipelines blueprint if needed later).

## Risks

| Risk                                                   | Impact | Mitigation                                                                   |
| ------------------------------------------------------ | ------ | ---------------------------------------------------------------------------- |
| Analytics Engine dataset not provisioned automatically | Low    | CF creates the dataset on first `writeDataPoint` — no Pulumi resource needed |

## Technology Choices

| Component     | Technology          | Version | Why                                                   |
| ------------- | ------------------- | ------- | ----------------------------------------------------- |
| Metrics store | CF Analytics Engine | GA      | Unlimited cardinality, zero infra, free plan eligible |
