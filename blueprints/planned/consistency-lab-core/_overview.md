---
type: blueprint
status: planned
complexity: M
created: "2026-04-24"
last_updated: "2026-04-24"
progress: "Refined 2026-04-24 (tech + codebase + adversarial agents); 0% implementation"
depends_on:
  - consistency-lab-probes
tags:
  - lab
  - packages
  - session-lock
  - concurrency
  - telemetry
  - sanitizer
  - durable-objects
  - histogram
  - pricing
  - schema
---

# Consistency Lab — core scaffold

**Goal:** Create `packages/lab-core`, the shared runner contract, session
management, concurrency control, telemetry fan-out, and event-stream sanitizer
that every future consistency-lab scenario depends on. This is Lane A of the
lab work. It unblocks scenarios 1a and 1b and every scenario after.

## Planning Summary

- **Why now:** Office hours, eng review, and CEO review all agreed to ship the
  consistency lab as a portfolio artifact for senior/staff infra engineers.
  The lab scaffold (`apps/lab/worker`, scenario blueprints) is useless without
  shared primitives — lock, gauge, runner interface, sanitizer, telemetry.
  Building these first lets scenarios 1a and 1b ship in parallel worktrees
  against a stable contract.
- **Scope:** One new workspace, `packages/lab-core`, exporting
  - a `ScenarioRunner` interface with a typed `run({ sessionId, signal }): AsyncIterable<ScenarioEvent>` shape,
  - a `SessionLock` Durable Object with `acquire`, `release`, `waitingRoom`, TTL-auto-release (F6T: init guarded by `blockConcurrencyWhile`; check `getAlarm()` before `setAlarm()` on fetch),
  - a `LabConcurrencyGauge` Durable Object that tracks active sessions **by sessionId with TTL reaper alarm** (F-02: raw counter leaks on crash; sessioned map with alarm-swept expiry is crash-safe),
  - a `KillSwitchKV` helper over CF KV used by the shell's feature-flag middleware (F-01: Doppler injects at deploy time; runtime toggling needs KV),
  - a `TelemetryCollector` that batches `ScenarioEvent`s to ~10Hz for SSE fan-out **and persists a durable copy to `lab.events_archive`** (F-05: ring buffer alone cannot support `Last-Event-ID` replay at 166 ev/s),
  - a whitelisting `Sanitizer` that strips internal identifiers, stack traces, and non-allowlisted fields before events reach users (CEO review H5),
  - a `Histogram` (TDigest via `@thi.ng/tdigest`, F11T) and a `PricingTable` (CF unit prices pinned with `effectiveDate`) (F-10: moved here from Lane C so Lanes B and C can run truly parallel without writing to `@repo/lab-core`),
  - `lab.*` Postgres schema migrations for `lab.sessions`, `lab.runs`, `lab.events_archive`, `lab.heartbeat` (CEO review — schema isolation), with a dedicated `drizzle.config.ts` per-package and a CI guard rejecting any `public.` DDL in the lab migration set (F-12).
- **Out of scope:** Any scenario implementation, any HTTP route, any
  user-facing page, any deployment config. This package is consumed; it does
  not host.
- **Primary success metric:**
  `pnpm --filter @repo/lab-core test` passes with 100% line coverage on
  `SessionLock`, `LabConcurrencyGauge`, `Sanitizer`, `Histogram`, `PricingTable`,
  and `KillSwitchKV`; contract type-checks cleanly against a stub
  `ScenarioRunner`. Mutation-score gate is out of scope for v1 (F-007C: the
  repo has no `test:mutation` script; a separate blueprint can add one later).

## Architecture Overview

```text
                  ┌────────────────────────────────┐
                  │     packages/lab-core          │
                  │                                │
                  │ ┌──────────────────────────┐   │
                  │ │   ScenarioRunner         │   │
                  │ │   interface (types only) │   │
                  │ └──────────▲───────────────┘   │
                  │            │  implements       │
                  │            │                   │
 consumer ──▶ Lane B ──▶ 01a ──┤                   │
 consumer ──▶ Lane C ──▶ 01b ──┘                   │
                  │                                │
                  │ ┌──────────────────────────┐   │
                  │ │   SessionLock (DO)       │   │
                  │ │   acquire / release      │◀──┼── consumed by apps/lab/worker
                  │ │   waitingRoom / TTL      │   │
                  │ └──────────────────────────┘   │
                  │ ┌──────────────────────────┐   │
                  │ │   LabConcurrencyGauge(DO)│   │
                  │ │   global active-session  │◀──┼── enforced before SessionLock
                  │ │   cap (100)              │   │
                  │ └──────────────────────────┘   │
                  │ ┌──────────────────────────┐   │
                  │ │   TelemetryCollector     │   │
                  │ │   ScenarioEvent → batch  │◀──┼── feeds SSE in Lane D
                  │ │   → flush @ ~10Hz        │   │
                  │ └──────────────────────────┘   │
                  │ ┌──────────────────────────┐   │
                  │ │   Sanitizer              │   │
                  │ │   whitelist fields       │◀──┼── runs before events leave server
                  │ │   default-deny unknown   │   │
                  │ └──────────────────────────┘   │
                  └────────────────────────────────┘
```

## Key Decisions

| Decision                    | Choice                                                                                            | Rationale                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Runner contract shape       | `AsyncIterable<ScenarioEvent>` over callbacks                                                     | Backpressure-friendly; plays with native `fetch` streams and SSE                                                       |
| Session ID                  | UUID v4, 128 bits                                                                                 | Sufficient entropy to resist guessing; standard lib                                                                    |
| Slot lock                   | Durable Object with alarm-based TTL (F6T: `getAlarm()` check + `blockConcurrencyWhile` init)      | Actor model matches "one writer per session"; alarms auto-release leaks                                                |
| Concurrency gauge shape     | **Sessioned DO map with TTL alarm reaper**, not naked counter (F-02)                              | A naked counter leaks on crash; keyed-by-sessionId + alarm sweep is crash-safe                                         |
| Gauge vs lock acquire order | **Gauge is acquired only AFTER lock is granted** (F-02)                                           | Avoids waiting-room visitors consuming gauge slots                                                                     |
| Runtime kill switch         | `KillSwitchKV` over CF KV (F-01)                                                                  | Doppler injects at deploy time; runtime flip needs KV/DO, not Doppler                                                  |
| Events archive              | Durable append to `lab.events_archive` keyed by `(session_id, event_id)`; retention 7 days (F-05) | SSE ring buffer cannot support `Last-Event-ID` replay at 166 ev/s; DB replay covers the whole run                      |
| Telemetry batching          | Server-side ~10Hz fixed cadence                                                                   | Avoids SSE flood; downstream UI updates feel live                                                                      |
| Sanitizer policy            | Allowlist-only (default-deny)                                                                     | Unknown event shapes never leak — aligns with CEO review H5                                                            |
| DB schema                   | `lab.*` schema with per-package `drizzle.config.ts` + CI guard rejecting `public.` DDL (F-12)     | Assertion-only isolation is brittle; CI enforces it                                                                    |
| Histogram impl              | **Inline ~200-line t-digest** (adapted from Dunning reference impl) (F11T-reversed)               | `@thi.ng/tdigest` does not exist (probe-confirmed); `tdigest@0.1.2` is CJS + unmaintained; inline keeps us independent |

## Quick Reference (Execution Waves)

| Wave              | Tasks                             | Dependencies | Parallelizable                       | Effort (T-shirt) |
| ----------------- | --------------------------------- | ------------ | ------------------------------------ | ---------------- |
| **Wave 0**        | 1.1                               | None         | 1 agent                              | XS               |
| **Wave 1**        | 1.2, 1.3, 1.4, 1.5, 1.7, 1.8, 1.9 | 1.1          | **6 agents** (all files independent) | S-M per task     |
| **Wave 2**        | 1.6                               | 1.1          | 1 agent                              | S                |
| **Critical path** | 1.1 → 1.2 → (any Wave 1)          | 2 waves      | —                                    | M                |

**Worktree:** `.worktrees/consistency-lab-core/` on branch `pll/consistency-lab-core`. One squash commit after `/verify` green.

### Parallel Metrics Snapshot

| Metric | Formula / Meaning                  | Target               | Actual                                                          |
| ------ | ---------------------------------- | -------------------- | --------------------------------------------------------------- |
| RW0    | Ready tasks in Wave 0              | ≥ planned agents / 2 | 1 (scaffold-gated)                                              |
| RW1    | Ready tasks in Wave 1              | ≥ 6 for 6-agent run  | **7** ✓                                                         |
| CPR    | total_tasks / critical_path_length | ≥ 2.5                | 9 / 3 = **3.0** ✓                                               |
| DD     | dependency_edges / total_tasks     | ≤ 2.0                | 8 / 9 = **0.89** ✓                                              |
| CP     | same-file overlaps per wave        | 0                    | 0 ✓ (each Wave 1 task has its own `src/<file>.ts` + `.test.ts`) |

**Parallelization score: A** — Wave 1 sustains 6-agent throughput after the one-task Wave 0 scaffold. `/pll` can drive 6-8 agents.

### Phase 1: packages/lab-core scaffold [Complexity: M]

#### [core] Task 1.1: Workspace + contract types

**Status:** pending

**Depends:** None

Create the `packages/lab-core` workspace with `package.json`, `tsconfig.json`,
and `src/contract.ts` exporting the `ScenarioRunner` interface, the
`ScenarioEvent` discriminated union (`path_started`, `message_delivered`,
`inversion_detected`, `path_completed`, `path_failed`, `run_completed`), and
the `SessionContext` type. No implementation, only types.

**Files:**

- Create: `packages/lab-core/package.json` (private, name `@repo/lab-core`, `type: "module"`, exports `./src/index.ts`)
- Create: `packages/lab-core/tsconfig.json` (extends the repo's base tsconfig)
- Create: `packages/lab-core/src/contract.ts`
- Create: `packages/lab-core/src/index.ts` (barrel re-export of `contract`)
- Modify: `pnpm-workspace.yaml` — ensure `packages/*` already covers this (no change if glob already includes it)

**Steps (TDD):**

1. Add a type-only test asserting the `ScenarioRunner` contract's shape via `expectTypeOf` (vitest-style) against a stub implementation
2. Run: `pnpm --filter @repo/lab-core check-types` — verify FAIL (package doesn't exist yet)
3. Create the package files with the minimum types to satisfy the contract
4. Run: `pnpm --filter @repo/lab-core check-types` — verify PASS
5. Run: `pnpm --filter @repo/lab-core lint`

**Acceptance:**

- [ ] `pnpm --filter @repo/lab-core check-types` passes
- [ ] `pnpm --filter @repo/lab-core lint` passes
- [ ] Contract types exported from `@repo/lab-core` barrel

---

#### [core] Task 1.2: `SessionLock` Durable Object

**Status:** pending

**Depends:** 1.1

Implement the `SessionLock` Durable Object: per-scenario single-writer slot
with `acquire()`, `release()`, `waitingRoom()` returning queue position and
ETA, and an alarm-backed TTL so a crashed holder auto-releases. TTL is
**configurable per scenario; default 300_000 ms** (F-20: 120s was too short
for legitimate long-tail runs under contention).

F6T pattern notes (from CF docs):

- Call `ctx.blockConcurrencyWhile(() => initStorage())` in the constructor so
  concurrent fetches wait for initialization
- On fetch, check `await ctx.storage.getAlarm()` before `setAlarm(...)` — do
  not blindly set an alarm in the constructor
- Alarm handler must be idempotent; CF retries on failure up to 6× with
  exponential backoff

**Files:**

- Create: `packages/lab-core/src/session-lock.ts`
- Create: `packages/lab-core/src/session-lock.test.ts`
- Create: `packages/lab-core/src/lock-state.ts` (DO storage schema)

**Steps (TDD):**

1. Write failing tests: `acquire` succeeds when empty; second `acquire` queues; `release` promotes next waiter; TTL alarm releases a stale holder; `waitingRoom` reports correct position and ETA; alarm handler is idempotent under simulated CF retry
2. Run: `pnpm --filter @repo/lab-core test` — verify FAIL
3. Implement the DO using `miniflare`-compatible storage and alarms; init guarded by `blockConcurrencyWhile`; check `getAlarm()` before any `setAlarm`
4. Run: `pnpm --filter @repo/lab-core test` — verify PASS
5. Refactor; confirm complexity ≤ 8 per method
6. Run: `pnpm --filter @repo/lab-core lint` and `check-types`

**Acceptance:**

- [ ] All test cases pass (including idempotence)
- [ ] No `any` in public API
- [ ] TTL configurable; default 300_000 ms (F-20)
- [ ] Init uses `blockConcurrencyWhile`; fetch paths check `getAlarm()` first (F6T)

---

#### [core] Task 1.3: `LabConcurrencyGauge` Durable Object (F-02 redesign)

**Status:** pending

**Depends:** 1.1

Implement `LabConcurrencyGauge` — a single global DO that tracks active
sessions as a **map keyed by `sessionId`, with a TTL alarm reaper**, not
as a naked counter. Every acquire stores `{sessionId → expiresAt}`; the
alarm sweeps expired entries so a crashed Worker cannot leak the gauge
monotonically. Shell (Lane D) acquires the gauge **after** successfully
acquiring `SessionLock` (F-02: waiting-room visitors must not consume
gauge slots).

**Files:**

- Create: `packages/lab-core/src/concurrency-gauge.ts`
- Create: `packages/lab-core/src/concurrency-gauge.test.ts`

**Steps (TDD):**

1. Tests: 100 concurrent acquires succeed; 101st fails with `retryAfter`; release is idempotent; release-before-alarm and alarm-before-release both arrive at the same zero-leak end state; crashed-holder scenario (no explicit release) — alarm sweep drops the entry and gauge returns to true active count
2. Test: 200 distinct acquires over time with interleaved alarm ticks → active count never exceeds 100 and never under-reports
3. Run: tests FAIL
4. Implement as sessioned map; alarm cadence = TTL / 4 so we sweep at least 4× per session lifetime
5. Run: tests PASS

**Acceptance:**

- [ ] Cap tunable via constructor option; default 100
- [ ] Session-id-keyed entries with per-entry `expiresAt`
- [ ] Alarm reaper runs on interval; idempotent under CF retries
- [ ] `snapshot()` returns `{activeCount, oldestExpiryAt, capacity}` for heartbeat + metrics
- [ ] Release is idempotent (call twice → no double-decrement)

---

#### [core] Task 1.4: `Sanitizer` module

**Status:** pending

**Depends:** 1.1

Implement `Sanitizer` — pure-function allowlist-based event filter. Given a
`ScenarioEvent`, returns the same event with only allowlisted fields or
`null` if the event's discriminant isn't in the allowlist. Fixture-driven
exhaustive tests prove no internal field (row PKs, Worker file paths, stack
frames, connection strings) can leak.

**Files:**

- Create: `packages/lab-core/src/sanitizer.ts`
- Create: `packages/lab-core/src/sanitizer.test.ts`
- Create: `packages/lab-core/test-fixtures/events.ts` (deepFrozen per CLAUDE.md conventions)

**Steps (TDD):**

1. Fixture: 20+ events covering every allowlisted shape + malformed/unknown shapes
2. Tests: known shapes pass through with whitelisted fields only; unknown shapes return `null`; nested objects have their own allowlist
3. Run: tests FAIL
4. Implement allowlist table + recursive filter
5. Run: tests PASS

**Acceptance:**

- [ ] 100% line coverage on `sanitizer.ts`
- [ ] Fixture covers: `path_started`, `message_delivered`, `inversion_detected`, `path_completed`, `path_failed`, `run_completed`, plus three deliberately-malformed cases
- [ ] Sanitizer exports a single `sanitize(event): SanitizedEvent | null`

---

#### [core] Task 1.5: `TelemetryCollector` + archive persistence (F-05)

**Status:** pending

**Depends:** 1.1, 1.4, 1.6

Implement `TelemetryCollector` — stateful batcher that accepts raw
`ScenarioEvent`s from the runner, sanitizes each, batches to ~10Hz or 64
events for SSE fan-out, **and appends every event to `lab.events_archive`
keyed by `(session_id, event_id)` with a monotonic per-session sequence**.
The shell's SSE endpoint reads `Last-Event-ID` on reconnect and replays
from the archive, not from an in-memory ring buffer (F-05).

The collector exposes two surfaces:

- `AsyncIterable<SanitizedEvent[]>` — used by the live SSE stream
- `replayFrom(sessionId, lastEventId): AsyncIterable<SanitizedEvent>` — used by SSE reconnect

**Files:**

- Create: `packages/lab-core/src/telemetry-collector.ts`
- Create: `packages/lab-core/src/telemetry-collector.test.ts`
- Create: `packages/lab-core/src/events-archive.ts` (DB insert helper)
- Create: `packages/lab-core/src/events-archive.test.ts`

**Steps (TDD):**

1. Tests: 10k events in 60s produce ~600 batches on live stream **and** all 10k persist to `lab.events_archive`; sparse events flush on cadence; sanitizer rejections don't empty the stream; close semantics flush pending events; `replayFrom(sid, lastEventId)` returns only events with id > lastEventId in monotonic order
2. Test: archive insert failure does not block the live SSE stream (archive is best-effort durable, live is real-time)
3. Implement; tests pass

**Acceptance:**

- [ ] Cadence configurable; default 100ms
- [ ] Max batch size configurable; default 64
- [ ] All events persisted to `lab.events_archive` with monotonic per-session id
- [ ] `replayFrom` correctly replays 10k events in order (integration test)
- [ ] Archive failures don't block the live stream

---

#### [core] Task 1.6: `lab.*` schema migration (F-12)

**Status:** pending

**Depends:** 1.1 (contract types reference these tables)

Create Drizzle schema for `lab.sessions`, `lab.runs`, `lab.events_archive`
(append-only, 7-day retention), `lab.heartbeat`, and **`lab.heartbeat_audit`**
(admin-bypass audit rows consumed by Lane E Task 5.7 — F-06). All tables
live in the `lab` schema, never `public`. Migration is idempotent. A
tear-down migration drops the schema atomically for reversibility.

Scope enforcement (F-12):

- **Dedicated `drizzle.config.ts`** in `packages/lab-core/` pointing only at
  `packages/lab-core/src/schema.ts` and the `lab` schema — never shares a
  config with `apps/workers`
- **CI guard** — a repo-level lint script rejects any `public.` DDL in
  `packages/lab-core/migrations/*.sql`
- **Runtime defense** — connection helper for lab code issues
  `SET search_path TO lab` on each connection
- **Role separation** (documented, applied in staging/prod): create a
  `lab_app` Postgres role that has USAGE on `lab` only and no DDL on
  `public`; production Hyperdrive config uses this role

**Files:**

- Create: `packages/lab-core/src/schema.ts` (Drizzle)
- Create: `packages/lab-core/drizzle.config.ts`
- Create: `packages/lab-core/migrations/0001_create_lab_schema.sql`
- Create: `packages/lab-core/migrations/README.md` (how to apply via Neon; role grant ritual)
- Create: `scripts/check-lab-migrations.ts` (bun; CI guard rejecting `public.` DDL in lab migrations)
- Modify: repo-level lint/CI config to run the check

**Steps (TDD):**

1. Integration test on a Neon branch: applies migration, asserts tables exist in `lab` schema and not in `public`; `SET search_path TO lab` is respected by the connection helper
2. Unit test: CI guard script flags a migration containing `public.foo` and passes a clean migration
3. Run: `pnpm --filter @repo/lab-core test` — verify FAIL
4. Write schema + migration + guard
5. Run: tests PASS

**Acceptance:**

- [ ] All **five** tables present in `lab` schema (`sessions`, `runs`, `events_archive`, `heartbeat`, `heartbeat_audit`)
- [ ] `public.*` entirely untouched
- [ ] Tear-down migration drops the schema in one statement
- [ ] CI guard script rejects `public.` DDL in lab migrations
- [ ] Connection helper applies `SET search_path TO lab`
- [ ] Role-grant ritual documented in `migrations/README.md`

---

#### [core] Task 1.7: `Histogram` + `PricingTable` (moved from Lane C, F-10)

**Status:** pending

**Depends:** 1.1

Add `Histogram` (a small **inline t-digest implementation** — ~200 LOC,
adapted from Dunning's reference impl) and `PricingTable` (static JSON
of CF Queues, Hyperdrive write, Worker request, Durable Object request
costs, annotated with `effectiveDate` and `source`). Both exported from
the `@repo/lab-core` barrel. Moved here so Lane C does not need to write
to `@repo/lab-core` — unblocks true Lane B/C parallelism.

**Note (F11T-reversed):** The prior draft named `@thi.ng/tdigest` as the
package source. Fact-check probe `p05` and a direct npm registry check
confirmed the package **does not exist**. The only real `tdigest` package
(`tdigest@0.1.2`) is CJS-only, unmaintained since 2022, and has a native
dep. Inline implementation is therefore the primary choice, not a
fallback. Implementation is straightforward: t-digest buffers samples,
compresses them via scale-function clustering, answers percentiles from
the compressed centroids. Reference: Ted Dunning, "Computing Extremely
Accurate Quantiles Using t-Digests" (2019).

**Files:**

- Create: `packages/lab-core/src/histogram.ts`
- Create: `packages/lab-core/src/histogram.test.ts`
- Create: `packages/lab-core/src/pricing.ts`
- Create: `packages/lab-core/src/pricing.test.ts`
- Modify: `packages/lab-core/src/index.ts` (export both)

**Steps (TDD):**

1. Histogram tests: known input (1000 samples from known distributions — uniform, Gaussian, heavy-tail Pareto) → p50 / p95 / p99 within ±2% of analytically-known percentiles on 10k samples; `.merge(other)` commutes; empty histogram returns `null` for percentiles without throwing
2. Histogram tests on miniflare (Workers runtime) — pure JS impl has no Node-only deps, runs everywhere
3. Pricing tests: calculating 1M CF Queues messages matches the pinned `effectiveDate` value; `effectiveDate` staleness > 90 days emits a warning in summary
4. Run: FAIL → implement → PASS

**Acceptance:**

- [ ] p99 on 10k samples within ±2% of the exact percentile
- [ ] Pricing entries include `source` URL + `effectiveDate`
- [ ] Staleness warning implemented (>90 days)
- [ ] Both types surface through the barrel

---

#### [core] Task 1.8: `KillSwitchKV` helper (F-01)

**Status:** pending

**Depends:** 1.1

Implement `KillSwitchKV` — a small helper over CF KV that reads and writes a
runtime kill switch. Replaces the wrong-by-design "read `LAB_ENABLED` per
request from Doppler env" in the prior blueprint draft. Used by the shell
middleware (Lane D) to 404 the lab surface and by `CostAutoFlip` (Lane E) to
flip the switch without redeploying.

Schema in KV: one key `lab:kill-switch` with value `{ enabled: bool,
reason: string, flippedAt: ISO8601, autoResetAt?: ISO8601 }`. Cached
per-request with a 5-second local cache so hot paths don't pay a KV read.

**Files:**

- Create: `packages/lab-core/src/kill-switch.ts`
- Create: `packages/lab-core/src/kill-switch.test.ts`

**Steps (TDD):**

1. Tests: read returns default-enabled when key is missing; write + read round-trips; cache respects TTL; `flip(reason, autoResetAt?)` records all fields
2. Run: FAIL → implement → PASS

**Acceptance:**

- [ ] Default value (key missing) = `{ enabled: true }`
- [ ] Per-request cache ≤ 5s
- [ ] `flip()` is idempotent — repeated flips with same reason are a no-op
- [ ] Supports `autoResetAt` for Lane E's daily reset feature (F-11)

---

#### [core] Task 1.9: `@repo/test-utils` extraction (F-codebase note)

**Status:** pending

**Depends:** 1.1

Extract `deepFreeze` and `createMockEnv` helpers from
`apps/workers/src/tests/helpers.ts` into a new shared workspace
`packages/test-utils/` so `@repo/lab-core` and lab scenarios can import
them without crossing into `apps/workers`. The current codebase keeps them
local to the workers app; growing the repo now justifies extraction.

**Files:**

- Create: `packages/test-utils/package.json` (`@repo/test-utils`, consumed by lab packages)
- Create: `packages/test-utils/src/deep-freeze.ts`
- Create: `packages/test-utils/src/deep-freeze.test.ts`
- Create: `packages/test-utils/src/mock-env.ts`
- Create: `packages/test-utils/src/index.ts`
- Modify: `apps/workers/src/tests/helpers.ts` — re-export from `@repo/test-utils` to preserve all existing import sites
- Modify: CLAUDE.md test-conventions block — update the `helpers.ts` reference to point at the new package

**Steps (TDD):**

1. Existing `apps/workers` tests must continue to pass unchanged (re-export shim preserves the import path)
2. New package tests cover `deepFreeze` on nested objects, arrays, Dates, Maps, Sets
3. Run: `pnpm --filter @repo/workers test` — verify green (shim works)
4. Run: `pnpm --filter @repo/test-utils test` — verify green

**Acceptance:**

- [ ] No breaking change to `apps/workers` tests
- [ ] `@repo/lab-core` and scenario packages can import `deepFreeze` without touching `apps/workers`
- [ ] CLAUDE.md updated to point at the new location

---

## Verification Gates

| Gate         | Command                                    | Success Criteria                                                                          |
| ------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Type safety  | `pnpm --filter @repo/lab-core check-types` | Zero errors                                                                               |
| Lint         | `pnpm --filter @repo/lab-core lint`        | Zero violations                                                                           |
| Tests        | `pnpm --filter @repo/lab-core test`        | All suites pass; 100% line coverage on lock/gauge/sanitizer/histogram/pricing/kill-switch |
| Migration CI | `bun scripts/check-lab-migrations.ts`      | No `public.` DDL in lab migrations (F-12)                                                 |
| Workers      | `pnpm --filter @repo/workers test`         | Passes unchanged (test-utils extraction shim, F-codebase)                                 |
| Blueprint    | `pnpm blueprints:check`                    | Frontmatter matches dir                                                                   |

**Mutation testing** (`test:mutation`) is out of scope for this blueprint —
the repo has no `test:mutation` script (F-007C). A separate blueprint can
add Stryker CI once the lab core stabilizes.

## Cross-Plan References

| Type       | Blueprint                         | Relationship                                  |
| ---------- | --------------------------------- | --------------------------------------------- |
| Upstream   | None                              | Foundational — unblocks others                |
| Downstream | `consistency-lab-01a-correctness` | Consumes runner contract + lock               |
| Downstream | `consistency-lab-01b-latency`     | Consumes runner contract + lock               |
| Downstream | `consistency-lab-shell`           | Mounts DOs, consumes telemetry SSE            |
| Downstream | `consistency-lab-ops`             | Heartbeat uses `lab.heartbeat` + gauge metric |

## Edge Cases and Error Handling

| Edge Case                                   | Risk                          | Solution                                                                            | Task     | Finding |
| ------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------- | -------- | ------- |
| Slot holder crashes                         | Queue stalls forever          | TTL alarm auto-releases; default 300s (was 120s)                                    | 1.2      | F-20    |
| Alarm fires mid-init                        | Double-initialize             | `blockConcurrencyWhile` + `getAlarm()` check before `setAlarm`                      | 1.2      | F6T     |
| Alarm retry after transient failure         | Double-release                | Alarm handler idempotent                                                            | 1.2, 1.3 | F6T     |
| Concurrency gauge crashes without release   | Cap drifts monotonically down | Sessioned map + TTL reaper, not naked counter                                       | 1.3      | F-02    |
| Concurrency gauge release double-call       | Double-decrement              | Idempotent release; invariant test                                                  | 1.3      | F-02    |
| Sanitizer sees unknown event shape          | Leak                          | Default-deny; null return with actionable log                                       | 1.4      | —       |
| Telemetry backpressure on a burst           | Memory growth                 | Max batch size 64; archive insert decoupled from live stream                        | 1.5      | F-05    |
| Archive insert fails                        | SSE replay broken             | Archive is best-effort; live SSE unblocked; replay falls back to empty with warning | 1.5      | F-05    |
| SSE reconnect mid-run                       | Dropped events                | Replay by `Last-Event-ID` from `lab.events_archive`, not ring buffer                | 1.5      | F-05    |
| Schema drop with live sessions              | Data loss                     | Tear-down migration is a manual ritual, not automated                               | 1.6      | —       |
| `drizzle-kit push` leaks to `public.*`      | Prod schema pollution         | Per-package drizzle.config.ts + CI guard + `SET search_path` + role GRANT           | 1.6      | F-12    |
| `@thi.ng/tdigest` incompatible with Workers | Histogram broken              | Fallback inline ~200-line implementation                                            | 1.7      | F11T    |
| Pricing table stale                         | Misleading cost numbers       | `effectiveDate` + staleness warning at 90 days                                      | 1.7      | F9T     |
| Kill-switch KV read on every request        | Latency                       | 5s local cache                                                                      | 1.8      | F-01    |

## Non-goals

- No scenario logic (path implementations) — Lanes B and C own those
- No HTTP surface — Lane D mounts the DOs and exposes routes
- No heartbeat / cost alert / runbook — Lane E owns ops work
- No front-end code — the lab shell in Lane D renders HTMX-on-Hono SSR
- No mutation-testing gate (F-007C — repo has no `test:mutation` script; separate blueprint)
- No Stryker config for `@repo/lab-core` — defer until lab core stabilizes

## Refinement Summary (2026-04-24)

Agents consulted:

1. **Phase 1 Tech Fact-Check** — CF docs, Hyperdrive, Queues, Workers limits, HTMX, Doppler, CF billing, TDigest libs
2. **Phase 2 Codebase Verification** — `@repo/workers` structure, existing DO (`TopicRoom`), Drizzle pattern, catalog names, `.worktrees/` convention, `deepFreeze` location
3. **Phase 3 Architecture Adversarial** — race conditions, CPU budget, SSE replay math, Doppler-vs-runtime, admin secret blast radius, cross-path contention

| Finding    | Severity | Fix                                                                        | Applied in           |
| ---------- | -------- | -------------------------------------------------------------------------- | -------------------- |
| F-01       | CRITICAL | `KillSwitchKV` replaces wrong "Doppler-runtime-flip" design                | Task 1.8             |
| F-02       | CRITICAL | Gauge = sessioned map + TTL reaper; acquire after lock                     | Task 1.3             |
| F-04       | CRITICAL | Runner moves into DO in Lanes B/C; core exposes contract only              | Contract in Task 1.1 |
| F-05       | CRITICAL | `TelemetryCollector` persists to `lab.events_archive`; `replayFrom` method | Task 1.5             |
| F-007C     | CRITICAL | Drop `test:mutation` gate; note non-goal                                   | Verification Gates   |
| F-10       | HIGH     | `Histogram` + `PricingTable` moved from Lane C to here                     | Task 1.7             |
| F-12       | HIGH     | Per-package drizzle.config + CI guard + search_path + role grant           | Task 1.6             |
| F-20       | LOW      | Lock TTL default 300s, tunable per scenario                                | Task 1.2             |
| F6T        | LOW      | DO alarm init pattern documented                                           | Task 1.2             |
| F11T       | LOW      | `@thi.ng/tdigest` + inline fallback named                                  | Task 1.7             |
| F-codebase | MEDIUM   | `@repo/test-utils` extraction; `apps/workers` shim preserves tests         | Task 1.9             |

Parallelization score: **A** (RW1=7, CPR=3.0, DD=0.89, CP=0). Ready for `/pll` with 6-8 agents.

## Risks

| Risk                                                    | Impact                         | Mitigation                                                                   | Finding    |
| ------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------- | ---------- |
| DO storage limits on sessioned gauge map                | Cap drifts if storage corrupts | Bounded by max-sessions (100) × small session record; periodic snapshot test | F-02       |
| Drizzle schema format change                            | Migration incompatibility      | Pin Drizzle to catalog version; per-package config                           | F-12       |
| `@thi.ng/tdigest` incompatible with Workers runtime     | Histogram broken               | Fallback inline impl in Task 1.7                                             | F11T       |
| Sanitizer allowlist too restrictive                     | Valid events dropped           | Actionable log makes it easy to spot + add shape                             | —          |
| `test-utils` extraction breaks `apps/workers` tests     | CI red                         | Re-export shim preserves all current import sites                            | F-codebase |
| Events archive write amplifies DB writes (10k+ per run) | Hyperdrive load                | Archive is append-only; partition-by-day plausible if scale grows            | F-05       |
| Per-package drizzle.config.ts diverges                  | Schema drift                   | README captures the ritual; CI guard catches `public.` leaks                 | F-12       |

## Technology Choices

| Component        | Technology              | Version (catalog)            | Why                                                                  |
| ---------------- | ----------------------- | ---------------------------- | -------------------------------------------------------------------- |
| Runtime          | Cloudflare Workers      | current                      | Repo standard                                                        |
| DO storage       | CF Durable Objects      | current                      | Actor model fits slot lock + gauge                                   |
| KV (kill switch) | CF Workers KV           | current                      | Runtime-mutable state Doppler cannot provide (F-01)                  |
| Histogram        | Inline t-digest impl    | ~200 LOC                     | Prior agent's `@thi.ng/tdigest` claim was fabricated (F11T-reversed) |
| Test runner      | Vitest + miniflare      | catalog:tooling              | Repo standard                                                        |
| Test utilities   | `@repo/test-utils`      | new package                  | Extracted from `apps/workers/src/tests/helpers.ts` (F-codebase)      |
| Type checker     | tsgo                    | `@typescript/native-preview` | CLAUDE.md mandate                                                    |
| ORM              | Drizzle                 | catalog:workers              | Repo standard for Postgres; per-package drizzle.config.ts (F-12)     |
| Script executor  | bun (for `.ts` scripts) | current                      | CLAUDE.md mandate                                                    |
| Secrets          | Doppler                 | current                      | CLAUDE.md mandate; **not** used for runtime flags (F-01)             |
