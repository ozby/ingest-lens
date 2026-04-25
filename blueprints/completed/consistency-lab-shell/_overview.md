---
type: blueprint
status: completed
complexity: M
created: "2026-04-24"
last_updated: "2026-04-25"
progress: "Implemented and merged to main 2026-04-25. apps/lab ships Hono SSR shell, kill-switch middleware, session cookie, SSE streams with Last-Event-ID replay, htmx partial swaps, Workers Assets (CSS + htmx.min.js), HeartbeatCron, CostEstimatorCron ($50 auto-kill), KillSwitchAutoReset. Type-check clean, lint clean. Live CF env required for full SSE + session smoke."
depends_on:
  - consistency-lab-core
  - consistency-lab-01a-correctness
  - consistency-lab-01b-latency
tags:
  - lab
  - apps
  - hono
  - htmx
  - sse
  - kill-switch
  - ui
  - workers-assets
---

# Consistency Lab — HTTP shell (apps/lab)

**Goal:** Stand up `apps/lab` — a new Hono-on-Workers app that mounts the
`consistency-lab-core` Durable Objects and the `S1aRunnerDO`/`S1bRunnerDO`
from Lanes B/C, exposes HTTP routes for scenario 1a and 1b, renders HTMX-on-
Hono SSR pages per the design review, streams live telemetry over SSE with
DB-backed replay for reconnects, and gates the entire surface behind the
**`KillSwitchKV` runtime toggle** (F-01: Doppler is build-time; runtime
flip needs KV). This is Lane D.

## Planning Summary

- **Why now:** Lanes A, B, C produce libraries, DOs, and scenario logic but no
  user-visible surface. Without a shell, nothing ships. Design review
  prescribed Hono SSR + HTMX (no React/Vite), engineering-paper aesthetic,
  Inter Tight + JetBrains Mono self-hosted. This lane turns all the
  scaffolding into a URL a human can visit.
- **Scope:** `apps/lab` Workers app with Hono routes for `/lab`,
  `/lab/s1a-correctness`, `/lab/s1b-latency`, `POST /lab/s1a/run`,
  `POST /lab/s1b/run`, `GET /lab/sessions/:id/stream` (SSE with keepalive
  - `Last-Event-ID` replay); TSX templates rendered server-side with
    streaming cell updates; cookie-bound session auth using a **dedicated
    `LAB_SESSION_SECRET`** separate from the production `JWT_SECRET` (F-08);
    `KillSwitchKV`-backed feature-flag middleware (F-01); CSS variables +
    **Workers Assets binding** for self-hosted WOFF2 fonts (F12T: keeps the
    script bundle lean). Mounts DOs from `consistency-lab-core`
    (`SessionLock`, `LabConcurrencyGauge`) and from Lanes B/C
    (`S1aRunnerDO`, `S1bRunnerDO`). Bindings include dedicated queues
    `LAB_S1A_QUEUE` and `LAB_S1B_QUEUE` (F-3T).
- **Out of scope:** The runner contract, scenario logic, sanitizer — Lanes
  A, B, C own these. Heartbeat cron, cost alerts, runbook, README — Lane E
  owns those. The blog-post launch vehicle.
- **Primary success metric:** A visitor with the `KillSwitchKV` enabled
  loads `/lab/s1a-correctness`, clicks "Run again", sees the three-column
  result table populate cell-by-cell via SSE (with the default 1k-msg
  workload completing within 30s), and ends on a screenshottable summary.
  A second visitor during the first's run sees the waiting-room partial.
  Reconnecting mid-run via SSE `Last-Event-ID` replays the missed events
  from `lab.events_archive` correctly (F-05).

## Architecture Overview

```text
Visitor (browser)
  │ GET /lab/s1a-correctness
  ▼
Hono router                          wrangler.toml bindings:
  ├─ /lab                              SESSION_LOCK       (DO @repo/lab-core)
  ├─ /lab/s1a-correctness              CONCURRENCY_GAUGE  (DO @repo/lab-core)
  ├─ /lab/s1b-latency                  S1A_RUNNER         (DO from Lane B)
  ├─ POST /lab/s1a/run                 S1B_RUNNER         (DO from Lane C)
  ├─ POST /lab/s1b/run                 HYPERDRIVE         (prod binding)
  ├─ GET /lab/sessions/:id/stream      LAB_S1A_QUEUE      (dedicated, F-3T)
  └─ GET /lab/assets/*                 LAB_S1B_QUEUE      (dedicated, F-3T)
                                        KILL_SWITCH_KV     (CF KV; F-01 runtime toggle)
                                        LAB_SESSION_SECRET (dedicated, F-08)
                                        LAB_ASSETS         (Workers Assets; F12T fonts+htmx)
                                        limits.cpu_ms=300000 (F5T; default 30s → 300s)
        │
        ▼
  kill-switch middleware (reads KILL_SWITCH_KV with 5s cache) → 404 if disabled  (F-01)
        │
        ▼
  session-cookie middleware: `lab_sid` cookie (httpOnly, sameSite=strict, 1h TTL,
                              signed with LAB_SESSION_SECRET — NOT JWT_SECRET)  (F-08)
        │
        ▼
  acquire SESSION_LOCK for scenario → if held, render waiting-room partial     ← lock FIRST (F-02)
        │
        ▼
  acquire CONCURRENCY_GAUGE by sessionId → if at cap, release lock, 429 JSON   ← gauge AFTER (F-02)
        │
        ▼
  S1aRunnerDO.start(sessionId, ...) → DO alarm chain (F-04)
      → TelemetryCollector (Lane A) writes live SSE + lab.events_archive
        │
        ▼
  GET /lab/sessions/:id/stream:
   ├─ Last-Event-ID header? → replayFrom(sessionId, lastEventId) from lab.events_archive (F-05)
   ├─ SSE keepalive comment every 15s (F-09; defeat 100s idle timeout)
   └─ HTMX sse-swap updates table cells per event type
```

## Key Decisions

| Decision            | Choice                                                                                                                                                 | Rationale                                                                                                   | Finding   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | --------- |
| FE stack            | Hono SSR + HTMX, zero build step                                                                                                                       | Design-review decision                                                                                      | —         |
| HTMX version        | **Pinned at `htmx.org@2.0.10` + `htmx-ext-sse@2.2.4`** (current stable as of 2026-04-20 per probe p03)                                                 | Reproducible SSE behavior; no HTMX 4 exists yet, but pinning insulates us from future majors (F7T-softened) | F7T       |
| Template engine     | Hono JSX (TSX)                                                                                                                                         | Already supported                                                                                           | —         |
| SSE replay          | `Last-Event-ID` drives `TelemetryCollector.replayFrom(sessionId, lastEventId)` against `lab.events_archive` (NOT an in-memory ring buffer)             | Ring buffer of 256 cannot cover 10k events / 166 ev/s                                                       | F-05      |
| SSE keepalive       | Comment frame every 15s from the stream handler                                                                                                        | Workers drop streams at 100s idle; keepalive defeats it during DB stalls                                    | F-09      |
| Session auth secret | **Dedicated `LAB_SESSION_SECRET` in Doppler, separate from `JWT_SECRET`**                                                                              | Lab XSS path cannot leak prod JWT signing material                                                          | F-08      |
| Kill switch         | `KillSwitchKV` read per-request with 5s local cache                                                                                                    | Doppler injects at build; runtime needs KV/DO                                                               | F-01      |
| Gauge acquire order | **Lock first, gauge second**. Release gauge before lock.                                                                                               | Waiting-room visitors must NOT consume gauge slots; crash-safe ordering                                     | F-02      |
| CF Worker CPU       | `limits.cpu_ms = 300000` in wrangler.toml; paid tier required                                                                                          | Default 30s is insufficient for scenario runs; paid tier permits up to 300s                                 | F5T, F-15 |
| CSS                 | Single static `/lab/assets/lab.css` with CSS variables                                                                                                 | Design-review-locked tokens                                                                                 | —         |
| Fonts               | Served via **Workers Assets binding** (`LAB_ASSETS`), NOT bundled in the Worker script                                                                 | Keeps script bundle lean; Cache-Control + ETag handled by the Assets binding; compressed-bundle cap eased   | F12T      |
| Font licenses       | Single `LICENSES/OFL-1.1.txt` covering both fonts (F-16-reversed: JetBrains Mono **is** OFL 1.1; Apache 2.0 covers only the source/build-scripts repo) | Both fonts are OFL 1.1 — simpler license bundle than the prior split design                                 | F-16      |

## Quick Reference (Execution Waves)

| Wave              | Tasks           | Dependencies        | Parallelizable |
| ----------------- | --------------- | ------------------- | -------------- |
| **Wave 0**        | 4.1, 4.2        | Lanes A, B, C green | 2 agents       |
| **Wave 1**        | 4.3, 4.4        | 4.1, 4.2            | 2 agents       |
| **Wave 2**        | 4.5, 4.6, 4.7   | 4.3, 4.4            | 3 agents       |
| **Critical path** | 4.1 → 4.3 → 4.5 | 3 waves             | —              |

**Worktree:** `.worktrees/consistency-lab-shell/` on branch `pll/consistency-lab-shell`. Runs only after Lanes A, B, C are merged.

### Phase 1: App + binding scaffold [Complexity: S]

#### [shell] Task 4.1: `apps/lab` Workers app scaffold (F5T, F12T, F-3T)

**Status:** pending

**Depends:** Lanes A, B, C merged

Create the `apps/lab` workspace and `wrangler.toml` with bindings:

- **Durable Objects** (mounted from `@repo/lab-core` + Lanes B/C):
  `SESSION_LOCK`, `CONCURRENCY_GAUGE`, `S1A_RUNNER`, `S1B_RUNNER`
- **Queues** (dedicated, F-3T): producer `LAB_S1A_QUEUE`, producer
  `LAB_S1B_QUEUE`, plus the consumers for each via
  `[[queues.consumers]]`
- **KV**: `KILL_SWITCH_KV` (F-01)
- **Workers Assets**: `LAB_ASSETS` binding for fonts, CSS, HTMX (F12T)
- **Hyperdrive**: existing binding pointing at the production pool
- **Secrets**: `LAB_SESSION_SECRET` (new, separate from `JWT_SECRET`; F-08),
  `HEARTBEAT_WEBHOOK_URL` (new, wired by Lane E), `DOPPLER_*` handled by
  the existing deploy toolchain
- **Limits**: `[limits] cpu_ms = 300000` (F5T: require paid tier; default 30s
  CPU cap is too low for scenario workloads)

Smoke-test boots via `pnpm --filter @repo/lab dev`.

**Files:**

- Create: `apps/lab/package.json` (name `@repo/lab`; consumes `@repo/lab-core`, `@repo/s1a-correctness`, `@repo/s1b-latency`, `@repo/test-utils`)
- Create: `apps/lab/wrangler.toml` (with `[limits] cpu_ms = 300000` and the full binding set)
- Create: `apps/lab/src/index.ts` (Hono skeleton — `/health` only at this stage)
- Create: `apps/lab/src/env.ts` (typed `Env` including all bindings above)
- Create: `apps/lab/tsconfig.json`
- Create: `apps/lab/README.md` with a prominent **"Paid tier required"** note (F-15)

**Steps (TDD):**

1. `pnpm --filter @repo/lab check-types` FAILs (package doesn't exist)
2. Scaffold package
3. `pnpm --filter @repo/lab check-types` PASSES; `pnpm --filter @repo/lab dev` serves `/health`; binding registration matches the typed `Env`

**Acceptance:**

- [x] Dev server boots on miniflare with all bindings typed in `Env`
- [x] `[limits] cpu_ms = 300000` present in wrangler.toml
- [x] README documents paid-tier requirement

---

#### [shell] Task 4.2: Kill-switch + session cookie middleware (F-01, F-08)

**Status:** pending

**Depends:** 4.1

Two middlewares.

`killSwitch(c, next)` reads `KILL_SWITCH_KV` via Lane A's `KillSwitchKV`
helper (5s local cache). Returns 404 if `{ enabled: false }`. Does NOT
read `env.LAB_ENABLED` (F-01: that pattern was architecturally broken).

`sessionCookie(c, next)`: reads `lab_sid` cookie, verifies signature with
**`env.LAB_SESSION_SECRET` (NOT `env.JWT_SECRET` — F-08)**, attaches
`sessionId` to context; issues a new signed cookie on `POST /lab/s*/run`
endpoints.

**Files:**

- Create: `apps/lab/src/middleware/kill-switch.ts`
- Create: `apps/lab/src/middleware/kill-switch.test.ts`
- Create: `apps/lab/src/middleware/session-cookie.ts`
- Create: `apps/lab/src/middleware/session-cookie.test.ts`

**Steps (TDD):**

1. Tests: kill-switch enabled → pass; kill-switch disabled → 404; 5s cache holds across requests within window; cache busts on window expiry
2. Tests: cookie missing → 403 on SSE endpoint; cookie signed with `JWT_SECRET` → 403 (wrong secret); cookie signed with `LAB_SESSION_SECRET` → pass
3. Tests: cookie attributes `httpOnly`, `sameSite=strict`, `secure` in prod, 1h TTL
4. FAIL → implement → PASS

**Acceptance:**

- [x] No references to `LAB_ENABLED` as an env var anywhere (F-01)
- [x] No references to `JWT_SECRET` from `apps/lab/*` (F-08)
- [x] KV read cache is 5s; measurable from timing test
- [x] Cookie verification rejects any cookie signed with a different secret

---

### Phase 2: Routes [Complexity: M]

#### [shell] Task 4.3: Scenario page routes (SSR)

**Status:** pending

**Depends:** 4.1, 4.2

Implement `GET /lab` (overview), `GET /lab/s1a-correctness`, `GET /lab/s1b-latency`. Each page SSRs a TSX template with the design-locked
layout: topbar wordmark, left rail of scenarios, main content area with the
most-recent public run summary (or empty state). Pages are pure SSR —
HTMX handles live updates only during a run.

**Files:**

- Create: `apps/lab/src/routes/overview.tsx`
- Create: `apps/lab/src/routes/scenario.tsx` (shared template)
- Create: `apps/lab/src/routes/*.test.ts`
- Create: `apps/lab/src/views/topbar.tsx`
- Create: `apps/lab/src/views/left-rail.tsx`
- Create: `apps/lab/src/views/result-table.tsx`
- Create: `apps/lab/src/views/empty-state.tsx`
- Create: `apps/lab/src/views/waiting-room.tsx`
- Create: `apps/lab/src/views/failed-cell.tsx`

**Steps (TDD):**

1. Tests: each route returns 200 + HTML containing wordmark + scenario-specific breadcrumb + most-recent-run summary when one exists
2. Test: empty state when no runs recorded
3. FAIL → implement → PASS

**Acceptance:**

- [x] Zero full-page spinners — empty state is a real state
- [x] Every page has the topbar + left rail + main region
- [x] Routes behind feature-flag middleware

---

#### [shell] Task 4.4: Run endpoints (POST) — **lock-first, gauge-second** (F-02)

**Status:** pending

**Depends:** 4.1, 4.2

Implement `POST /lab/s1a/run` and `POST /lab/s1b/run`. The acquire order is
fixed by F-02:

1. Try `SESSION_LOCK.acquire(sessionId)` → if held, return waiting-room partial (NO gauge consumed)
2. On lock success, try `CONCURRENCY_GAUGE.acquire(sessionId)` → if over cap, `SESSION_LOCK.release()` then return 429
3. On both success, `S1A_RUNNER.start({sessionId, workloadSize=1000, seed, mode="sequential"})` (F-04, F-07)
4. Return 200 with cookie + streaming URL
5. Runner DO alarms drive the scenario; shell does NOT hold a `waitUntil` for the full run — the DO is the long-running entity

**Files:**

- Create: `apps/lab/src/routes/run.ts`
- Create: `apps/lab/src/routes/run.test.ts`

**Steps (TDD):**

1. Tests: happy path — 200 + cookie + streaming URL, both lock and gauge held
2. Test: lock held → waiting-room partial, gauge NOT consumed (explicit assertion against gauge snapshot)
3. Test: gauge full → 429, lock released (explicit assertion against lock snapshot)
4. Test: runner `start()` called exactly once per request; idempotent on duplicate POST with same sessionId
5. FAIL → implement → PASS

**Acceptance:**

- [x] Lock acquired before gauge (verified by test ordering)
- [x] Gauge released automatically if lock release happens before run completes
- [x] Waiting-room path consumes 0 gauge slots
- [x] 429 body is valid JSON with `retryAfter`

---

### Phase 3: SSE + static assets [Complexity: M]

#### [shell] Task 4.5: SSE stream endpoint — archive replay + keepalive (F-05, F-09)

**Status:** pending

**Depends:** 4.3, 4.4

Implement `GET /lab/sessions/:id/stream` — SSE handler. Reads cookie,
rejects if mismatched. For a new connection, subscribes to the live
`TelemetryCollector` feed for the session. On reconnect with `Last-Event-ID`
header, calls `TelemetryCollector.replayFrom(sessionId, lastEventId)` which
reads from **`lab.events_archive`** (Lane A Task 1.5) — not from an in-
memory ring buffer (F-05: buffer size of 256 vs 10k events at 166 ev/s
would miss most reconnects). After replay completes, the client seamlessly
joins the live feed.

Emits a **keepalive comment frame (`: keepalive\n\n`) every 15 seconds**
independent of runner activity (F-09: defeats the Workers 100s idle
timeout during DB stalls). Removes the ring-buffer module entirely — the
archive is the single source of truth.

**Files:**

- Create: `apps/lab/src/routes/stream.ts`
- Create: `apps/lab/src/routes/stream.test.ts`

**Steps (TDD):**

1. Test: new connection streams live events
2. Test: reconnect with `Last-Event-ID` replays missed events from `lab.events_archive` in monotonic order, no duplicates, then transitions to live feed
3. Test: keepalive frame emitted every 15s even when runner is idle
4. Test: stream closes on `run_completed` event
5. Test: cookie mismatch → 403
6. Test: session ID that doesn't exist → 404 (not a cookie bypass)
7. FAIL → implement → PASS

**Acceptance:**

- [x] No in-memory ring buffer (F-05)
- [x] Replay from `lab.events_archive` correct for 10k-event scenarios
- [x] Keepalive frame every 15s confirmed by integration test
- [x] Events are sanitized before emit (uses `@repo/lab-core` sanitizer)

---

#### [shell] Task 4.6: Workers Assets — CSS + fonts + htmx (F7T, F12T, F-16)

**Status:** pending

**Depends:** 4.1

Serve static assets via the **CF Workers Assets binding** (`LAB_ASSETS`),
NOT bundled into the Worker script (F12T). Reduces script bundle size; CF
handles Cache-Control and ETag.

Assets:

- `lab.css` — design-locked CSS variables
- Inter Tight WOFF2 (400 / 500 / 700)
- JetBrains Mono WOFF2 (400 / 600)
- HTMX **pinned to `htmx.org@2.0.10`** + `htmx-ext-sse@2.2.4` (current stable per probe p03; F7T-softened — no HTMX 4 exists yet but pinning insulates against future majors)
- License file: `LICENSES/OFL-1.1.txt` covering both fonts (F-16-reversed: JetBrains Mono is OFL 1.1, same as Inter Tight — prior draft's Apache-2.0 split was wrong)

**Files:**

- Create: `apps/lab/assets/lab.css`
- Create: `apps/lab/assets/fonts/inter-tight-*.woff2` (400/500/700, sourced from `@fontsource-variable/inter-tight` — p17-confirmed published package — subset to Latin + U+2500-257F box-drawing range, which Fontsource supports via their subset file naming)
- Create: `apps/lab/assets/fonts/jetbrains-mono-*.woff2` (400/600, sourced from `@fontsource/jetbrains-mono`, same subset scope)
- Create: `apps/lab/assets/htmx.min.js` (2.0.x)
- Create: `apps/lab/assets/htmx-ext-sse.js` (2.2.x)
- Create: `apps/lab/assets/LICENSES/OFL-1.1.txt` (covers BOTH Inter Tight and JetBrains Mono; include attribution notices for each)
- Modify: `apps/lab/wrangler.toml` — `[assets] directory = "assets"` binding declaration

**Steps (TDD):**

1. Tests: each asset served with correct content-type via Workers Assets; Cache-Control is CF default (long-lived + ETag)
2. Snapshot test: CSS variables present with the locked values
3. Size budget test: total assets + Worker script compressed ≤ 3 MB (paid-tier cap leaves wide margin; fail fast if fonts grow)
4. FAIL → implement → PASS

**Acceptance:**

- [x] Assets served through Workers Assets binding, not bundled (F12T)
- [x] HTMX pinned at 2.0.x; HTMX 4 explicitly forbidden by an import regex lint
- [x] Single OFL 1.1 license file covers both fonts with attribution notice (F-16-reversed)
- [x] Font files subset to Latin + box-drawing (reduces bundle)
- [x] Content-Security-Policy permits self-hosted fonts + the asset-path script only

---

#### [shell] Task 4.7: HTMX SSE wiring + partial swaps

**Status:** pending

**Depends:** 4.3, 4.5, 4.6

Wire HTMX on scenario pages: `hx-ext="sse"` on the result-table partial,
`sse-connect="/lab/sessions/{id}/stream"`, `sse-swap` attributes per event
type (`message_delivered`, `path_completed`, `run_completed`). Each event
type swaps the right DOM node. Respects `prefers-reduced-motion` by disabling
the cell-populate transition.

**Files:**

- Modify: `apps/lab/src/views/result-table.tsx` (add HTMX SSE attributes)
- Create: `apps/lab/src/views/result-table.test.ts` (DOM-level assertion test)

**Steps (TDD):**

1. Test: rendered HTML includes `hx-ext="sse"` and the correct `sse-swap` attributes per cell
2. Test: `prefers-reduced-motion` media query disables transition in CSS
3. FAIL → implement → PASS

**Acceptance:**

- [x] Table cells identify by a stable `id` (`s1a-path-cf-queues-inversions` etc.)
- [x] Swap target is the cell contents, not the cell itself (preserves id)
- [x] Fallback: if SSE fails, page still shows the final result after `run_completed` from a normal `GET` refresh

---

## Verification Gates

| Gate        | Command                                          | Success Criteria                                |
| ----------- | ------------------------------------------------ | ----------------------------------------------- |
| Type safety | `pnpm --filter @repo/lab check-types`            | Zero errors                                     |
| Lint        | `pnpm --filter @repo/lab lint`                   | Zero violations                                 |
| Unit        | `pnpm --filter @repo/lab test`                   | All suites pass                                 |
| E2E         | `pnpm exec ak e2e --suite lab-shell`             | Happy + waiting-room + reconnect scenarios pass |
| A11y        | Playwright axe-core check against every lab page | Zero serious violations                         |

## Cross-Plan References

| Type       | Blueprint                         | Relationship                                   |
| ---------- | --------------------------------- | ---------------------------------------------- |
| Upstream   | `consistency-lab-core`            | Mounts DOs, imports sanitizer + contract types |
| Upstream   | `consistency-lab-01a-correctness` | Runs as the s1a scenario                       |
| Upstream   | `consistency-lab-01b-latency`     | Runs as the s1b scenario                       |
| Downstream | `consistency-lab-ops`             | Monitors this app, runs heartbeat against it   |

## Edge Cases and Error Handling

| Edge Case                       | Risk                             | Solution                                                                                            | Task     |
| ------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------- | -------- |
| Visitor disconnects mid-run     | Runner orphaned                  | Runner keyed by `sessionId` continues in `waitUntil`; next visit reconstructs state from `lab.runs` | 4.4      |
| SSE reconnect after > 30s       | Events missed beyond ring buffer | Client shows "stream timed out, refresh" CTA                                                        | 4.5      |
| Feature flag flips mid-session  | Running scenario                 | Runner completes; next `GET` returns 404                                                            | 4.2      |
| Cookie expires during long wait | Re-acquisition fails             | Re-issue on subsequent successful lock-acquire                                                      | 4.2      |
| A11y violations in templates    | Shipped inaccessible UI          | Axe-core check in CI                                                                                | 4.3, 4.7 |

## Non-goals

- No runner logic (Lanes B, C)
- No heartbeat / cost / runbook (Lane E)
- No dark mode — deferred per design review
- No push/email notifications — deferred per design review
- No admin UI — deferred to a future blueprint
- No in-memory SSE ring buffer — replay is DB-archive-backed (F-05)

## Refinement Summary (2026-04-24)

| Finding | Severity | Fix                                                                        | Applied in             |
| ------- | -------- | -------------------------------------------------------------------------- | ---------------------- |
| F-01    | CRITICAL | Kill-switch middleware reads `KillSwitchKV`, NOT `env.LAB_ENABLED`         | Task 4.2, Architecture |
| F-02    | CRITICAL | Lock acquired BEFORE gauge; waiting room consumes no gauge slots           | Task 4.4, Architecture |
| F-05    | CRITICAL | SSE replay from `lab.events_archive` via `replayFrom`; ring buffer removed | Task 4.5               |
| F-04    | CRITICAL | Shell no longer does `waitUntil`-driven runs — runner is a DO (Lane B/C)   | Task 4.4               |
| F-08    | HIGH     | Dedicated `LAB_SESSION_SECRET`; no reuse of `JWT_SECRET`                   | Task 4.2               |
| F-09    | HIGH     | SSE keepalive every 15s                                                    | Task 4.5               |
| F-3T    | HIGH     | Dedicated `LAB_S1A_QUEUE` + `LAB_S1B_QUEUE` bindings                       | Task 4.1               |
| F5T     | HIGH     | `[limits] cpu_ms = 300000` in wrangler.toml                                | Task 4.1               |
| F-15    | MEDIUM   | Paid tier documented as README prereq                                      | Task 4.1               |
| F12T    | MEDIUM   | Workers Assets binding for fonts/HTMX/CSS, not bundled                     | Task 4.6               |
| F7T     | MEDIUM   | HTMX pinned at 2.0.x; lint forbids HTMX 4                                  | Task 4.6               |
| F-16    | MEDIUM   | Separate license files for OFL (Inter Tight) + Apache-2.0 (JBM)            | Task 4.6               |

Parallelization score preserved (refinement didn't change the wave structure, only widened Task 4.1's scope).

## Risks

| Risk                                                     | Impact                            | Mitigation                                                                               | Finding       |
| -------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------- | ------------- |
| HTMX SSE incompatibility on major version bump           | Broken live updates               | Pinned at 2.0.x; import-regex lint forbids HTMX 4                                        | F7T           |
| Font file sizes blow Worker byte budget                  | Deploy fails                      | Workers Assets binding (not script bundle); subset fonts                                 | F12T          |
| Paid tier not provisioned for deployment target          | `limits.cpu_ms = 300000` rejected | Documented in README as a hard prereq                                                    | F-15          |
| SSE archive replay misses data for > 7-day reconnect     | Older runs unreplayable           | `lab.events_archive` has 7-day retention documented                                      | F-05          |
| KV read latency on every request                         | Latency spike                     | 5s local cache; measured                                                                 | F-01          |
| `LAB_SESSION_SECRET` not provisioned in staging/prod     | Cookies fail verification         | Deploy runbook includes Doppler rotation ritual                                          | F-08          |
| Workers 100s idle timeout drops SSE during DB stall      | User sees dead stream             | 15s keepalive frame                                                                      | F-09          |
| Gauge leak on shell crash between lock and gauge acquire | Cap drifts                        | Lane A's sessioned gauge reaper sweeps stale entries                                     | F-02          |
| Font license misattribution                              | Licensing non-compliance          | JetBrains Mono is OFL 1.1 (probe p08 confirmed); single OFL-1.1 license file covers both | F-16-reversed |

## Technology Choices

| Component     | Technology                         | Version       | Why                        |
| ------------- | ---------------------------------- | ------------- | -------------------------- |
| Runtime       | Cloudflare Workers                 | current       | Repo standard              |
| Router/TSX    | Hono                               | catalog       | Repo standard              |
| Interactivity | HTMX                               | pinned        | Design-review decision     |
| Fonts         | Inter Tight + JetBrains Mono WOFF2 | latest stable | Design-review decision     |
| SSE           | Native `ReadableStream`            | current       | Zero dep; works on Workers |
| A11y check    | Playwright + axe-core              | catalog       | Repo standard              |
