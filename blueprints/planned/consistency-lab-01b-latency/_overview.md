---
type: blueprint
status: planned
complexity: M
created: "2026-04-24"
last_updated: "2026-04-24"
progress: "Refined 2026-04-24 (tech + codebase + adversarial agents); 0% implementation"
depends_on:
  - consistency-lab-core
tags:
  - lab
  - scenario
  - latency
  - cost
  - cf-queues
  - postgres
  - hyperdrive
  - durable-objects
---

# Consistency Lab — Scenario 1b: Latency across delivery paths

**Goal:** Implement the second consistency-lab scenario. Same 10,000-message
workload runs through the same three delivery paths as scenario 1a, but this
time the lab reports per-path **p50 / p95 / p99 latency, cost-per-million
(derived from CF pricing), and throughput under contention**. This is Lane C,
parallel with Lane B (scenario 1a).

## Planning Summary

- **Why now:** Scenario 1a focuses on correctness (ordering / duplicates).
  Scenario 1b covers the other load-bearing axis a staff engineer cares about
  — how fast, how expensive, and how does the path behave under contention.
  Split surfaced in design review to make each scenario's story tight.
- **Scope:** Three latency-focused `ScenarioRunner` implementations
  (`CfQueuesLatencyPath`, `PgPollingLatencyPath`,
  `PostgresDirectNotifyLatencyPath`) hosted by `S1bRunnerDO` (F-04: alarm-
  chunked batches; CPU budget doesn't permit one-request execution),
  end-to-end latency measurement (send timestamp → recv timestamp), per-
  path cost summary driven by `PricingTable` (consumed from `@repo/lab-core`
  — F-10, this blueprint no longer creates it), per-path `Histogram`
  (also consumed from Lane A), and a per-path summary emitter. Shares
  workload schema with 1a but measures different events. Dedicated CF
  Queues queue `lab-s1b-cf-queues` (+ DLQ) separate from s1a (F-3T: one
  consumer per queue).
- **Out of scope:** The HTTP route (Lane D). Correctness metrics (Lane B).
  UI rendering (Lane D). Comparison with non-CF platforms (future scenario).
- **Primary success metric:** Fresh run on a Neon branch with the **default
  1k-message workload, sequential paths** (F-04, F-07; 10k and parallel-
  stress are overrides) produces a reproducible latency summary: p50 / p95 /
  p99 per path, cost-per-million estimate per path (from `PricingTable`
  with current `effectiveDate`), and the summary is reproducible within
  ±15% across three seeded consecutive runs.

## Architecture Overview

```text
POST /lab/s1b/run  (sessionId created by shell in Lane D)
       │
       ▼
 S1bRunner.run(sessionId)  [this blueprint]
       │
       ├──▶ CfQueuesLatencyPath       ── send(t0) → recv(t1) → latency = t1 - t0
       ├──▶ PgPollingLatencyPath      ── insert(t0) → select(t1) → latency = t1 - t0
       └──▶ PostgresDirectNotifyLatencyPath ── insert+notify(t0) → subscriber DO(t1)  [direct TCP, bypasses Hyperdrive]
       │
       ▼
 per-path summarize:
    delivered        = count
    p50, p95, p99    = histogram of (t1 - t0)
    throughput       = delivered / wall_time
    cost_per_million = pricing_table.cost(path, delivered) * 1e6 / delivered
    status           = OK | PARTIAL | FAILED
       │
       ▼
 emit ScenarioEvent(run_completed, summary) via TelemetryCollector
```

## Key Decisions

| Decision          | Choice                                                            | Rationale                                                                                  | Finding             |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------- |
| Runner hosting    | `S1bRunnerDO` Durable Object, alarm-chunked batches of 100        | Worker CPU cap; one-request can't drive 10k messages with measurement overhead             | F-04                |
| Default workload  | 1,000 messages (10k as override)                                  | Histograms are stable at 1k; CF cost down 10x for routine runs                             | F-04                |
| Path run mode     | **Sequential by default** (`mode: "parallel"` as stress override) | Parallel shares Hyperdrive pool across paths; p99 correlation contaminates measurement     | F-07                |
| Latency clock     | `Date.now()` (ms), server-side both ends                          | Sub-ms precision not needed; clocks co-located on CF                                       | —                   |
| Histogram backend | Inline t-digest impl from `@repo/lab-core` (Task 1.7)             | `@thi.ng/tdigest` was a fabricated package per source verification; inline impl is primary | F-10, F11T-reversed |
| Cost calc         | `PricingTable` from `@repo/lab-core` (Task 1.7)                   | Single source of truth; pinned `effectiveDate`; 90-day staleness warning                   | F-10                |
| Queue topology    | Dedicated `lab-s1b-cf-queues` (+ DLQ)                             | CF Queues: one consumer per queue (cannot share with s1a or prod)                          | F-3T                |
| Reproducibility   | Three seeded runs; assert ±15% variance                           | Detects flake before users see it                                                          | —                   |

## Quick Reference (Execution Waves)

| Wave              | Tasks                 | Dependencies           | Parallelizable                   | Effort |
| ----------------- | --------------------- | ---------------------- | -------------------------------- | ------ |
| **Wave 0**        | 3.2, 3.3, 3.4         | `consistency-lab-core` | **3 agents** (independent files) | S-M    |
| **Wave 1**        | 3.5, 3.6              | 3.2, 3.3, 3.4          | 2 agents                         | S-M    |
| **Wave 2**        | 3.7                   | 3.6                    | 1 agent                          | XS     |
| **Critical path** | 3.2 → 3.5 → 3.6 → 3.7 | 4 waves                | —                                | M      |

**Worktree:** `.worktrees/consistency-lab-01b-latency/` on branch `pll/consistency-lab-01b-latency`. Parallel with 1a; both are **read-only consumers** of `@repo/lab-core` after Lane A's interface is frozen (F-10). Previous Task 3.1 (Histogram + PricingTable) **removed** — it was writing into `@repo/lab-core` and broke the Lane B/C parallel-independence claim; moved to Lane A Task 1.7.

### Parallel Metrics Snapshot

| Metric | Formula / Meaning                  | Target | Actual             |
| ------ | ---------------------------------- | ------ | ------------------ |
| RW0    | Ready tasks in Wave 0              | ≥ 3    | 3 ✓                |
| CPR    | total_tasks / critical_path_length | ≥ 1.5  | 6 / 4 = **1.5** ✓  |
| DD     | dependency_edges / total_tasks     | ≤ 2.0  | 7 / 6 = **1.17** ✓ |
| CP     | same-file overlaps per wave        | 0      | 0 ✓                |

**Parallelization score: B** — Wave 0 starts three paths in parallel immediately. Like 1a, the aggregator/runner chain imposes a 4-wave critical path.

### Phase 1: Three latency paths [Complexity: M]

**Note:** Histogram + PricingTable are consumed from `@repo/lab-core` (Lane A Task 1.7); this blueprint previously created them in Phase 1 but that was moved (F-10). Phase numbering stays at 3.x for reader continuity with earlier drafts.

#### [cf] Task 3.2: `CfQueuesLatencyPath` + dedicated queue + consumer (F-3T, F-04)

**Status:** pending

**Depends:** `consistency-lab-core` (Tasks 1.1, 1.2, 1.7 — Histogram + PricingTable)

Measure CF Queues end-to-end latency: producer enqueues batches at `t0`,
consumer records `t1` on receive, path emits `message_delivered` with
`latency_ms`. Uses a **dedicated queue `lab-s1b-cf-queues`** (+ DLQ
`lab-s1b-cf-queues-dlq`) distinct from s1a's queue and from production's
`DELIVERY_QUEUE` (F-3T: one consumer per queue). Default workload 1k;
10k as override.

**Files:**

- Create: `apps/lab/scenarios/s1b-latency/src/cf-queues.ts` (producer)
- Create: `apps/lab/scenarios/s1b-latency/src/cf-queues-consumer.ts` (consumer handler)
- Create: `apps/lab/scenarios/s1b-latency/src/cf-queues.test.ts`
- Create: `apps/lab/scenarios/s1b-latency/src/cf-queues-consumer.test.ts`

**Steps (TDD):**

1. Test on miniflare with dedicated queue: 1k messages delivered; histogram has 1k samples; p50/p95/p99 reported
2. Test: consumer panic surfaces `path_failed` event with reason
3. Run: FAIL → implement → PASS

**Acceptance:**

- [ ] Queue binding `LAB_S1B_QUEUE` declared in wrangler.toml (Lane D wires it)
- [ ] Producer + consumer exported from package barrel
- [ ] p99 under 1s on miniflare baseline
- [ ] `path_failed` with concrete reason on consumer panic

---

#### [pg] Task 3.3: `PgPollingLatencyPath`

**Status:** pending

**Depends:** `consistency-lab-core` (Tasks 1.1, 1.7)

Measure Postgres polling latency: `INSERT` with `inserted_at = now()`, poller
`SELECT`s new rows and records `recv_at = now()` server-side, latency is
`recv_at - inserted_at`. Poll interval configurable (default 100ms) —
poll interval directly affects p99 and is part of the honest story.

**Files:**

- Create: `apps/lab/scenarios/s1b-latency/src/pg-polling.ts`
- Create: `apps/lab/scenarios/s1b-latency/src/pg-polling.test.ts`

**Steps (TDD):**

1. Test on Neon branch: 10k inserts + polling → 10k latencies recorded
2. Test: p50 is close to `poll_interval / 2`, p99 is close to `poll_interval` (sanity: polling is the dominant latency contributor)
3. FAIL → implement → PASS

**Acceptance:**

- [ ] Poll interval configurable
- [ ] p50 within the expected band for configured interval
- [ ] `path_failed` on Hyperdrive error

---

#### [nfy] Task 3.4: `PostgresDirectNotifyLatencyPath` — **bypasses Hyperdrive** (F1T-reversed)

**Status:** pending

**Depends:** `consistency-lab-core` (Tasks 1.1, 1.7), probe p01 `CONFIRMED`

**Renamed from `HyperdriveNotifyLatencyPath`.** Probe p01 confirmed
Hyperdrive does not support LISTEN/NOTIFY. The latency path instead
measures a direct Postgres TCP connection from a Durable Object using
the Workers `connect()` API. Hyperdrive is bypassed for the subscriber
(producer can still use Hyperdrive for the one-shot `INSERT + NOTIFY`).
The latency contribution of that design choice is itself a number worth
showing.

Measure Hyperdrive `LISTEN/NOTIFY` latency: subscriber connected first, then
`INSERT` + `NOTIFY`. Latency = `recv_at - insert_at`. Simulates one
subscriber disconnect at msg 4000 (same as 1a) but here the measurement is
"how long does the reconnect cost you on the tail?".

**Files:**

- Create: `apps/lab/scenarios/s1b-latency/src/pg-direct-notify.ts`
- Create: `apps/lab/scenarios/s1b-latency/src/pg-direct-notify.test.ts`

**Steps (TDD):**

1. Test on Neon branch: full 10k latencies under 500ms p99 without reconnect
2. Test: with reconnect simulation, p99 includes the reconnect window (honest reporting, not hidden)
3. FAIL → implement → PASS

**Acceptance:**

- [ ] Reconnect behavior visible as a p99 tail, not silently smoothed
- [ ] Subscriber survives the reconnect

---

### Phase 2: Aggregation [Complexity: S]

#### [aggregate] Task 3.5: Per-path summary

**Status:** pending

**Depends:** 3.2, 3.3, 3.4

Implement `summarize(path)` → `{ delivered, p50, p95, p99, throughputPerSec,
costPerMillion, pricingEffectiveDate, pricingStaleWarning, status }`. Uses
`Histogram` and `PricingTable` from `@repo/lab-core` (Lane A Task 1.7).

**Files:**

- Create: `apps/lab/scenarios/s1b-latency/src/summarize.ts`
- Create: `apps/lab/scenarios/s1b-latency/src/summarize.test.ts`

**Steps (TDD):**

1. Test: fixture of 1000 fake latencies + known send counts → expected p50/p95/p99/cost
2. FAIL → implement → PASS

**Acceptance:**

- [ ] 100% line coverage on `summarize.ts`
- [ ] Cost annotation includes `pricingEffectiveDate` and `pricingSource`

---

#### [runner] Task 3.6: `S1bRunnerDO` Durable Object (F-04)

**Status:** pending

**Depends:** 3.5

Top-level runner hosted in a Durable Object — same alarm-chunked pattern
as `S1aRunnerDO`. Default mode `"sequential"` (paths run one after another,
avoiding Hyperdrive-pool contention that would contaminate p99 — F-07);
`"parallel"` available as explicit stress override. Emits final
`run_completed` event with three-path latency summary. Respects `abort()`.

**Files:**

- Create: `apps/lab/scenarios/s1b-latency/src/runner-do.ts`
- Create: `apps/lab/scenarios/s1b-latency/src/runner-do.test.ts`
- Create: `apps/lab/scenarios/s1b-latency/src/runner-state.ts`

**Steps (TDD):**

1. Integration test on Neon branch + miniflare: three sequential runs with seeds `s1b-a`, `s1b-b`, `s1b-c` produce summaries within ±15% of each other
2. Test: `mode: "parallel"` runs all three paths simultaneously (stress); summaries labeled `mode=parallel` so a reader can tell this isn't the baseline
3. Test: abort drains CF Queue consumer, closes Hyperdrive LISTEN subscriber, releases locks
4. Test: DO CPU per tick stays well below cap across 10k-msg stress run
5. FAIL → implement → PASS

**Acceptance:**

- [ ] Default workload 1k; 10k as override
- [ ] Default mode `"sequential"`; `"parallel"` explicit
- [ ] `start()` is idempotent on re-entry
- [ ] ±15% reproducibility across three seeded runs (sequential mode)
- [ ] No orphan resources after abort

---

#### [ops] Task 3.7: Register `s1b-latency` suite in `agent-kit.config.ts` (F-008C)

**Status:** pending

**Depends:** 3.6

Register the scenario 1b integration suite with the root
`agent-kit.config.ts` so `pnpm exec ak e2e --suite s1b-latency` runs the
end-to-end test. Auto-skips with `SKIP_REASON=shell-not-wired` until
Lane D shell ships.

**Files:**

- Modify: `agent-kit.config.ts` (add suite entry pointing at the test dir)
- Create: `apps/lab/scenarios/s1b-latency/test/e2e/full-run.test.ts`

**Steps (TDD):**

1. `pnpm exec ak e2e --suite s1b-latency --print-command` emits valid command
2. E2E runs against shell when available; otherwise skips cleanly

**Acceptance:**

- [ ] `ak e2e --suite s1b-latency` is discoverable
- [ ] Test is marked skipped until Lane D merges
- [ ] No false-red in CI before Lane D ships

---

## Verification Gates

| Gate        | Command                                 | Success Criteria                                                                         |
| ----------- | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| Type safety | `pnpm --filter s1b-latency check-types` | Zero errors                                                                              |
| Lint        | `pnpm --filter s1b-latency lint`        | Zero violations                                                                          |
| Unit        | `pnpm --filter s1b-latency test`        | All suites pass                                                                          |
| Integration | `pnpm exec ak e2e --suite s1b-latency`  | Three-seeded-run ±15% stability in sequential mode; skipped before Lane D ships (F-008C) |

## Cross-Plan References

| Type       | Blueprint                         | Relationship                                                                                                                    |
| ---------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Upstream   | `consistency-lab-core`            | **Read-only consumer** of runner contract, lock, gauge, schema, Histogram, PricingTable (F-10: previously wrote to core; moved) |
| Peer       | `consistency-lab-01a-correctness` | Parallel; independent files                                                                                                     |
| Downstream | `consistency-lab-shell`           | Mounts this scenario under `/lab/s1b-latency`                                                                                   |

## Edge Cases and Error Handling

| Edge Case                           | Risk                    | Solution                                   | Task                       | Finding |
| ----------------------------------- | ----------------------- | ------------------------------------------ | -------------------------- | ------- |
| Worker CPU cap                      | Partial run             | DO with alarm-chunked batches              | 3.6                        | F-04    |
| Parallel-mode pool contention       | Correlated p99          | Default sequential; label mode in summary  | 3.6                        | F-07    |
| CF Queues consumer conflict         | Can't ship              | Dedicated `lab-s1b-cf-queues` queue        | 3.2                        | F-3T    |
| Hyperdrive LISTEN connection budget | Path cannot run         | `path_failed` with reason                  | 3.4                        | F1T     |
| Clock skew between send and recv    | Negative latencies      | Clamp to zero, log anomaly                 | 3.2, 3.3, 3.4              | —       |
| Pricing table out of date           | Misleading cost numbers | `effectiveDate` + 90-day staleness warning | 3.5 (uses Lane A Task 1.7) | F9T     |
| Polling interval mismatch           | Suspicious p99          | Poll interval printed in summary           | 3.3                        | —       |
| AK suite runs before shell exists   | Red CI                  | Skip with `SKIP_REASON=shell-not-wired`    | 3.7                        | F-008C  |

## Non-goals

- No HTTP route (Lane D)
- No HTML rendering (Lane D)
- No cross-platform comparison (future scenario)
- No correctness / ordering metrics (Lane B)
- No `Histogram` / `PricingTable` implementation here — moved to Lane A (F-10)

## Refinement Summary (2026-04-24)

| Finding | Severity | Fix                                                                     | Applied in                   |
| ------- | -------- | ----------------------------------------------------------------------- | ---------------------------- |
| F-04    | CRITICAL | Runner moves to `S1bRunnerDO`; default workload 1k, alarm-chunked       | Task 3.6                     |
| F-3T    | CRITICAL | Dedicated `lab-s1b-cf-queues` queue + consumer                          | Task 3.2                     |
| F-07    | HIGH     | Default sequential path mode; parallel explicit                         | Task 3.6, Key Decisions      |
| F-10    | HIGH     | Removed Task 3.1 (Histogram + PricingTable); moved to Lane A            | Phase 1 structure, Non-goals |
| F-008C  | HIGH     | Task 3.7 registers e2e suite in `agent-kit.config.ts`                   | New Task 3.7                 |
| F1T     | MEDIUM   | Hyperdrive LISTEN connection-budget caveat; `path_failed` on exhaustion | Task 3.4                     |
| F9T     | MEDIUM   | 90-day pricing-staleness warning                                        | Task 3.5                     |

Parallelization score: **B** (RW0=3, CPR=1.5, DD=1.17, CP=0).

## Risks

| Risk                                     | Impact             | Mitigation                                                        |
| ---------------------------------------- | ------------------ | ----------------------------------------------------------------- |
| CF pricing changes                       | Cost numbers drift | Pin pricing effective date; surface staleness in UI               |
| Neon branch cold-start latency skews p50 | Unfair comparison  | Warm up each path with 100 messages before the measurement window |
| Histogram precision at tail              | p99 drift          | TDigest chosen for tail accuracy; test locks ±2% on p99           |

## Technology Choices

| Component | Technology                | Version           | Why                       |
| --------- | ------------------------- | ----------------- | ------------------------- |
| Histogram | TDigest (pure JS)         | pinned in catalog | Zero deps; accurate tails |
| DB        | Postgres via Hyperdrive   | current           | Repo standard             |
| Queue     | CF Queues                 | current           | Repo standard             |
| Test      | Vitest + miniflare + Neon | catalog           | Repo standard             |
