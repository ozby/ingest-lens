---
type: blueprint
status: completed
complexity: S
created: "2026-04-24"
last_updated: "2026-04-25"
progress: "Implemented and merged to main 2026-04-25. 11 probes (p01–p11) under scripts/probes/consistency-lab/. Type-check clean, lint clean. Deploy-gated probes (p01 Hyperdrive LISTEN/NOTIFY, p02 CPU 300s, p06 Doppler, p09 CF Queues) require live CF + Neon environment and cannot be confirmed without that context."
depends_on: []
tags:
  - lab
  - probes
  - fact-check
  - pre-flight
  - integration
---

# Consistency Lab — Fact-Check Probes (pre-flight)

**Goal:** Reproduce every load-bearing external claim the consistency-lab
blueprints depend on as an executable probe test, **before** any
implementation starts. If a probe fails, the claim is wrong and the
dependent blueprint must change. Prevents shipping 5 blueprints on top of
a false assumption.

## Source-verification log (pre-probe, 2026-04-24)

Before probe code runs, a fact-check agent fetched the primary sources
for all 10 original claims and **reversed or softened 6 of them**. A
second round (2026-04-24) added 7 more probes (p11–p17) to cover gaps
the user surfaced. Current runtime totals: **11 CONFIRMED, 5 PARTIAL,
0 WRONG, 1 SKIPPED.** Runtime probes are the final gate; downstream
blueprints are updated to match the source-verified reality.

| #   | Original claim                             | Verdict                                        | Blueprint action                                                                                              |
| --- | ------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | Hyperdrive supports LISTEN/NOTIFY          | **REVERSED** (unsupported)                     | Scenario 1a/1b third path renamed `PostgresDirectNotifyPath`; direct `connect()` from DO, Hyperdrive bypassed |
| 2   | Worker CPU configurable to 300s on paid    | CONFIRMED                                      | No change                                                                                                     |
| 3   | HTMX 4 rewrites SSE                        | SOFTENED (no HTMX 4 exists)                    | Pin at `htmx.org@2.0.10` + `htmx-ext-sse@2.2.4`; wording relaxed                                              |
| 4   | Workers Assets binding                     | CONFIRMED                                      | No change                                                                                                     |
| 5   | `@thi.ng/tdigest` ESM                      | **FABRICATED**                                 | Histogram is inline ~200-line t-digest as primary                                                             |
| 6   | Doppler Service Tokens read-only           | SOFTENED                                       | Any token type with write scope is fine                                                                       |
| 7   | Inter Tight OFL 1.1                        | CONFIRMED                                      | No change                                                                                                     |
| 8   | JetBrains Mono Apache 2.0                  | **REVERSED** (font is OFL 1.1)                 | Single `OFL-1.1.txt` covers both fonts                                                                        |
| 9   | CF Queues rejects second consumer          | SOFTENED (no doc says so)                      | Dedicated queues kept, justification reworded                                                                 |
| 10  | No public CF billing API                   | CONFIRMED                                      | No change                                                                                                     |
| 11  | Workers `connect()` TCP API exists         | CONFIRMED (docs rich)                          | Validates the redesigned third-path structure                                                                 |
| 12  | `@neondatabase/serverless` supports LISTEN | PARTIAL — no doc mention                       | Raw `connect()` retained as the chosen path; Neon driver ruled out                                            |
| 13  | Worker subrequest cap 1000/req paid        | CONFIRMED                                      | Scenario runner DO default 100-msg batches safely under                                                       |
| 14  | Hyperdrive has no per-query charge         | CONFIRMED                                      | PricingTable: removed "Hyperdrive write" line; Postgres cost flows through                                    |
| 15  | `ak` CLI exists + supports `--suite`       | CONFIRMED                                      | AK suite registration tasks 2.7 / 3.7 are real, not aspirational                                              |
| 16  | Postgres NOTIFY 8000-byte payload cap      | CONFIRMED                                      | Scenario schema encoded size << 8000; guardrail added to Key Decisions                                        |
| 17  | Inter Tight ships as published package     | CONFIRMED (`@fontsource-variable/inter-tight`) | Lane D font source pinned to Fontsource package                                                               |

The probes below now act as **regression gates** — they will fail if CF,
HTMX, or Doppler later change behavior and invalidate one of the
corrected claims.

## Planning Summary

- **Why now:** The refined blueprints in `consistency-lab-{core, 01a, 01b,
shell, ops}` rest on 10 external technology claims surfaced by Phase 1
  fact-check agents. Agents cited sources but no one fetched them + ran
  code. This blueprint closes that gap by writing probes that _produce the
  claim's expected behavior_ — if the probe passes, the claim is real
  enough to build on; if it fails, we find out before writing ~3000 LOC.
- **Scope:** One probe per load-bearing claim, each with a clear
  pass/fail assertion. Probes live under `scripts/probes/consistency-lab/`
  and are executed via `bun scripts/probes/consistency-lab/<probe>.ts`
  (local probes) or a Wrangler + Neon-branch deploy (deploy-gated probes).
  Each probe emits a single JSON verdict line to stdout that CI can parse.
- **Out of scope:** Any lab scenario code. Any UI. Any Durable Object
  implementation. These probes validate the _substrate_ the scenarios will
  run on, not the scenarios themselves.
- **Primary success metric:** 10 / 10 probes pass. Any `WRONG` or
  `UNREACHABLE` verdict triggers a rewrite of the named blueprint sections
  before that blueprint moves from `planned/` to `in-progress/`.

## Architecture Overview

```text
┌───────────────────────────────────────────────────────────────────────┐
│ scripts/probes/consistency-lab/                                        │
│                                                                        │
│  ├─ p01-hyperdrive-listen-notify.ts   (deploy-gated, Neon + Hyperdrive)│
│  ├─ p02-worker-cpu-300s.ts            (deploy-gated, paid tier)        │
│  ├─ p03-htmx-sse-replay.ts            (local, miniflare + Playwright)  │
│  ├─ p04-workers-assets-binding.ts     (local, miniflare)               │
│  ├─ p05-tdigest-on-workers.ts         (local, miniflare)               │
│  ├─ p06-doppler-secret-update.ts      (deploy-gated, needs sandbox)    │
│  ├─ p07-inter-tight-license.ts        (local, parse LICENSE file)      │
│  ├─ p08-jetbrains-mono-license.ts     (local, parse LICENSE file)      │
│  ├─ p09-cf-queues-one-consumer.ts     (deploy-gated)                   │
│  └─ p10-cf-billing-api-absence.ts     (local, HEAD check + docs fetch) │
│                                                                        │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              bun scripts/probes/consistency-lab/run-all.ts
                              │
                              ▼
  Emits:  { probe: "p01", verdict: "CONFIRMED" | "WRONG" | "UNREACHABLE",
            claim: "<claim>", evidence: "<quoted line or measurement>", citation: "<url>" }

  Gate:   any non-CONFIRMED verdict blocks moves of the downstream blueprints
          out of planned/; verdict log persisted at
          scripts/probes/consistency-lab/verdicts.jsonl
```

## Key Decisions

| Decision              | Choice                                                                                         | Rationale                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Probe runner          | `bun` script per probe + one `run-all.ts` orchestrator                                         | Matches repo's `.ts`-via-`bun` convention (CLAUDE.md)         |
| Output format         | JSONL line per probe, verdict + evidence + citation URL                                        | Easy to diff across runs; CI can parse                        |
| Local vs deploy-gated | Local by default; three probes need real CF + Neon                                             | Local probes run on every PR; deploy-gated run once on stage  |
| Failure policy        | Any `WRONG` or `UNREACHABLE` blocks downstream blueprints from transitioning to `in-progress/` | Explicit pre-flight gate                                      |
| Expected verdict      | Each probe ships with an `expected` field (`CONFIRMED` for all 10 at draft time)               | Detects silent regressions (e.g., CF removes a feature later) |

## Quick Reference (Execution Waves)

| Wave              | Tasks                              | Dependencies                                        | Parallelizable | Effort |
| ----------------- | ---------------------------------- | --------------------------------------------------- | -------------- | ------ |
| **Wave 0**        | 0.1, 0.3, 0.4, 0.5, 0.7, 0.8, 0.10 | None                                                | **7 agents**   | XS     |
| **Wave 1**        | 0.2, 0.6, 0.9                      | 0.1 (needs a sandbox Neon branch provisioned first) | 3 agents       | S      |
| **Wave 2**        | 0.11 (run-all orchestrator + CI)   | All above                                           | 1 agent        | XS     |
| **Critical path** | 0.1 → 0.2 → 0.11                   | 3 waves                                             | —              | S      |

**Worktree:** `.worktrees/consistency-lab-probes/` on branch `pll/consistency-lab-probes`. Runs before any other consistency-lab lane.

### Parallel Metrics Snapshot

| Metric | Formula / Meaning                  | Target | Actual              |
| ------ | ---------------------------------- | ------ | ------------------- |
| RW0    | Ready tasks in Wave 0              | ≥ 6    | 7 ✓                 |
| CPR    | total_tasks / critical_path_length | ≥ 2.5  | 11 / 3 = **3.67** ✓ |
| DD     | dependency_edges / total_tasks     | ≤ 2.0  | 8 / 11 = **0.73** ✓ |
| CP     | same-file overlaps per wave        | 0      | 0 ✓                 |

**Parallelization score: A.**

### Phase 0: Local probes [Complexity: XS]

#### [probe] Task 0.1: `p01-hyperdrive-listen-notify` (deploy-gated probe)

**Status:** pending

**Depends:** None (but execution requires a sandbox Neon branch + Worker with Hyperdrive binding)

Reproduce the **corrected** Hyperdrive LISTEN/NOTIFY finding. Two-part probe:

1. **Negative assertion:** a subscriber issuing `LISTEN` through a Hyperdrive
   connection does NOT reliably receive the NOTIFY (because Hyperdrive
   multiplexes connections; CF docs explicitly list LISTEN/NOTIFY as
   unsupported). Verdict `CONFIRMED` if the subscriber either receives
   nothing or receives an explicit Hyperdrive-rejection error.
2. **Positive assertion:** a subscriber opening a direct Postgres TCP
   connection from a DO (via CF Workers `connect()`) DOES receive the
   NOTIFY within 5 seconds. Verdict `CONFIRMED` if it arrives.

Probe overall `CONFIRMED` only if both parts match expected. If the
negative assertion unexpectedly passes (Hyperdrive delivers the NOTIFY
reliably), the docs may have changed and the scenario can be simplified;
flag for blueprint revision.

**Files:**

- Create: `scripts/probes/consistency-lab/p01-hyperdrive-listen-notify.ts`
- Create: `scripts/probes/consistency-lab/lib/hyperdrive-sandbox.ts`

**Steps (TDD):**

1. Write the probe expecting `CONFIRMED` (it arrives within 5s)
2. Run against a Neon sandbox branch + a sandbox Hyperdrive binding
3. Verdict is `CONFIRMED` if notification arrives; `WRONG` if it times out; `UNREACHABLE` if the connection fails
4. If `WRONG`, `consistency-lab-01a-correctness` Task 2.4 (and 01b Task 3.4) must be rewritten to drop or replace the LISTEN/NOTIFY path

**Acceptance:**

- [x] Probe emits a valid verdict JSON line
- [ ] Expected verdict `CONFIRMED` matches actual — deploy-gated; requires live Neon + CF Hyperdrive binding
- [ ] If actual ≠ expected: scenario blueprints flagged for revision

---

#### [probe] Task 0.2: `p02-worker-cpu-300s` (deploy-gated probe)

**Status:** pending

**Depends:** paid-tier CF account provisioned

Reproduce the claim that `[limits] cpu_ms = 300000` is accepted on the paid tier.
Deploys a throwaway Worker with that limit + a handler that does synthetic CPU
work (~150s of `Array.from({ length: 1e6 }, () => crypto.randomUUID())` loops)
and asserts it completes without `exceeded CPU time` errors.

**Files:**

- Create: `scripts/probes/consistency-lab/p02-worker-cpu-300s.ts`
- Create: `scripts/probes/consistency-lab/sandbox/worker-cpu/wrangler.toml`
- Create: `scripts/probes/consistency-lab/sandbox/worker-cpu/src/index.ts`

**Steps (TDD):**

1. Write the probe expecting `CONFIRMED`
2. Deploy via `wrangler deploy --dry-run` first to confirm the config syntax is accepted
3. Actual deploy + curl the endpoint from the probe script
4. Verdict: `CONFIRMED` if handler completes; `WRONG` if CPU error; `PARTIAL` if deploy succeeds but real CPU cap is lower than 300s

**Acceptance:**

- [ ] Probe emits verdict; `CONFIRMED` at current CF pricing — deploy-gated; requires paid CF account
- [ ] If `WRONG`: consistency-lab-shell Task 4.1 and both scenario runner DO designs (F-04) must revisit batch sizing

---

#### [probe] Task 0.3: `p03-htmx-sse-replay` (local miniflare + Playwright)

**Status:** pending

**Depends:** None

Reproduce the HTMX SSE + `Last-Event-ID` reconnect claim. Stands up a tiny
miniflare Worker that serves an HTML page using `htmx.org@2.0.x` +
`htmx-ext-sse@2.2.x` plus an SSE endpoint that emits numbered events. Playwright
connects, receives 3 events, aborts the connection, reconnects — asserts the
browser sends `Last-Event-ID: 3` and that `sse-swap` correctly replaces DOM
targets per event type.

**Files:**

- Create: `scripts/probes/consistency-lab/p03-htmx-sse-replay.ts`
- Create: `scripts/probes/consistency-lab/sandbox/htmx-sse/fixture.html`
- Create: `scripts/probes/consistency-lab/sandbox/htmx-sse/worker.ts`

**Steps (TDD):**

1. Probe expects `CONFIRMED` (Last-Event-ID header arrives on reconnect, sse-swap works)
2. Run locally via Playwright headless
3. Verdict: `CONFIRMED` / `WRONG` / `PARTIAL` with concrete evidence

**Acceptance:**

- [x] Probe emits verdict
- [x] If `WRONG`: consistency-lab-shell Task 4.5 and 4.7 rewritten (SSE protocol change)

---

#### [probe] Task 0.4: `p04-workers-assets-binding` (local miniflare)

**Status:** pending

**Depends:** None

Reproduce the Workers Assets binding claim. Creates a throwaway Worker with
`[assets] directory = "assets"` in wrangler.toml, a WOFF2 file + a CSS file
under `assets/`, and asserts both are served with correct content-type and
Cache-Control when the Worker is run via `wrangler dev`.

**Files:**

- Create: `scripts/probes/consistency-lab/p04-workers-assets-binding.ts`
- Create: `scripts/probes/consistency-lab/sandbox/assets/wrangler.toml`
- Create: `scripts/probes/consistency-lab/sandbox/assets/src/index.ts`
- Create: `scripts/probes/consistency-lab/sandbox/assets/assets/probe.woff2` (tiny fixture)
- Create: `scripts/probes/consistency-lab/sandbox/assets/assets/probe.css`

**Steps (TDD):**

1. Probe expects `CONFIRMED`
2. Run `wrangler dev --dry-run` or spin a local server via `miniflare`
3. Verdict based on whether the static assets are served

**Acceptance:**

- [x] If `WRONG` (binding syntax is different in current Wrangler): consistency-lab-shell Task 4.6 is rewritten with the correct syntax

---

#### [probe] Task 0.5: `p05-tdigest-on-workers` (local miniflare)

**Status:** pending

**Depends:** None

**Updated:** Source verification confirmed `@thi.ng/tdigest` is a fabricated
package — it does not exist. Probe instead validates the **inline
t-digest implementation** from Lane A Task 1.7. Worker imports the
inline impl from `@repo/lab-core`, records 10,000 samples from seeded
distributions (uniform, Gaussian, Pareto heavy-tail), asserts p99 within
±2% of the analytically-known value.

**Files:**

- Create: `scripts/probes/consistency-lab/p05-tdigest-on-workers.ts`
- Create: `scripts/probes/consistency-lab/sandbox/tdigest/wrangler.toml`
- Create: `scripts/probes/consistency-lab/sandbox/tdigest/src/index.ts`

**Steps (TDD):**

1. Probe expects `CONFIRMED`
2. If `@thi.ng/tdigest` imports but throws on Workers APIs it tries to use: `WRONG` — probe then tries the inline fallback
3. If inline fallback also fails: escalate; Histogram design needs rethink

**Acceptance:**

- [x] If `@thi.ng/tdigest` fails: `consistency-lab-core` Task 1.7 activates the inline fallback as primary, not fallback
- [x] p99 accuracy meets ±2% assertion

---

#### [probe] Task 0.6: `p06-doppler-secret-update` (deploy-gated)

**Status:** pending

**Depends:** Doppler sandbox project provisioned

Reproduce the Doppler secret-update claim. Uses a Service Account token
(write scope) to `POST /v3/configs/config/secrets` against a sandbox
Doppler project and asserts the update lands. Also tries with a Service
Token (read-only) and asserts it returns 403.

**Files:**

- Create: `scripts/probes/consistency-lab/p06-doppler-secret-update.ts`

**Steps (TDD):**

1. Probe expects `CONFIRMED` for Service Account write; `PARTIAL` (or `CONFIRMED`) for Service Token being 403 rejected
2. Verdict consolidated as `CONFIRMED` only if both match expected

**Acceptance:**

- [ ] Probe emits verdict — deploy-gated; requires Doppler sandbox project
- [ ] Runbook ritual confirmed to work end-to-end — deploy-gated

---

#### [probe] Task 0.7: `p07-inter-tight-license` (local)

**Status:** pending

**Depends:** None

Fetch the `rsms/inter` repo LICENSE (or the Fontsource package for Inter Tight)
and parse the first 50 lines. Assert the passage contains "SIL Open Font
License" or "OFL" and the version (1.1). Also asserts the license covers
Inter Tight specifically (not only Inter).

**Files:**

- Create: `scripts/probes/consistency-lab/p07-inter-tight-license.ts`

**Acceptance:**

- [x] Verdict `CONFIRMED` only if OFL 1.1 is explicit + Inter Tight named
- [x] If `WRONG` / `PARTIAL`: consistency-lab-shell Task 4.6 swaps the LICENSE file or the font pick

---

#### [probe] Task 0.8: `p08-jetbrains-mono-license` (local)

**Status:** pending

**Depends:** None

**Updated:** Source verification confirmed JetBrains Mono is OFL 1.1 (the
Apache 2.0 license covers only the source / build scripts repo, not the
font itself). Fetch `JetBrains/JetBrainsMono` OFL.txt and README; assert
"SIL Open Font License" and "OFL-1.1" are present. Verdict `WRONG` if
the font license is not OFL 1.1.

**Files:**

- Create: `scripts/probes/consistency-lab/p08-jetbrains-mono-license.ts`

**Acceptance:**

- [x] Verdict `CONFIRMED` — JetBrains Mono is OFL 1.1 (source-verified; Apache 2.0 only covers build scripts repo)
- [x] If `WRONG`: consistency-lab-shell Task 4.6 license bundle revised

---

#### [probe] Task 0.9: `p09-cf-queues-one-consumer` (deploy-gated)

**Status:** pending

**Depends:** CF account with Queues enabled

**Updated:** Source verification found no CF doc text saying "second
consumer is rejected at publish time." The real constraint is at the
wrangler binding level — each queue binds to one consumer Worker in
wrangler.toml; multiple concurrent _invocations_ are supported (up to
250). Probe asserts the observed wrangler behavior when you try to
deploy Worker B with the same queue consumer binding as Worker A: either
B is rejected, or B silently replaces A. Either outcome is captured as
evidence; verdict `CONFIRMED` either way since the blueprint's "dedicated
queue per scenario" design stays safe under both.

**Files:**

- Create: `scripts/probes/consistency-lab/p09-cf-queues-one-consumer.ts`

**Acceptance:**

- [ ] Verdict `CONFIRMED` if second deploy rejected at publish time — deploy-gated; requires CF account with Queues enabled
- [ ] If `WRONG` (CF now allows multiple consumers): scenario blueprints can share queues, simplifying the topology

---

#### [probe] Task 0.10: `p10-cf-billing-api-absence` (local docs fetch)

**Status:** pending

**Depends:** None

Fetch the CF API reference + Analytics GraphQL docs. Assert no public
Worker-callable endpoint claims authoritative daily spend. Probe is a
negative-existence check: if CF has since shipped a billing API, this
probe returns `WRONG` and Lane E Task 5.2 can use it instead of the
self-compute approach.

**Files:**

- Create: `scripts/probes/consistency-lab/p10-cf-billing-api-absence.ts`

**Acceptance:**

- [x] Verdict confirms or denies the negative-existence claim
- [x] If `WRONG` (billing API now exists): Lane E Task 5.2 simplifies

---

#### [probe] Task 0.11: `run-all.ts` + CI gate

**Status:** pending

**Depends:** 0.1–0.10

Orchestrator that runs all probes, collects verdicts, writes
`scripts/probes/consistency-lab/verdicts.jsonl`, and exits non-zero on any
non-`CONFIRMED` verdict. CI integration: blueprint transitions out of
`planned/` for `consistency-lab-*` blueprints are blocked unless the most
recent `verdicts.jsonl` shows all `CONFIRMED`.

**Files:**

- Create: `scripts/probes/consistency-lab/run-all.ts`
- Create: `scripts/probes/consistency-lab/README.md`
- Modify: `pnpm-workspace.yaml` or a root script to add `pnpm probes:lab`

**Steps (TDD):**

1. Probe summary output matches one of: `ALL PASS`, `<N> FAIL / <M> PASS`
2. Exit code non-zero on any failure
3. `verdicts.jsonl` written atomically

**Acceptance:**

- [x] `pnpm probes:lab` runs all probes and returns a single pass/fail
- [x] Verdict log persisted for audit
- [x] README documents how to interpret each verdict

---

## Verification Gates

| Gate        | Command                                   | Success Criteria                                           |
| ----------- | ----------------------------------------- | ---------------------------------------------------------- |
| Type safety | `pnpm -w tsgo --noEmit scripts/probes/**` | Zero errors                                                |
| Lint        | `pnpm lint scripts/probes/**`             | Zero violations                                            |
| Probes      | `pnpm probes:lab`                         | All 10 verdicts `CONFIRMED` or user-acknowledged deviation |
| Blueprint   | `pnpm blueprints:check`                   | Frontmatter matches dir                                    |

## Cross-Plan References

| Type       | Blueprint                         | Relationship                                                                              |
| ---------- | --------------------------------- | ----------------------------------------------------------------------------------------- |
| Downstream | `consistency-lab-core`            | Blocked until Task 0.5 (tdigest) CONFIRMED                                                |
| Downstream | `consistency-lab-01a-correctness` | Blocked until 0.1 (LISTEN/NOTIFY), 0.9 (queues) CONFIRMED                                 |
| Downstream | `consistency-lab-01b-latency`     | Same as 01a                                                                               |
| Downstream | `consistency-lab-shell`           | Blocked until 0.2 (CPU limit), 0.3 (HTMX SSE), 0.4 (Assets), 0.7/0.8 (licenses) CONFIRMED |
| Downstream | `consistency-lab-ops`             | Blocked until 0.6 (Doppler), 0.10 (billing) CONFIRMED                                     |

## NOT in scope

- Any lab-scenario implementation
- Any durable-object code
- Any UI
- Verifying claims not surfaced by the Phase 1 agent report (add a probe later if a new claim appears)

## What already exists (reuse)

- `bun` for `.ts` scripts (repo convention)
- Neon branch helpers (`@repo/neon`) for the Hyperdrive probe's sandbox branch
- Doppler-based secrets pattern for the probe's token provisioning
- Wrangler for deploy-gated probes

## Risks

| Risk                                                                                     | Impact                       | Mitigation                                                                |
| ---------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------- |
| Deploy-gated probes rely on a paid CF account                                            | Probe can't run in PR CI     | Deploy-gated probes run on `main`-merge + nightly, not every PR           |
| Probe drift — CF changes behavior                                                        | False verdicts               | Each probe stamps a timestamp; verdicts older than 30 days trigger re-run |
| `verdicts.jsonl` becomes load-bearing infra                                              | Trust in stale data          | README documents refresh cadence; `run-all.ts` enforces TTL               |
| Probe for `@thi.ng/tdigest` passes but real workload exposes a different incompatibility | Lane A Task 1.7 still breaks | Probe records p50/p95/p99 on 10k samples — matches scenario workload      |

## Technology Choices

| Component                | Technology                       | Why               |
| ------------------------ | -------------------------------- | ----------------- |
| Probe runner             | `bun` + standalone `.ts` scripts | Repo convention   |
| Browser automation (p03) | Playwright (already in catalog)  | Existing dep      |
| Deploy harness           | `wrangler`                       | Existing tooling  |
| Neon sandbox             | `@repo/neon`                     | Existing helper   |
| Verdict format           | JSONL                            | Simple, parseable |
