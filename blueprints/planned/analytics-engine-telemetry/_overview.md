---
type: blueprint
status: planned
complexity: S
created: "2026-04-22"
last_updated: "2026-04-22"
progress: "0% (refined)"
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
delivery attempt to Cloudflare Analytics Engine, enabling per-queue delivery
metrics without adding a separate metrics service.

## Planning Summary

- **Why now:** Once `cf-queues-delivery` lands, every outbound delivery attempt
  passes through one chokepoint: the queue consumer.
- **Scope:** One Analytics Engine binding, one small telemetry helper, and one
  consumer integration.
- **Out of scope:** Dashboards, SQL query APIs, Pipelines, and archival.

## Refinement Summary

- Removed the accidental dependency on `topicId` even though this blueprint
  only depends on `cf-queues-delivery`. `topicId` is optional telemetry, not a
  hard requirement.
- Dropped the “Pipelines later” recommendation from the blueprint body. That is
  a valid later product decision, but not part of this plan.
- Tightened the schema around delivery outcomes the repo actually has today:
  queue, message, status, latency, and attempt.

## Pre-execution audit (2026-04-22)

**Readiness:** blocked-by-upstream

**What is already true**

- `@cloudflare/workers-types` in the current workspace already exposes
  `AnalyticsEngineDataset`.
- `apps/workers/wrangler.toml` is the right place to bind the dataset once the
  consumer exists.

**Blocking gaps**

- This blueprint depends on `cf-queues-delivery`, but the queue consumer file
  does not exist yet. There is no stable instrumentation chokepoint until that
  upstream blueprint lands.
- Current tests do not cover delivery outcomes such as ack / retry / dropped,
  so telemetry assertions would be premature before the consumer path exists.

**First-build notes**

- Treat `topicId` as optional telemetry because direct queue sends do not need
  topic fan-out metadata.
- Keep telemetry best-effort and side-effect free: delivery correctness must
  not depend on Analytics Engine writes succeeding.

## Architecture Overview

```text
deliveryConsumer.ts
  → fetch(pushEndpoint)
  → ack / retry decision
  → recordDelivery(env, {
      queueId,
      messageId,
      topicId?,
      status,      // ack | retry | dropped
      latencyMs,
      attempt,
    })
  → env.ANALYTICS.writeDataPoint(...)
```

## Fact-Checked Findings

| ID  | Severity | Claim                                                                                                                    | Source                                                |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| F1  | HIGH     | Analytics Engine is available on all plans.                                                                              | Cloudflare Analytics Engine docs, fetched 2026-04-22. |
| F2  | HIGH     | Analytics Engine is designed for high-cardinality writes from Workers.                                                   | Cloudflare Analytics Engine docs, fetched 2026-04-22. |
| F3  | MEDIUM   | Analytics Engine data is queryable via SQL API.                                                                          | Cloudflare Analytics Engine docs, fetched 2026-04-22. |
| F4  | MEDIUM   | Consumer-side instrumentation is the right place because it captures the real delivery outcome, not just enqueue intent. | Repo-aware synthesis, 2026-04-22.                     |

## Key Decisions

| Decision              | Choice                                                                       | Rationale                                                    |
| --------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Instrumentation point | `apps/workers/src/consumers/deliveryConsumer.ts`                             | Single source of truth for delivery outcomes                 |
| Minimal schema        | `queueId`, `messageId`, optional `topicId`, `status`, `latencyMs`, `attempt` | Enough to answer operational questions without over-modeling |
| Failure behavior      | Best-effort telemetry only                                                   | Delivery must not fail because metrics writeback had issues  |

## Quick Reference (Execution Waves)

| Wave              | Tasks     | Dependencies | Parallelizable |
| ----------------- | --------- | ------------ | -------------- |
| **Wave 1**        | 1.1, 1.2  | None         | 2 agents       |
| **Wave 2**        | 1.3       | 1.1 + 1.2    | 1 agent        |
| **Critical path** | 1.1 → 1.3 | —            | 2 waves        |

---

### Phase 1: Binding, helper, and consumer integration [Complexity: S]

#### [config] Task 1.1: Add Analytics Engine binding + Env type

**Status:** pending

**Depends:** None

Add an Analytics Engine dataset binding and extend the Worker `Env` type.

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
2. Add `ANALYTICS: AnalyticsEngineDataset` to the `Env` type.
3. Run: `pnpm --filter @repo/workers check-types` — verify PASS.

**Acceptance:**

- [ ] `wrangler.toml` declares `ANALYTICS`
- [ ] `Env` includes `ANALYTICS: AnalyticsEngineDataset`
- [ ] `pnpm --filter @repo/workers check-types` passes

---

#### [helper] Task 1.2: Create `recordDelivery` helper

**Status:** pending

**Depends:** None

Create a tiny helper that wraps `writeDataPoint` and is easy to mock in tests.

**Files:**

- Create: `apps/workers/src/telemetry.ts`
- Create: `apps/workers/src/tests/telemetry.test.ts`

**Steps (TDD):**

1. Write `telemetry.test.ts` to assert `recordDelivery()` calls
   `env.ANALYTICS.writeDataPoint()` with the expected schema.
2. Run: `pnpm --filter @repo/workers test` — verify FAIL.
3. Implement `recordDelivery()` using a schema like:
   - `blobs: [queueId, messageId, status, topicId ?? ""]`
   - `doubles: [latencyMs, attempt]`
   - `indexes: [queueId]`
4. Run: `pnpm --filter @repo/workers test` — verify PASS.
5. Run: `pnpm --filter @repo/workers lint` — verify PASS.

**Acceptance:**

- [ ] `recordDelivery()` is isolated in `telemetry.ts`
- [ ] `topicId` is optional, not required
- [ ] `pnpm --filter @repo/workers test` is green

---

#### [wire] Task 1.3: Hook telemetry into the delivery consumer

**Status:** pending

**Depends:** Task 1.1, Task 1.2

Call `recordDelivery()` from `deliveryConsumer.ts` after every terminal
consumer decision.

**Files:**

- Modify: `apps/workers/src/consumers/deliveryConsumer.ts`
- Modify: `apps/workers/src/tests/deliveryConsumer.test.ts`

**Steps (TDD):**

1. Update `deliveryConsumer.test.ts` to assert telemetry is recorded for:
   - `ack`
   - `retry`
   - `dropped` (missing DB row)
2. Run: `pnpm --filter @repo/workers test` — verify FAIL.
3. Call `recordDelivery()` with `latencyMs` and `attempt` after each outcome.
4. Run: `pnpm --filter @repo/workers test` — verify PASS.
5. Run: `pnpm --filter @repo/workers check-types` — verify PASS.

**Acceptance:**

- [ ] Every consumer outcome records telemetry
- [ ] `latencyMs` is measured from before fetch to outcome decision
- [ ] Full targeted tests pass

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
| Upstream | `cf-queues-delivery` | The consumer introduced there is the telemetry hook point |

## Edge Cases and Error Handling

| Edge Case                                  | Risk   | Solution                                                               | Task |
| ------------------------------------------ | ------ | ---------------------------------------------------------------------- | ---- |
| `topicId` is absent for direct queue sends | Low    | Record an empty string / optional value rather than blocking telemetry | 1.2  |
| Metrics writeback throws                   | Medium | Swallow telemetry failure after logging; do not fail delivery behavior | 1.3  |

## Non-goals

- Dashboard UI
- SQL query endpoints
- Pipelines
- Long-term archival

## Risks

| Risk                                     | Impact | Mitigation                                                          |
| ---------------------------------------- | ------ | ------------------------------------------------------------------- |
| Over-modeling the event schema too early | Low    | Keep the first schema intentionally small and operationally focused |

## Technology Choices

| Component          | Technology                  | Version     | Why                                                                    |
| ------------------ | --------------------------- | ----------- | ---------------------------------------------------------------------- |
| Delivery telemetry | Cloudflare Analytics Engine | CF platform | Native Worker-side metrics ingestion without additional infrastructure |
