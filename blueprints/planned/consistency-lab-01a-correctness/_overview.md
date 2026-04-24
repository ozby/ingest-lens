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
  - correctness
  - ordering
  - cf-queues
  - postgres
  - hyperdrive
  - durable-objects
---

# Consistency Lab — Scenario 1a: Correctness across delivery paths

**Goal:** Implement the first consistency-lab scenario. Same 10,000-message
workload runs through three delivery paths (Cloudflare Queues, Postgres
polling with `ORDER BY`, and Postgres `LISTEN/NOTIFY` via a **direct
TCP connection from a Durable Object** — Hyperdrive does not support
LISTEN/NOTIFY, so the third path bypasses it), and the lab reports
per-path **delivered count, duplicate count, inversion count, ordering
property, and status**. This is Lane B. Produces the first screenshotable
"whoa" result of the lab.

## Planning Summary

- **Why now:** Office hours identified this as the "only this repo can ship it"
  artifact — three implementations in one repo on one message schema. Eng
  review swapped the originally-proposed DO-backed queue out for Hyperdrive
  `LISTEN/NOTIFY` (the DO-queue becomes a future blueprint). CEO review kept
  the scope tight under HOLD mode.
- **Scope:** Three `ScenarioRunner` implementations (`CfQueuesPath`,
  `PgPollingPath`, `PostgresDirectNotifyPath`), a parent runner hosted in a
  **Durable Object (`S1aRunnerDO`) that chunks the 10k-message workload
  across alarm-scheduled batches** (F-04: Workers cap CPU at 30s default /
  300s paid; a single request cannot drive 10k messages inside one CPU
  budget), and the per-path assertion logic (inversion counting, duplicate
  detection, ordering-property classification). Data lives in `lab.runs`,
  scoped by `sessionId`. Paths run **sequentially by default** (F-07:
  parallel fan-out shares the Hyperdrive pool across paths and contaminates
  measurements); a `mode: "parallel"` option exposes the stress-test
  variant. CF Queues path uses a **dedicated queue `lab-s1a-cf-queues`**
  with its own consumer Worker (F-3T: CF Queues allows one consumer per
  queue; the production `DELIVERY_QUEUE` is owned by `@repo/workers` and
  cannot be reused).
- **Out of scope:** Any HTTP route (Lane D). Any UI (Lane D). Latency / cost
  metrics (Lane C). The HTML rendering of the result table (Lane D). The
  `Histogram` / `PricingTable` primitives — moved to Lane A per F-10.
- **Primary success metric:** Running the scenario against a fresh Neon
  branch with the **default 1k-message workload** (F-04: 10k is available as
  a stress override) produces a summary that, across **three seeded trials
  with the same RNG seed** (F-14), is stable — at least two of three trials
  must show CF Queues inversions > 0 (probabilistic but overwhelmingly
  likely at 1k+ messages), Postgres polling showing 0 inversions and 0
  duplicates, LISTEN/NOTIFY showing low inversions and bounded reconnect
  drops.

## Architecture Overview

```text
POST /lab/s1a/run  (sessionId, cookie issued by shell Lane D)
       │
       ▼
 S1aRunnerDO.start(sessionId, workloadSize=1000, seed=<rng-seed>, mode="sequential")
       │       (runner lives in a Durable Object — F-04 CPU budget)
       │
       ▼
 for each path in [CfQueues, PgPolling, PostgresDirectNotify]:
   ├─ setAlarm(+50ms) ──▶ send next batch of 100 msgs ──▶ setAlarm(+50ms) ──▶ ...
   │                     (~100 alarm ticks × 100 msgs = 10k, each tick << CPU cap)
   │
   ├─ CfQueuesPath       ── enqueue batch ──▶ lab-s1a-cf-queues (dedicated queue, F-3T)
   │                                                    │
   │                                                    ▼  consumer Worker
   │                                                    write lab.runs with session_id, seq, recv_order
   │
   ├─ PgPollingPath      ── INSERT batch ──▶ lab.runs (session_id scoped)
   │                               │
   │                               └── SELECT ... WHERE session_id=? ORDER BY inserted_at, seq
   │                                                    │
   │                                                    ▼ record recv_order
   │
   └─ PostgresDirectNotifyPath ── INSERT + NOTIFY ──▶ subscriber DO (direct TCP connection, bypasses Hyperdrive; F1T-reversed)
                                                                │
                                                                ▼ record recv_order
       │
       ▼
 summarize per path:
    delivered  = count(distinct msg_id WHERE session_id=?)
    duplicates = count(msg_id) - delivered
    inversions = count(pairs where recv_order[i] > recv_order[j] for i<j)
    ordering   = classify(inversions, duplicates)
    status     = OK | PARTIAL | FAILED
       │
       ▼
 emit ScenarioEvent(run_completed, summary) via TelemetryCollector
       │
       ▼
 SessionLock.release() → LabConcurrencyGauge.release()
```

## Key Decisions

| Decision                                          | Choice                                                                                                                                                                                                                                                      | Rationale                                                                                                                                                                                                                                                                           | Finding           |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Runner hosting                                    | `S1aRunnerDO` (Durable Object, alarm-chunked batches of 100)                                                                                                                                                                                                | Worker CPU cap (30s default / 300s paid) cannot drive 10k msgs in one request                                                                                                                                                                                                       | F-04              |
| Default workload                                  | **1,000 messages** (10k as `workloadSize` stress option)                                                                                                                                                                                                    | Probabilistic results stabilize well below 10k; cost + time down 10x                                                                                                                                                                                                                | F-04              |
| Path run mode                                     | **Sequential by default**, `mode: "parallel"` is explicit stress                                                                                                                                                                                            | Parallel shares Hyperdrive pool across paths and contaminates p99                                                                                                                                                                                                                   | F-07              |
| Queue topology                                    | Dedicated `lab-s1a-cf-queues` queue + consumer                                                                                                                                                                                                              | Each queue binds to a single consumer Worker at the wrangler.toml level (multiple concurrent _invocations_ are fine — up to 250 per CF docs — but there is one consumer Worker per queue in the binding model); dedicated lab queues isolate lab traffic from prod `DELIVERY_QUEUE` | F-3T-softened     |
| Third path: direct PG connection (NOT Hyperdrive) | Subscriber DO opens `connect()`-based TCP to Postgres; Hyperdrive docs explicitly state LISTEN/NOTIFY is unsupported (probe p01 docs-check). `@neondatabase/serverless` was considered and ruled out: its README and docs do not mention LISTEN (probe p12) | Makes the Hyperdrive limitation part of the scenario's finding, not a hidden assumption; `connect()` is the only documented path that holds a long-lived LISTEN                                                                                                                     | F1T-reversed, p12 |
| NOTIFY payload ceiling                            | Per-message payload kept well under 2000 bytes; Postgres caps at 8000 (probe p16). Schema encodes to ~160 bytes                                                                                                                                             | Leaves generous headroom for future scenarios that share the NOTIFY path                                                                                                                                                                                                            | p16               |
| Subrequest budget per alarm tick                  | ≤ 1000 per Worker request on paid tier (probe p13). Default 100-msg batches × 2 subrequests/msg = 200/tick                                                                                                                                                  | Prevents runner DO from hitting the subrequest cap under any realistic workload                                                                                                                                                                                                     | p13               |
| RNG seeding                                       | Test fixture seed; production runs use a recorded seed per run                                                                                                                                                                                              | Reproducible trials + flake resistance                                                                                                                                                                                                                                              | F-14              |
| Message schema                                    | `{ msg_id: uuid, seq: int, session_id: uuid, payload: string(64) }`                                                                                                                                                                                         | `seq` is ground truth; `session_id` scopes queries                                                                                                                                                                                                                                  | —                 |
| Inversion metric                                  | Kendall-tau count: pairs `(i, j)` where `send_seq[i] < send_seq[j]` but `recv_order[i] > recv_order[j]`                                                                                                                                                     | Standard correctness metric                                                                                                                                                                                                                                                         | —                 |
| Hyperdrive subscriber reconnect                   | Simulated disconnect between batch 40 and 50; drops counted, not hidden                                                                                                                                                                                     | Surfaces LISTEN/NOTIFY's documented reconnect-drop property honestly                                                                                                                                                                                                                | —                 |
| Failure semantics                                 | Per-path FAILED; other paths continue                                                                                                                                                                                                                       | Partial results are valid and informative                                                                                                                                                                                                                                           | —                 |
| Admin bypass                                      | Heartbeat (Lane E) calls `S1aRunnerDO.start()` directly with admin token; concurrency + lock bypassed                                                                                                                                                       | Keeps heartbeat isolated from user traffic                                                                                                                                                                                                                                          | F-06              |

## Quick Reference (Execution Waves)

| Wave              | Tasks                       | Dependencies           | Parallelizable                   | Effort |
| ----------------- | --------------------------- | ---------------------- | -------------------------------- | ------ |
| **Wave 0**        | 2.1                         | `consistency-lab-core` | 1 agent                          | XS     |
| **Wave 1**        | 2.2, 2.3, 2.4               | 2.1                    | **3 agents** (independent files) | S-M    |
| **Wave 2**        | 2.5, 2.6                    | 2.2, 2.3, 2.4          | 2 agents                         | S-M    |
| **Wave 3**        | 2.7                         | 2.6                    | 1 agent                          | XS     |
| **Critical path** | 2.1 → 2.2 → 2.5 → 2.6 → 2.7 | 5 waves                | —                                | M      |

**Worktree:** `.worktrees/consistency-lab-01a-correctness/` on branch `pll/consistency-lab-01a-correctness`. Parallel with `consistency-lab-01b-latency`. Both import from `@repo/lab-core` **read-only** after Lane A's interface is frozen (F-10).

### Parallel Metrics Snapshot

| Metric | Formula / Meaning                  | Target | Actual                                                        |
| ------ | ---------------------------------- | ------ | ------------------------------------------------------------- |
| RW0    | Ready tasks in Wave 0              | ≥ 2    | 2 ✓                                                           |
| RW1    | Ready tasks in Wave 1              | ≥ 3    | 3 ✓                                                           |
| CPR    | total_tasks / critical_path_length | ≥ 2.0  | 8 / 5 = **1.6** (scenario is inherently serial on aggregator) |
| DD     | dependency_edges / total_tasks     | ≤ 2.0  | 10 / 8 = **1.25** ✓                                           |
| CP     | same-file overlaps per wave        | 0      | 0 ✓                                                           |

**Parallelization score: B** — Wave 1 is genuinely 3-way parallel; the aggregation → runner → AK-suite chain at the end forces a 4-wave critical path. Acceptable; scenario by nature produces a single summary the runner must assemble.

### Phase 1: Shared scenario plumbing [Complexity: S]

#### [core] Task 2.1: `ScenarioContext` + message schema

**Status:** pending

**Depends:** `consistency-lab-core` complete

Create the scenario workspace (`apps/lab/scenarios/s1a-correctness/`), the
shared `ScenarioContext` helper (DB handle, CF Queue binding, session id),
and the `Message` type + `buildWorkload(sessionId, n)` fixture generator.

**Files:**

- Create: `apps/lab/scenarios/s1a-correctness/package.json` (consumes `@repo/lab-core`)
- Create: `apps/lab/scenarios/s1a-correctness/src/context.ts`
- Create: `apps/lab/scenarios/s1a-correctness/src/message.ts`
- Create: `apps/lab/scenarios/s1a-correctness/src/workload.ts`
- Create: `apps/lab/scenarios/s1a-correctness/src/workload.test.ts`

**Steps (TDD):**

1. Test: `buildWorkload(sid, 10_000)` returns 10,000 messages with distinct `msg_id`s and `seq` 1..10000
2. Run: tests FAIL
3. Implement; tests PASS
4. Run: lint + check-types

**Acceptance:**

- [ ] Deterministic output for the same `sessionId` (reproducibility)
- [ ] `buildWorkload` O(n) memory, no copies
- [ ] Types exported from package index

---

### Phase 2: Three path implementations [Complexity: M]

#### [cf] Task 2.2: `CfQueuesPath` + dedicated queue + consumer handler (F-3T)

**Status:** pending

**Depends:** 2.1

Implement the CF Queues path — producer + consumer handler — against a
**dedicated queue `lab-s1a-cf-queues`** (with DLQ `lab-s1a-cf-queues-dlq`).
Producer enqueues in batches of 100; consumer handler records receive order
into `lab.runs`; path emits `ScenarioEvent`s (`path_started`,
`message_delivered` per msg, `path_completed` with summary). Exports both
the producer class and the consumer handler for Lane D's wrangler.toml to
wire. Default workload is 1000; 10k available as an override (F-04).

**Files:**

- Create: `apps/lab/scenarios/s1a-correctness/src/cf-queues.ts` (producer)
- Create: `apps/lab/scenarios/s1a-correctness/src/cf-queues-consumer.ts` (consumer handler)
- Create: `apps/lab/scenarios/s1a-correctness/src/cf-queues.test.ts`
- Create: `apps/lab/scenarios/s1a-correctness/src/cf-queues-consumer.test.ts`

**Steps (TDD):**

1. Test on miniflare with dedicated `lab-s1a-cf-queues`: produce 1000 with seed `s1a-default` → consumer records all 1000; inversion count in at-least 2 of 3 seeded trials is > 0 (F-14 probabilistic-test pattern)
2. Test: consumer ack-failure on a poisoned message → `path_failed` event emitted with concrete reason, message goes to DLQ
3. Test: consumer never writes outside `session_id` scope
4. Run: FAIL → implement → PASS

**Acceptance:**

- [ ] Dedicated queue binding name is `LAB_S1A_QUEUE` in wrangler.toml (Lane D wires it)
- [ ] Producer + consumer handler exported as named exports from the package barrel
- [ ] 1000 messages delivered under 30s on miniflare
- [ ] `path_failed` emitted with reason string on consumer panic
- [ ] No imports from `apps/workers`; pure scenario isolation

---

#### [pg] Task 2.3: `PgPollingPath`

**Status:** pending

**Depends:** 2.1

Implement the Postgres polling path: `INSERT` 10k rows into `lab.runs`, then
a polling `SELECT ... FROM lab.runs WHERE session_id = ? ORDER BY inserted_at, seq`
in chunks of 500 until delivered === sent. Record `recv_order` as rows are
SELECTed.

**Files:**

- Create: `apps/lab/scenarios/s1a-correctness/src/pg-polling.ts`
- Create: `apps/lab/scenarios/s1a-correctness/src/pg-polling.test.ts`

**Steps (TDD):**

1. Test against a Neon branch: inserting 10k rows concurrently (3 producers) then polling produces 10k rows in order per-producer
2. Test: Hyperdrive pool exhaustion surfaces `path_failed` not a crash
3. FAIL → implement → PASS

**Acceptance:**

- [ ] Zero inversions when producer count = 1 (baseline correctness)
- [ ] Bounded inversions when producer count > 1 (honestly surfaces concurrent-insert ordering tradeoff)
- [ ] `path_failed` on Hyperdrive error, not crash

---

#### [nfy] Task 2.4: `PostgresDirectNotifyPath` — **bypasses Hyperdrive** (F1T-reversed)

**Status:** pending

**Depends:** 2.1, probe p01 `CONFIRMED`

**Renamed from `HyperdriveNotifyPath`.** Fact-check probe `p01` confirmed
that **Hyperdrive explicitly does NOT support `LISTEN/NOTIFY`** (CF docs,
Hyperdrive "supported databases and features" page). The prior F1T
interpretation was wrong. The path instead uses a **direct Postgres TCP
connection from a Durable Object** via the CF Workers `connect()` API —
Hyperdrive is bypassed for this path. This is itself the scenario's
finding: _"Hyperdrive doesn't support `LISTEN/NOTIFY`. Here's what the
same workload looks like when you open a direct connection instead, and
here's what that costs you."_

Subscriber DO holds the TCP connection, issues `LISTEN lab_probe_s1a`.
Producer DO (can use Hyperdrive since it's only doing `INSERT + NOTIFY`,
both one-shot query ops Hyperdrive supports) fires `INSERT ... ; NOTIFY
lab_probe_s1a, payload` per-batch. Subscriber records `recv_order`.
Deliberately simulate one subscriber disconnect + reconnect at batch 40%
to surface the "drops during reconnect" behavior on direct connections.
Default workload 1000; 10k as stress override (F-04).

**Files:**

- Create: `apps/lab/scenarios/s1a-correctness/src/pg-direct-notify.ts`
- Create: `apps/lab/scenarios/s1a-correctness/src/pg-direct-notify.test.ts`
- Create: `apps/lab/scenarios/s1a-correctness/src/pg-listener-do.ts` (DO holding the TCP connection)
- Create: `apps/lab/scenarios/s1a-correctness/src/pg-listener-do.test.ts`

**Steps (TDD):**

1. Test on a Neon branch: subscriber DO opens `connect()` to Postgres, issues LISTEN, receives 1000 NOTIFYs, zero drops, zero inversions
2. Test: forced reconnect between batch 40 and 50 → non-zero drops, reported accurately
3. Test: FIFO per subscriber preserved across reconnect (inversions on received-only = 0)
4. Test: if the direct TCP connection fails to establish, path emits `path_failed` with reason `pg_direct_connect_failed` (not a crash)
5. FAIL → implement → PASS

**Acceptance:**

- [ ] Zero Hyperdrive calls on the LISTEN subscriber side (verified by trace)
- [ ] `NOTIFY` sending may still use Hyperdrive (it's a one-shot query)
- [ ] Reconnect simulation configurable
- [ ] Drops counted exactly
- [ ] `path_failed` on connect failure
- [ ] Documented: this path demonstrates that Hyperdrive's pool semantics are incompatible with session-pinned protocols

**Files:**

- Create: `apps/lab/scenarios/s1a-correctness/src/hyperdrive-notify.ts`
- Create: `apps/lab/scenarios/s1a-correctness/src/hyperdrive-notify.test.ts`

**Steps (TDD):**

1. Test on a Neon branch: full 1000 run without reconnect → zero drops, zero inversions
2. Test: forced reconnect between batch 40 and 50 → non-zero drops, reported accurately in `path_completed` summary
3. Test: FIFO per subscriber is preserved across the reconnect boundary (inversions on received-only messages = 0)
4. Test: if Hyperdrive connection budget is exhausted at setup, path emits `path_failed` with reason `hyperdrive_connection_budget`
5. FAIL → implement → PASS

**Acceptance:**

- [ ] Reconnect simulation is configurable (on/off) via a scenario parameter
- [ ] Drops are counted exactly, reported in `delivered` < `sent` delta
- [ ] Connection-budget-exhaustion surfaces as `path_failed`, not a crash
- [ ] Documented: one LISTEN subscription holds one connection for the scenario's full duration

---

### Phase 3: Aggregation + ordering classifier [Complexity: S]

#### [aggregate] Task 2.5: Per-path summary + classifier

**Status:** pending

**Depends:** 2.2, 2.3, 2.4

Implement `summarize(path)` that, given the raw event stream for one path,
returns `{ delivered, duplicates, inversions, orderingProperty, status }`.
Ordering classifier: `inversions === 0 && duplicates === 0` → `"FIFO"`;
`inversions === 0 && producers > 1` → `"FIFO per-producer"`;
`inversions > 0 && duplicates > 0` → `"unordered"`; `delivered < sent` →
status becomes `PARTIAL`; `throws` → `FAILED`.

**Files:**

- Create: `apps/lab/scenarios/s1a-correctness/src/summarize.ts`
- Create: `apps/lab/scenarios/s1a-correctness/src/summarize.test.ts`

**Steps (TDD):**

1. Test: all six classifier outputs against fixtured event streams
2. Test: inversion counter on a 10-element sequence with known Kendall-tau distance
3. FAIL → implement → PASS

**Acceptance:**

- [ ] 100% line coverage on `summarize.ts`
- [ ] Classifier deterministic; same input → same output

---

#### [runner] Task 2.6: `S1aRunnerDO` Durable Object (F-04)

**Status:** pending

**Depends:** 2.5

Implement `S1aRunnerDO` as a Durable Object. Exposes:

- `start({ sessionId, workloadSize, seed, mode })` — validates args, persists
  state to DO storage, sets first alarm
- `alarm()` — executes the next batch for the active path, records events,
  sets next alarm until the path is done, advances to the next path (or
  aggregates and emits `run_completed` if all paths are done)
- `abort()` — clears alarms, marks run as aborted, emits `run_aborted`,
  drains any inflight Hyperdrive subscriptions, releases

The DO alarm-chunked design (batches of 100 msgs per tick, ~50ms between
ticks) keeps each CPU burst well under the 30s default cap (F-04). The
design respects the `mode` key: sequential (default) runs paths one at a
time; parallel runs them concurrently for stress testing. Aggregation runs
once all three paths complete.

**Files:**

- Create: `apps/lab/scenarios/s1a-correctness/src/runner-do.ts`
- Create: `apps/lab/scenarios/s1a-correctness/src/runner-do.test.ts`
- Create: `apps/lab/scenarios/s1a-correctness/src/runner-state.ts` (DO storage schema)

**Steps (TDD):**

1. Integration test on a Neon branch + miniflare: `start` → DO alarms chain to completion → final `run_completed` event has three paths with expected values; aggregate `duration_ms` matches wall-clock end-to-end
2. Test: default sequential mode — paths complete in order, no contention
3. Test: `mode: "parallel"` — all three paths advance on the same alarm tick (stress)
4. Test: abort mid-run → clears alarms, emits `run_aborted`, no orphan `lab.runs` rows outside `session_id`
5. Test: DO CPU never exceeds the configured limit (10k × 100-msg batches at 50ms cadence stays under 300s CPU)
6. FAIL → implement → PASS

**Acceptance:**

- [ ] Default workload 1000; 10k as override
- [ ] Default mode `"sequential"`; `"parallel"` available (F-07)
- [ ] `start()` is idempotent on re-entry with same `sessionId` (crash-safe)
- [ ] Abort drains open Hyperdrive connections and CF Queue consumers
- [ ] No orphan rows outside `session_id` after abort
- [ ] Full 1000-msg sequential run completes under 30s wall-clock on miniflare + Neon branch

---

#### [ops] Task 2.7: Register `s1a-correctness` suite in `agent-kit.config.ts` (F-008C)

**Status:** pending

**Depends:** 2.6

Register the scenario 1a integration suite with the root
`agent-kit.config.ts` so `pnpm exec ak e2e --suite s1a-correctness` runs
the end-to-end test. This file currently has only a minimal
`e2e.hostAdapterModule` entry; this task extends it to declare suites.

**Files:**

- Modify: `agent-kit.config.ts` (add suite entry pointing at `apps/lab/scenarios/s1a-correctness/test/e2e/*.test.ts`)
- Create: `apps/lab/scenarios/s1a-correctness/test/e2e/full-run.test.ts` (end-to-end scenario on a fresh Neon branch)

**Steps (TDD):**

1. `pnpm exec ak e2e --suite s1a-correctness --print-command` emits a valid command
2. `E2E_BASE_URL=http://127.0.0.1:8787 pnpm exec ak e2e --suite s1a-correctness` executes the full scenario via the shell (which Lane D provides) — will fail if Lane D hasn't shipped yet; allow marking the e2e as skipped with `SKIP_REASON=shell-not-wired` until Lane D lands

**Acceptance:**

- [ ] `ak e2e --suite s1a-correctness` is a discoverable command
- [ ] The e2e test exercises the full three-path run via the shell API
- [ ] Test is marked skipped (not failing) until Lane D shell is merged

---

## Verification Gates

| Gate        | Command                                     | Success Criteria                                                             |
| ----------- | ------------------------------------------- | ---------------------------------------------------------------------------- |
| Type safety | `pnpm --filter s1a-correctness check-types` | Zero errors                                                                  |
| Lint        | `pnpm --filter s1a-correctness lint`        | Zero violations                                                              |
| Unit        | `pnpm --filter s1a-correctness test`        | All suites pass; seeded probabilistic tests stable (F-14)                    |
| Integration | `pnpm exec ak e2e --suite s1a-correctness`  | Full three-path run produces expected summary (skipped until Lane D, F-008C) |

## Cross-Plan References

| Type       | Blueprint                     | Relationship                                             |
| ---------- | ----------------------------- | -------------------------------------------------------- |
| Upstream   | `consistency-lab-core`        | Consumes runner contract, lock, gauge, sanitizer, schema |
| Peer       | `consistency-lab-01b-latency` | Parallel lane; independent files                         |
| Downstream | `consistency-lab-shell`       | Mounts this scenario under `/lab/s1a-correctness`        |

## Edge Cases and Error Handling

| Edge Case                                                 | Risk                      | Solution                                                                       | Task     | Finding |
| --------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------ | -------- | ------- |
| Worker CPU cap hit mid-run                                | Partial run, orphan state | Runner hosted in DO; alarm-chunked 100-msg batches keep CPU bursts << cap      | 2.6      | F-04    |
| CF Queue returns 5xx mid-run                              | Partial result            | Mark path `PARTIAL`, continue others                                           | 2.2      | —       |
| CF Queues consumer conflict with prod                     | Can't ship                | Dedicated `lab-s1a-cf-queues` queue + consumer (never shares `DELIVERY_QUEUE`) | 2.2      | F-3T    |
| Hyperdrive pool exhausted                                 | Path crashes              | Rescue → `path_failed` with reason                                             | 2.3, 2.4 | F1T     |
| Hyperdrive LISTEN connection budget                       | Subscriber cannot start   | `path_failed` with concrete reason; documented budget impact                   | 2.4      | F1T     |
| LISTEN/NOTIFY dropped beyond simulation                   | Unexpected drops          | Count and report; summary status `PARTIAL`                                     | 2.4      | —       |
| Session aborted mid-run                                   | Orphan rows               | Runner DO abort path cleans up; fallback cleanup cron in Lane E                | 2.6      | —       |
| Probabilistic test run lands "lucky" (0 inversions at 1k) | Flake                     | Seed RNG, N=3 trials, assert at-least-2-of-3 show non-zero                     | 2.2      | F-14    |
| Parallel-mode contention between paths                    | Invalid measurement       | Default is sequential; parallel is explicit stress mode                        | 2.6      | F-07    |
| AK suite runs before Lane D ships                         | Red CI                    | Suite auto-skips with `SKIP_REASON=shell-not-wired`                            | 2.7      | F-008C  |

## Non-goals

- No HTTP route — Lane D exposes `/lab/s1a/run`
- No HTML rendering of the summary — Lane D owns the TSX templates
- No latency metrics — Lane C scenario 1b owns those
- No DO-backed queue path — deferred per CEO review, future blueprint
- No `Histogram` / `PricingTable` implementation — moved to Lane A (F-10)

## Refinement Summary (2026-04-24)

| Finding    | Severity | Fix                                                                                | Applied in               |
| ---------- | -------- | ---------------------------------------------------------------------------------- | ------------------------ |
| F-04       | CRITICAL | Runner moves to `S1aRunnerDO`; alarm-chunked batches; default 1k workload          | Task 2.6, Key Decisions  |
| F-3T       | CRITICAL | Dedicated `lab-s1a-cf-queues` queue + consumer; never shares prod `DELIVERY_QUEUE` | Task 2.2                 |
| F-07       | HIGH     | Default path mode is sequential; parallel is explicit stress                       | Task 2.6, Key Decisions  |
| F-10       | HIGH     | Removed Histogram/PricingTable tasks; moved to Lane A                              | Scope, Non-goals         |
| F-008C     | HIGH     | Task 2.7 registers e2e suite in `agent-kit.config.ts`                              | New Task 2.7             |
| F1T        | MEDIUM   | Hyperdrive LISTEN connection-budget caveat; `path_failed` on exhaustion            | Task 2.4                 |
| F-14       | MEDIUM   | Seeded multi-trial test for probabilistic assertions                               | Task 2.2, Success Metric |
| F-codebase | LOW      | `deepFreeze` import source corrected to `@repo/test-utils`                         | Technology Choices       |

Parallelization score: **B** (RW1=3, CPR=1.6, DD=1.25, CP=0). Critical path is genuinely 5 waves because aggregate → runner → suite-wiring cannot be parallelized further without fragmenting the scenario narrative.

## Risks

| Risk                                                | Impact               | Mitigation                                                                        | Finding |
| --------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------- | ------- |
| CF Queues ordering behavior changes                 | Scenario claim wrong | Pin summary language to observed metrics, not CF's docs                           | —       |
| Hyperdrive `NOTIFY` semantics differ across regions | Inconsistent results | Slot-lock serializes; document single-region behavior                             | —       |
| 1k messages too few to surface inversions           | Demo looks "clean"   | Seeded multi-trial test; stress mode to 10k available                             | F-14    |
| Runner DO storage bloats with event archive         | Cost + cold-start    | `lab.events_archive` (Postgres) is the archive; DO holds only cursor + path state | F-05    |
| Parallel mode in production                         | Measurements invalid | Default sequential; parallel is docs-only stress mode                             | F-07    |
| Hyperdrive connection budget exhausted by LISTEN    | Path cannot run      | Graceful `path_failed`; documented budget impact                                  | F1T     |
| AK suite runs red before Lane D ships               | Blocks CI            | Suite auto-skips with explicit `SKIP_REASON`                                      | F-008C  |

## Technology Choices

| Component        | Technology                                           | Version                       | Why                                                                    |
| ---------------- | ---------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------- |
| Runtime          | Cloudflare Workers                                   | current                       | Repo standard                                                          |
| Runner hosting   | Durable Object (`S1aRunnerDO`)                       | current                       | CPU budget needs alarm-chunking, not one request (F-04)                |
| Queue            | CF Queues (dedicated `lab-s1a-cf-queues` + DLQ)      | current                       | One consumer per queue (F-3T)                                          |
| Consumer pattern | Reused from `cf-queues-delivery` completed blueprint | —                             | Existing reference at `apps/workers/src/consumers/deliveryConsumer.ts` |
| DB               | Postgres via Hyperdrive + LISTEN/NOTIFY              | current                       | Hyperdrive supports LISTEN per CF docs (F1T)                           |
| Test runner      | Vitest + miniflare                                   | catalog:tooling               | Repo standard                                                          |
| Fixture freeze   | `deepFreeze` from `@repo/test-utils`                 | new package (Lane A Task 1.9) | Replaces old reference to `apps/workers/src/tests/helpers.ts`          |
