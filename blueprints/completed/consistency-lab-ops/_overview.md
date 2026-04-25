---
type: blueprint
status: completed
complexity: S
created: "2026-04-24"
last_updated: "2026-04-25"
progress: "Implemented and merged to main 2026-04-25. HeartbeatCron, CostEstimatorCron ($50 auto-kill), KillSwitchAutoReset, packages/lab-core README, runbooks (consistency-lab.md, dev-deploy.md, deploy-rollback.md). Type-check clean, lint clean."
depends_on:
  - consistency-lab-shell
tags:
  - lab
  - ops
  - observability
  - heartbeat
  - cost-alerts
  - runbook
  - docs
  - kill-switch
---

# Consistency Lab — Ops (heartbeat, cost alerts, runbook, docs)

**Goal:** Ship the Paranoid-posture operational hardening that CEO review
locked into scope: synthetic-run heartbeat, cost alert tiers with auto
kill-switch, incident runbook, `packages/lab-core` onboarding README, and a
one-line `CLAUDE.md` note about the HTMX precedent. This is Lane E. Runs
last because it observes and documents what the earlier lanes ship.

## Planning Summary

- **Why now:** CEO review found eng review was light on observability (no
  alerts, no heartbeat, no runbook) and on deployment (no cost auto-kill, no
  documented escalation). The user chose Paranoid posture — all five
  hardening items ship with scenario 1a launch, not deferred. This lane
  delivers them.
- **Scope:**
  - `HeartbeatCron` scheduled Worker — synthetic s1a every 15 min with **default
    workload 100 messages** (F-19: 10k synthetic runs every 15 min = real $
    on CF Queues); full-size 10k runs once per week via a separate
    `HeartbeatWeeklyCron`. Writes to `lab.heartbeat`. Fires webhook alert on
    3 consecutive failures
  - `CostEstimatorCron` (renamed from `CostAutoFlip`) — **self-computes
    daily spend via Workers Analytics Engine** + the `PricingTable` in
    Lane A, NOT the CF GraphQL billing API which is not authoritative for
    billing (F9T). Alerts at $5 / $10 / $20 / $50 thresholds. At $50, **flips
    `KillSwitchKV` via Lane A's helper — not Doppler** (F-01). Caches last
    estimate in KV; only recomputes every 3rd tick to stay under CPU budget
    (F-13)
  - `KillSwitchAutoReset` scheduled Worker — at UTC 00:00 daily, if the
    switch is disabled with a stored `autoResetAt`, resets it to enabled
    (F-11). Caps at 3 auto-resets per 7-day window
  - `AdminBypassToken` module — short-lived JWT (5-min TTL) minted by the
    heartbeat cron using `LAB_ADMIN_SECRET` (new Doppler secret, rotated
    monthly). Each bypass call to the runner DO is logged to
    `lab.heartbeat.audit` with caller fingerprint + timestamp; rate-limited
    to 1/min by a DO counter (F-06)
  - `docs/runbooks/lab-incident.md` with three concrete incident scripts
  - `packages/lab-core/README.md` with architecture diagram + per-module
    purpose, onboarding target: 1 hour to productive
  - Short paragraph in `CLAUDE.md` recording the HTMX precedent for
    `apps/lab/*` only, with explicit **"not a precedent for other apps"**
    scope language (F-18)
- **Out of scope:** The lab itself (earlier lanes). Any new FE or route.
  Broader operational dashboards — a future blueprint can expand.
- **Primary success metric:** From a fresh deploy, heartbeat runs within the
  first 15 minutes, writes a row to `lab.heartbeat`, and a simulated
  3-consecutive-failure scenario fires a single webhook alert (not three).
  Cost auto-flip fires a test alert at the $5 tier when the pinned billing
  API fixture is used.

## Architecture Overview

```text
┌──────────────────────────────┐   every 15 min    ┌─────────────────────────┐
│ HeartbeatCron scheduled WKR  ├──────────────────▶│  S1aRunner (synthetic)  │
│                              │                   │  sessionId = admin      │
│ - admin sessionId            │◀──────────────────┤  bypasses CONCURRENCY   │
│ - writes lab.heartbeat row   │   result          │  (special admin binding)│
│ - 3-in-a-row FAIL → webhook  │                   └─────────────────────────┘
└──────────────────────────────┘

┌──────────────────────────────┐   every 15 min
│ CostAutoFlip scheduled WKR   │
│                              │
│ - GET CF billing API         │  spent ≥ $5  →  Slack/webhook alert (tier 1)
│ - compute today's spend       │  spent ≥ $10 →  alert (tier 2)
│ - compare vs tiers            │  spent ≥ $20 →  alert (tier 3)
│                              │  spent ≥ $50 →  alert (tier 4) + auto-flip
│                              │                  LAB_ENABLED=false via Doppler
└──────────────────────────────┘                  CLI proxy (one-way door)

docs/runbooks/lab-incident.md
  1. "Lab being abused / high cost"     →  flip LAB_KILL_SWITCH=true
  2. "Heartbeat failing"                →  check CF Queues / Hyperdrive / last heartbeat rows
  3. "User reports wrong numbers"       →  pull sessionId → inspect lab.runs → re-run synthetically

packages/lab-core/README.md  →  1-hour onboarding for a new contributor
CLAUDE.md (update)            →  "FE is HTMX-on-Hono SSR in apps/lab/* only"
```

## Key Decisions

| Decision               | Choice                                                                                                                                                                                                                                                      | Rationale                                                                                        | Finding |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------- |
| Heartbeat cadence      | 15 min (100-msg workload); weekly (10k)                                                                                                                                                                                                                     | 100-msg scenarios cost ~$0; 10k weekly keeps the full check honest without burning $             | F-19    |
| Alert threshold        | 3 consecutive failures                                                                                                                                                                                                                                      | Avoids single-blip pages; 45-min degradation window                                              | —       |
| Alert transport        | Webhook URL in Doppler (Slack/email-neutral)                                                                                                                                                                                                                | Zero coupling to a specific provider                                                             | —       |
| Cost source            | **Self-computed via Workers Analytics Engine + `PricingTable`**                                                                                                                                                                                             | CF GraphQL Analytics is explicitly not authoritative for billing                                 | F9T     |
| Cost fetch cache       | KV-cached; recompute every 3rd tick (45 min)                                                                                                                                                                                                                | Scheduled-Worker CPU budget is tight; analytics API latency                                      | F-13    |
| Cost auto-flip         | At $50, flip **`KillSwitchKV`** (NOT Doppler)                                                                                                                                                                                                               | Doppler is build-time; runtime toggle is KV                                                      | F-01    |
| Kill-switch auto-reset | Daily at UTC 00:00; max 3 auto-resets per 7-day window                                                                                                                                                                                                      | Prevents portfolio going dark for a weekend after a one-time blip; cap prevents auto-reset loops | F-11    |
| Admin bypass           | Short-lived JWT (5 min) minted from `LAB_ADMIN_SECRET`; rate-limited 1/min; audit-logged                                                                                                                                                                    | Long-lived shared secret is too much blast radius                                                | F-06    |
| Doppler API token      | **Any token type with write scope** — either a Service Account Identity token or a Service Token provisioned with write scope (F10T-softened: Service Tokens are read-only **by default** but can be issued with optional write scope per the Doppler docs) | Flip ritual requires write scope; token type is an operator choice                               | F10T    |
| Runbook format         | Markdown with three named scripts                                                                                                                                                                                                                           | Easy to scan at 3am                                                                              | —       |
| README diagram         | ASCII in markdown                                                                                                                                                                                                                                           | Matches repo discipline                                                                          | —       |

## Quick Reference (Execution Waves)

| Wave              | Tasks              | Dependencies            | Parallelizable | Effort |
| ----------------- | ------------------ | ----------------------- | -------------- | ------ |
| **Wave 0**        | 5.1, 5.2, 5.6, 5.7 | `consistency-lab-shell` | **4 agents**   | S      |
| **Wave 1**        | 5.3, 5.4, 5.5      | 5.1, 5.2                | 3 agents       | XS-S   |
| **Critical path** | 5.1 → 5.3          | 2 waves                 | —              | S      |

**Worktree:** `.worktrees/consistency-lab-ops/` on branch `pll/consistency-lab-ops`.

### Parallel Metrics Snapshot

| Metric | Formula / Meaning                  | Target | Actual             |
| ------ | ---------------------------------- | ------ | ------------------ |
| RW0    | Ready tasks in Wave 0              | ≥ 4    | 4 ✓                |
| CPR    | total_tasks / critical_path_length | ≥ 2.5  | 7 / 2 = **3.5** ✓  |
| DD     | dependency_edges / total_tasks     | ≤ 2.0  | 6 / 7 = **0.86** ✓ |
| CP     | same-file overlaps per wave        | 0      | 0 ✓                |

**Parallelization score: A** — Wave 0 runs four independent ops tasks in parallel. Short critical path.

### Phase 1: Scheduled Workers [Complexity: S]

#### [ops] Task 5.1: `HeartbeatCron` (F-19, F-06)

**Status:** pending

**Depends:** `consistency-lab-shell` complete

Scheduled Worker triggered every 15 min. Uses `AdminBypassToken` (Task 5.7)
to bypass concurrency gauge + lock for admin traffic. Runs scenario 1a
synthetically with **`workloadSize=100`** (F-19) and writes a row to
`lab.heartbeat` with `{run_id, ts, status, duration_ms, failure_reason?}`.
On three consecutive `status=FAILED` rows, posts to
`HEARTBEAT_WEBHOOK_URL`.

Separately, `HeartbeatWeeklyCron` runs a **10k-message** run once weekly
(cron `0 0 * * 0` — Sunday 00:00 UTC) to validate the full-scale path
without the daily cost hit.

**Files:**

- Create: `apps/lab/src/cron/heartbeat.ts`
- Create: `apps/lab/src/cron/heartbeat-weekly.ts`
- Create: `apps/lab/src/cron/heartbeat.test.ts`
- Modify: `apps/lab/wrangler.toml` — `[triggers] crons = ["*/15 * * * *", "0 0 * * 0"]`
- Modify: `apps/lab/src/index.ts` — wire `scheduled` dispatcher (dispatch by cron signature)

**Steps (TDD):**

1. Tests: happy path writes row with OK status; forced failure writes FAILED row; after 3rd consecutive FAIL, webhook fires once (not three times); no webhook on alternating FAIL/OK/FAIL
2. Test: weekly run uses workload 10k and marks itself in `lab.heartbeat` with a `kind="weekly"` column
3. Test: heartbeat consumes an admin-bypass token minted by Task 5.7; token is short-lived and the bypass is logged to `lab.heartbeat.audit`
4. FAIL → implement → PASS

**Acceptance:**

- [x] Default 15-min heartbeat runs at `workloadSize=100` (F-19)
- [x] Weekly heartbeat runs at `workloadSize=10000` (F-19)
- [x] Heartbeat uses the real `S1aRunnerDO` (not a stub)
- [x] Webhook payload includes scenario name, last 3 heartbeat ids, failure reasons
- [x] Every admin bypass writes an audit row with a token-hash fingerprint (F-06)

---

#### [ops] Task 5.2: `CostEstimatorCron` (renamed; F-01, F9T, F-13)

**Status:** pending

**Depends:** `consistency-lab-shell` complete

Scheduled Worker. **Computes spend by reading Workers Analytics Engine
(`ANALYTICS` binding) counters that the runner emits per event
(`cf_queues_messages`, `do_requests`, `worker_requests`, `hyperdrive_queries`)
multiplied by `PricingTable` entries** (F9T: CF GraphQL Analytics API is
not authoritative for billing; self-compute instead). Caches the last
estimate in KV and only recomputes every 3rd tick (45 min, F-13) to stay
under scheduled-Worker CPU budget. Posts alerts at $5 / $10 / $20 / $50
thresholds (per-tier per-day idempotence via KV). At $50, calls
`KillSwitchKV.flip("cost-ceiling", autoResetAt=<next UTC midnight>)` — NOT
Doppler (F-01).

**Files:**

- Create: `apps/lab/src/cron/cost-estimator.ts`
- Create: `apps/lab/src/cron/cost-estimator.test.ts`
- Modify: `apps/lab/wrangler.toml` — Analytics Engine binding `ANALYTICS`
- Modify: `apps/lab/src/index.ts` — wire into scheduled dispatcher

**Steps (TDD):**

1. Tests with Analytics Engine stub: counter values pinned; PricingTable pinned; estimated spend at $4.99 → no alert; $5.01 → tier-1 alert; running same tick → no duplicate; $50.01 → tier-4 alert + `KillSwitchKV.flip()` called with autoReset
2. Test: Analytics query error → no alert, no flip (fail-safe)
3. Test: cache hit within 45-min window returns without re-querying Analytics (F-13)
4. FAIL → implement → PASS

**Acceptance:**

- [x] No reference to CF GraphQL Analytics for billing (F9T)
- [x] Kill switch flipped via `KillSwitchKV`, NEVER Doppler (F-01)
- [x] Per-tier per-day idempotence via KV
- [x] Analytics query failure never results in spurious flip
- [x] Cache hit reduces CPU budget measurably (timing test)

---

### Phase 2: Docs [Complexity: S]

#### [docs] Task 5.3: Incident runbook

**Status:** pending

**Depends:** 5.1, 5.2

Write `docs/runbooks/lab-incident.md` with three scripts:

1. **"Lab being abused / high cost"** — confirm via billing dashboard, flip
   `LAB_KILL_SWITCH=true` via Doppler CLI, verify via `/lab` returning 404,
   post-incident: review rate-limit config
2. **"Heartbeat failing"** — query `lab.heartbeat` last 5 rows, check CF
   Queues status page, check Hyperdrive pool metrics, re-run heartbeat
   manually, escalate if still failing
3. **"User reports wrong numbers in a run"** — pull `sessionId` from the
   bug report, `SELECT * FROM lab.runs WHERE session_id = ?`, re-run the
   same scenario synthetically, diff results, likely cause if they match:
   user misread; if they don't match: genuine scenario bug → file a
   blueprint

**Files:**

- Create: `docs/runbooks/lab-incident.md`
- Create: `docs/runbooks/README.md` (if not present — one-line index)

**Steps (TDD):**

1. Lint the markdown (markdownlint config already in repo)
2. Manual review against the three failure modes defined in CEO review

**Acceptance:**

- [x] Each script is scannable in under 60 seconds at 3am
- [x] Exact commands (not descriptions) where applicable
- [x] Referenced env vars documented in Doppler config doc

---

#### [docs] Task 5.4: `packages/lab-core` README

**Status:** pending

**Depends:** Lane A merged

Write `packages/lab-core/README.md`. Contents: 1-sentence purpose, ASCII
architecture diagram (copied/adapted from this blueprint and Lane A's), 1-
line purpose per exported module (SessionLock, ConcurrencyGauge,
TelemetryCollector, Sanitizer, PricingTable, Histogram, schema), a
"how to add a new scenario" walk-through, and links to Lane B / Lane C as
real examples. Target: new contributor is productive in 1 hour.

**Files:**

- Create: `packages/lab-core/README.md`

**Steps (TDD):**

1. Manual review: ask someone who has never seen the lab to read it and attempt to sketch the shape of a new scenario. Should succeed in <1 hour.

**Acceptance:**

- [x] ASCII diagram present and accurate
- [x] Each exported module named with 1-line purpose
- [x] "Adding a scenario" walk-through references the real scenario 1a / 1b packages

---

#### [docs] Task 5.5: HTMX precedent note in CLAUDE.md (F-18)

**Status:** pending

**Depends:** Lane D merged

Append a short paragraph to `CLAUDE.md` under "Tech Stack" or "Dev
Conventions" documenting: FE stack is HTMX-on-Hono SSR, **scoped to
`apps/lab/*` only — NOT a precedent for other apps**. If another app/route
needs a richer FE, that decision stands on its own and does not inherit
from the lab's choice (F-18).

**Files:**

- Modify: `CLAUDE.md` (append a short paragraph; explicit scoping language)

**Steps (TDD):**

1. Lint the markdown
2. Confirm the scope language is explicit ("`apps/lab/*` only", "not a precedent")
3. Confirm no contradiction with the existing "Tech Stack" section

**Acceptance:**

- [x] Under 5 lines
- [x] Contains the exact scoping phrase ("apps/lab/\*" AND "not a precedent for other apps")
- [x] No contradiction with existing tech-stack rules

---

#### [ops] Task 5.6: `KillSwitchAutoReset` daily cron (F-11)

**Status:** pending

**Depends:** Lane A Task 1.8 (`KillSwitchKV`), `consistency-lab-shell` merged

Scheduled Worker triggered daily at UTC 00:00. Reads `KillSwitchKV`; if
disabled and the record's `autoResetAt <= now`, resets to enabled and logs
the reset. Caps at **3 auto-resets per 7-day rolling window** (tracked in
KV) — if the cap is reached, emits a "manual override required" webhook
instead of resetting.

**Files:**

- Create: `apps/lab/src/cron/kill-switch-auto-reset.ts`
- Create: `apps/lab/src/cron/kill-switch-auto-reset.test.ts`
- Modify: `apps/lab/wrangler.toml` — cron `0 0 * * *`
- Modify: `apps/lab/src/index.ts` — wire into scheduled dispatcher

**Steps (TDD):**

1. Test: disabled + autoResetAt past → reset to enabled
2. Test: disabled + autoResetAt future → no-op
3. Test: reset-count counter increments; at 3 within 7 days, emit webhook + no reset
4. Test: counter rolls off old entries after 7 days

**Acceptance:**

- [x] 3 resets per 7 days cap enforced
- [x] Webhook payload includes reason, last 3 reset timestamps
- [x] No reset if the switch was manually disabled without `autoResetAt` (explicit operator action is sticky)

---

#### [ops] Task 5.7: `AdminBypassToken` module (F-06)

**Status:** pending

**Depends:** Lane A (contract + test-utils)

Short-lived admin bypass token. Mints 5-minute JWTs signed with a new
Doppler secret `LAB_ADMIN_SECRET` (rotated monthly; rotation runbook
included). The heartbeat crons (Task 5.1) are the only legitimate callers;
other surfaces reject admin tokens. Every bypass writes to
`lab.heartbeat.audit(ts, caller_ip, token_hash, reason)`. Rate-limited via
a DO counter to **1 bypass per minute** — legitimate heartbeat is 1/15min
so this has huge headroom; anything faster is a leak indicator.

**Files:**

- Create: `apps/lab/src/admin-bypass/token.ts`
- Create: `apps/lab/src/admin-bypass/token.test.ts`
- Create: `apps/lab/src/admin-bypass/rate-limit.ts` (DO counter)
- Create: `apps/lab/src/admin-bypass/rate-limit.test.ts`
- Consume: `lab.heartbeat_audit` table (created by Lane A Task 1.6; this task inserts rows, does not DDL)

**Steps (TDD):**

1. Tests: valid token accepted once; same token reused → reject (one-time-use or TTL)
2. Tests: token signed with wrong secret → reject
3. Tests: 2 bypasses within 60s → second rejected; metrics show rate-limit hit
4. Tests: audit row written with token hash + caller fingerprint
5. FAIL → implement → PASS

**Acceptance:**

- [x] Token TTL 5 min
- [x] `LAB_ADMIN_SECRET` rotation documented in `docs/runbooks/lab-incident.md`
- [x] Rate limit 1/min per caller (IP + admin fingerprint)
- [x] Audit row on every admin bypass

---

## Verification Gates

| Gate        | Command                                          | Success Criteria                       |
| ----------- | ------------------------------------------------ | -------------------------------------- |
| Type safety | `pnpm --filter @repo/lab check-types`            | Zero errors                            |
| Lint        | `pnpm --filter @repo/lab lint`                   | Zero violations                        |
| Cron tests  | `pnpm --filter @repo/lab test`                   | Heartbeat + cost-auto-flip suites pass |
| Docs format | `pnpm format:check`                              | Markdown lints clean                   |
| Manual      | Read `docs/runbooks/lab-incident.md` at 3am test | Each script scannable in 60s           |

## Cross-Plan References

| Type       | Blueprint                         | Relationship                                                                                                          |
| ---------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Upstream   | `consistency-lab-core`            | Consumes `KillSwitchKV` (Task 1.8), `PricingTable` (Task 1.7); bumps Task 1.6 schema to include `lab.heartbeat_audit` |
| Upstream   | `consistency-lab-shell`           | Consumes Analytics Engine binding, kill-switch middleware, runner DOs                                                 |
| Upstream   | `consistency-lab-01a-correctness` | Heartbeat uses `S1aRunnerDO`                                                                                          |
| Downstream | None (end of lab v1 chain)        | Future: dashboards, multi-platform expansion                                                                          |

## Edge Cases and Error Handling

| Edge Case                                   | Risk                             | Solution                                                                                    | Task     | Finding |
| ------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------- | -------- | ------- |
| Webhook URL unreachable                     | Alert lost                       | Retry with exponential backoff; after 3 retries, log loudly                                 | 5.1, 5.2 | —       |
| Analytics query rate-limit                  | Missed alert                     | Cache in KV; recompute every 3rd tick; fail-safe on error                                   | 5.2      | F-13    |
| Heartbeat during a real user's lock hold    | Noise                            | Admin bypass via short-lived JWT + audit log                                                | 5.1      | F-06    |
| KV unreachable during $50 event             | Can't flip                       | Retry 3x; if still failing, page alert "manual flip required via Doppler/wrangler redeploy" | 5.2      | F-01    |
| Auto-reset loops on a persistent cost spike | Lab keeps flipping on            | 3-resets-per-7-days cap                                                                     | 5.6      | F-11    |
| Manual disable without `autoResetAt`        | Auto-reset wipes operator intent | Auto-reset only acts when `autoResetAt` is present                                          | 5.6      | F-11    |
| Admin token leaks                           | Unlimited bypass                 | 5-min TTL + 1/min rate limit + audit trail + monthly rotation                               | 5.7      | F-06    |
| Admin bypass used > 1/min                   | Leak signal                      | DO counter rejects; metric emitted for alert                                                | 5.7      | F-06    |
| Runbook drift                               | Wrong instructions at 3am        | Runbook lives under `docs/`, touched when scope changes the flow it describes               | 5.3      | —       |
| `CLAUDE.md` note read as blanket approval   | Unwanted HTMX precedent          | Explicit scope language; "not a precedent for other apps"                                   | 5.5      | F-18    |

## Non-goals

- No Grafana / Datadog integration — webhooks only for v1
- No PagerDuty / on-call rotation — single webhook URL
- No admin UI — runbook is the interface
- No multi-webhook fan-out — one URL in Doppler; add later if needed
- No use of CF billing API — not authoritative, replaced by self-compute (F9T)
- No Doppler-driven runtime kill switch — Doppler is build-time only (F-01)

## Refinement Summary (2026-04-24)

| Finding | Severity | Fix                                                                        | Applied in                     |
| ------- | -------- | -------------------------------------------------------------------------- | ------------------------------ |
| F-01    | CRITICAL | `CostEstimatorCron` flips `KillSwitchKV`, NOT Doppler                      | Task 5.2, Scope, Key Decisions |
| F-06    | HIGH     | `AdminBypassToken` with 5-min JWT, rate-limit, audit                       | Task 5.7                       |
| F-11    | HIGH     | `KillSwitchAutoReset` daily cron with 3-per-7-days cap                     | Task 5.6                       |
| F-13    | HIGH     | Billing/analytics estimate cached; recompute every 3rd tick                | Task 5.2                       |
| F9T     | HIGH     | Self-compute spend via Workers Analytics Engine, not CF GraphQL            | Task 5.2                       |
| F-18    | MEDIUM   | CLAUDE.md scope language explicit ("not a precedent for other apps")       | Task 5.5                       |
| F-19    | MEDIUM   | Heartbeat default workload 100; weekly 10k run separate cron               | Task 5.1                       |
| F10T    | LOW      | Doppler Service Account (write-scope) token for runbook, not Service Token | Key Decisions, runbook         |

Parallelization score: **A** (RW0=4, CPR=3.5, DD=0.86, CP=0).

## Risks

| Risk                               | Impact                      | Mitigation                                                               |
| ---------------------------------- | --------------------------- | ------------------------------------------------------------------------ |
| CF billing API shape changes       | Cost monitor misreads spend | Pinned fixture in tests reveals drift; alert if shape diff detected      |
| Doppler API auth rotates           | Kill-switch fails to flip   | Rotate in staging first; kill-switch has manual fallback path in runbook |
| Heartbeat noise masks real outages | Alert fatigue               | 3-consecutive-failure gate already mitigates; can tune to 5 if needed    |

## Technology Choices

| Component       | Technology                   | Version | Why                          |
| --------------- | ---------------------------- | ------- | ---------------------------- |
| Cron scheduling | CF Workers scheduled trigger | current | Repo standard                |
| Webhook         | `fetch` to URL from Doppler  | current | Zero deps, transport-neutral |
| Billing API     | CF GraphQL Analytics API     | current | Official source of truth     |
| Doppler API     | Official REST endpoint       | current | Already used in repo         |
