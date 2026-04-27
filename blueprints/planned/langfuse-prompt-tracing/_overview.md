---
type: blueprint
status: planned
complexity: M
created: "2026-04-27"
last_updated: "2026-04-27"
progress: "0% (planned) — refined 2026-04-27"
depends_on:
  - ai-payload-intake-mapper
tags:
  - ai
  - observability
  - langfuse
  - prompt-management
  - open-telemetry
---

# Langfuse prompt management and AI tracing

**Goal:** Add Langfuse prompt versioning and per-call tracing to the Workers AI
intake pipeline so every `suggestMappings` call is observable with latency,
confidence, token usage, and prompt version, without breaking the existing
Analytics Engine telemetry or deterministic test runner.

## Planning Summary

- **Current state:** `apps/workers/src/intake/aiMappingAdapter.ts` builds the
  primary prompt inline and discards model timing/token metadata before the
  route sees the result. `apps/workers/src/routes/intake.ts` calls
  `suggestMappings()` directly and only emits aggregate lifecycle telemetry via
  `apps/workers/src/telemetry.ts`.
- **Workers-compatible Langfuse surface:** `@langfuse/client` is the only
  Langfuse JS package documented for Universal JS. `@langfuse/tracing` and
  `@langfuse/otel` remain Node.js-only, so this plan uses the client for prompt
  fetch + score ingest and manual OTLP HTTP/JSON for trace export.
- **Config correction:** Langfuse docs use `LANGFUSE_BASE_URL`, not
  `LANGFUSE_HOST`. This blueprint adopts `LANGFUSE_PUBLIC_KEY`,
  `LANGFUSE_SECRET_KEY`, and `LANGFUSE_BASE_URL`.
- **Prompt strategy:** Use `langfuse.prompt.get("payload-mapper", { label:
  "production", cacheTtlSeconds: 60, fallback })`. Langfuse already provides
  client-side caching and optional fallback, so no repo-local `Map` cache is
  needed.
- **Tracing strategy:** Build one manual OTLP generation span for the primary
  mapping call and POST it to `/api/public/otel/v1/traces` using Basic Auth and
  `x-langfuse-ingestion-version: 4`.
- **Score strategy:** Create a single `overall_confidence` score linked to the
  trace and explicitly call `langfuse.flush()` inside
  `c.executionCtx.waitUntil(...)` because Workers are short-lived.
- **Scope hardening:** V1 manages and traces the primary mapping prompt only.
  Advisory judge prompt migration and judge-span tracing are deferred to a
  follow-up blueprint to keep the first rollout reviewable and parallelizable.

## Fact-Checked Findings

| ID | Severity | Claim | Reality / source | Blueprint fix |
| -- | -------- | ----- | ---------------- | ------------- |
| F1 | **CRITICAL** | `@langfuse/tracing` / `@langfuse/otel` can run in Workers | Langfuse JS README lists `@langfuse/client` as Universal JS, while `@langfuse/tracing` and `@langfuse/otel` are `Node.js 20+` only. | Use `@langfuse/client` only; export traces via manual OTLP HTTP/JSON. |
| F2 | HIGH | The env var should be `LANGFUSE_HOST` | Langfuse SDK docs and prompt docs use `LANGFUSE_BASE_URL` / constructor `baseUrl`. | Rename all plan references to `LANGFUSE_BASE_URL`. |
| F3 | HIGH | We need a custom in-memory prompt cache | Langfuse prompt-management docs state prompts are cached client-side, stale prompts are served immediately, and `cacheTtlSeconds` controls TTL. | Remove custom `Map` caching from the plan; use SDK caching only. |
| F4 | HIGH | `score.create()` is enough in Workers | Langfuse score docs explicitly say to `await langfuse.flush()` in short-lived environments. | Queue score creation and schedule `langfuse.flush()` via `c.executionCtx.waitUntil(...)`. |
| F5 | HIGH | `crypto.randomUUID()` directly satisfies Langfuse trace-id format | Langfuse trace-id docs require 32 lowercase hex chars for trace IDs and 16 hex chars for observation IDs. `crypto.randomUUID()` includes hyphens. | Derive OTLP trace IDs from `mappingTraceId.replace(/-/g, "")`; generate 16-hex span IDs separately. |
| F6 | MEDIUM | `ctx.waitUntil(...)` is the right route API | Hono’s Cloudflare `Context` exposes `c.executionCtx.waitUntil(...)`. | Use `c.executionCtx.waitUntil(...)` in the route task. |
| F7 | MEDIUM | Any OTLP endpoint details are inferred | Langfuse OTLP docs specify `/api/public/otel/v1/traces`, Basic Auth, and `x-langfuse-ingestion-version: 4`; HTTP/JSON is supported. | Use the documented endpoint and headers verbatim. |
| F8 | MEDIUM | Current adapter already exposes enough data for latency/token tracing | `StructuredRunner` currently returns only the parsed object; timing and usage are discarded before route integration. | Add adapter-side telemetry capture and return it in a non-persisted runtime field. |
| F9 | MEDIUM | Judge-prompt migration belongs in the same first rollout | The current code has an optional judge path with separate prompt construction and potentially multiple extra spans/scores, which expands risk and file overlap. | Defer judge-prompt Langfuse migration/tracing to v2; keep the hardcoded judge prompt for now. |
| F10 | LOW | New Wrangler env blocks are required | `apps/workers/wrangler.toml` already has `[env.dev.vars]` and `[env.prd.vars]`. | Append `LANGFUSE_BASE_URL` to existing blocks only. |

## Architecture Overview

```text
Before:
  route/intake.ts
    -> suggestMappings()
         -> buildMappingPrompt()         // hardcoded
         -> generateObject()             // usage/timing discarded
    -> recordIntakeLifecycle()           // CF Analytics only

After:
  route/intake.ts
    -> resolveMappingPromptFromLangfuse()    // SDK cache + fallback
    -> suggestMappings(primaryPromptText=...)
         -> generateObject()
         -> return runtime telemetry         // duration, usage, prompt text, status
    -> dispatchIntakeLangfuse()              // trace payload + overall_confidence score
    -> c.executionCtx.waitUntil(Promise.allSettled([...tracePost, flush]))
    -> recordIntakeLifecycle()               // unchanged
```

```text
┌──────────────────────────────────────────────────────────┐
│                    Cloudflare Worker                     │
│                                                          │
│ POST /api/intake/mapping-suggestions                     │
│   │                                                      │
│   ├─ resolveMappingPromptFromLangfuse()                  │
│   │   ├─ prompt.get("payload-mapper", {                  │
│   │   │    label: "production",                          │
│   │   │    cacheTtlSeconds: 60,                          │
│   │   │    fallback: <current hardcoded prompt>          │
│   │   │  })                                              │
│   │   └─ compile(vars) -> promptText + promptVersion     │
│   │                                                      │
│   ├─ suggestMappings(primaryPromptText=promptText)       │
│   │   └─ runtime telemetry                               │
│   │      { model, startedAt, endedAt, usage, output }    │
│   │                                                      │
│   ├─ dispatchIntakeLangfuse()                            │
│   │   ├─ build OTLP JSON generation span                 │
│   │   ├─ POST {BASE_URL}/api/public/otel/v1/traces       │
│   │   ├─ score.create({ traceId, name, value })          │
│   │   └─ flush()                                         │
│   │                                                      │
│   ├─ c.executionCtx.waitUntil(Promise.allSettled(...))   │
│   │                                                      │
│   └─ recordIntakeLifecycle()                             │
└──────────────────────────────────────────────────────────┘
```

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Prompt-management scope | Primary mapping prompt only in v1 | Smallest slice that delivers prompt versioning to the core AI path without dragging the optional judge path into the first rollout |
| Langfuse package usage | `@langfuse/client` only | Officially Universal JS; prompt retrieval and score ingestion work without Node-only tracing packages |
| Trace transport | Manual OTLP HTTP/JSON | Workers-compatible, doc-backed, zero OpenTelemetry SDK dependencies |
| Prompt cache | Langfuse SDK `cacheTtlSeconds` | Built-in stale-while-revalidate behavior already covers availability and latency goals |
| Fallback prompt | Current hardcoded primary prompt text | Preserves deterministic local behavior when Langfuse is unreachable |
| Score scope | `overall_confidence` only in v1 | Keeps `waitUntil` fan-out bounded and avoids per-suggestion flush pressure |
| Flush model | `c.executionCtx.waitUntil(langfuse.flush())` | Required for short-lived environments per Langfuse docs |
| Trace ID correlation | `mappingTraceId` with hyphens stripped | Preserves existing correlation semantics while satisfying 32-hex Langfuse trace-id format |
| Existing telemetry | Keep Cloudflare Analytics Engine | Langfuse is additive, not a replacement for current aggregate lifecycle telemetry |
| Judge prompt/tracing | Deferred | Avoids broadening file overlap and trace-shape complexity in the first implementation |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort |
| ---- | ----- | ------------ | -------------- | ------ |
| **Wave 0** | 1.1, 1.2, 2.2, 3.1 | None | 4 agents | XS-M |
| **Wave 1** | 2.1, 3.2 | Wave 0 (partial) | 2 agents | S-M |
| **Wave 2** | 4.1 | Wave 1 | 1 agent | M |
| **Critical path** | 3.1 → 3.2 → 4.1 | -- | 3 waves | M |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ planned agents / 2 | 4 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 2.33 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 1.14 |
| CP | same-file overlaps per wave | 0 | 0 |

Refinement delta: split the original monolithic route-integration task into
prompt resolution, OTLP export, adapter telemetry, and final route wiring. This
removes shared-file conflicts from early waves and fixes incorrect runtime
assumptions.

**Parallelization score:** B (good width, zero conflicts, modest fan-in at the
final route task)

**Blueprint compliant:** Yes

---

### Phase 1: Dependencies and configuration [Complexity: S]

#### [deps] Task 1.1: Add `@langfuse/client` to the Worker package

**Status:** pending

**Depends:** None

Install the only Langfuse JS package documented for Universal JS environments.
Do **not** add `@langfuse/tracing`, `@langfuse/otel`, or any
`@opentelemetry/sdk-*` packages.

**Files:**

- Modify: `apps/workers/package.json`
- Modify: `pnpm-lock.yaml`

**Steps (TDD):**

1. Add `@langfuse/client` to `apps/workers/package.json`.
2. Run: `pnpm --filter @repo/workers check-types` — verify PASS.
3. Run: `pnpm --filter @repo/workers build` — verify PASS.
4. Verify the package manifest does **not** include `@langfuse/tracing`,
   `@langfuse/otel`, or `@opentelemetry/sdk-*`.

**Acceptance:**

- [ ] `@langfuse/client` is present under `apps/workers/package.json` dependencies
- [ ] No Node-only Langfuse/OTel tracing package is added
- [ ] `pnpm --filter @repo/workers check-types` passes
- [ ] `pnpm --filter @repo/workers build` passes

---

#### [config] Task 1.2: Add `LANGFUSE_BASE_URL` and Worker env typing

**Status:** pending

**Depends:** None

Add Langfuse configuration to the Worker’s typed env surface and existing
Wrangler env-var blocks. `LANGFUSE_BASE_URL` is plaintext config; API keys stay
in Doppler / Wrangler secrets and are never committed.

**Files:**

- Modify: `apps/workers/src/db/client.ts`
- Modify: `apps/workers/wrangler.toml`

**Steps:**

1. Extend `Env` with optional `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and
   `LANGFUSE_BASE_URL`.
2. Append `LANGFUSE_BASE_URL = "https://cloud.langfuse.com"` to both
   `[env.dev.vars]` and `[env.prd.vars]`.
3. Add `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` to Doppler-backed Worker
   secrets outside the repo.
4. Run: `pnpm --filter @repo/workers check-types` — verify PASS.

**Acceptance:**

- [ ] Worker `Env` includes the three Langfuse fields
- [ ] `LANGFUSE_BASE_URL` exists in both Wrangler env blocks
- [ ] No plaintext key is committed
- [ ] `pnpm --filter @repo/workers check-types` passes

---

### Phase 2: Prompt resolution and OTLP export helpers [Complexity: S]

#### [prompts] Task 2.1: Create a primary-prompt Langfuse resolver with fallback

**Status:** pending

**Depends:** Task 1.1, Task 1.2

Create a small helper that fetches the `payload-mapper` prompt from Langfuse,
uses the `production` label, relies on SDK caching, and falls back to the
current hardcoded prompt text when Langfuse is unavailable. The helper should
return compiled text plus prompt metadata that route code can pass into
`suggestMappings()`.

**Files:**

- Create: `apps/workers/src/langfuse/prompts.ts`
- Create: `apps/workers/src/tests/langfusePrompts.test.ts`

**Steps (TDD):**

1. Write `langfusePrompts.test.ts` to cover:
   - `LangfuseClient` constructed with `baseUrl: env.LANGFUSE_BASE_URL`
   - `prompt.get("payload-mapper", { label: "production", cacheTtlSeconds: 60, fallback })`
   - compiled prompt text contains contract/source/payload fields
   - fallback metadata uses the existing prompt version when Langfuse is unavailable
2. Run: `pnpm --filter @repo/workers test -- src/tests/langfusePrompts.test.ts` — verify FAIL.
3. Implement `prompts.ts` with one focused helper for the primary mapping prompt.
4. Run: `pnpm --filter @repo/workers test -- src/tests/langfusePrompts.test.ts` — verify PASS.
5. Run: `pnpm --filter @repo/workers lint` and `pnpm --filter @repo/workers check-types`.

**Acceptance:**

- [ ] Langfuse prompt fetch uses `label: "production"` and `cacheTtlSeconds: 60`
- [ ] Fallback uses the existing hardcoded prompt text
- [ ] Returned metadata includes prompt name, resolved version, and fallback flag
- [ ] `pnpm --filter @repo/workers test -- src/tests/langfusePrompts.test.ts` passes
- [ ] `pnpm --filter @repo/workers lint` and `pnpm --filter @repo/workers check-types` pass

---

#### [trace] Task 2.2: Create a Workers-safe OTLP helper

**Status:** pending

**Depends:** None

Create a pure helper that converts runtime telemetry into a Langfuse-compatible
OTLP generation span and POST request. It must not depend on Node-only OTel
packages. It should normalize `mappingTraceId` into a 32-hex trace ID, create a
16-hex observation ID, and never throw on POST failure.

**Files:**

- Create: `apps/workers/src/langfuse/otlp.ts`
- Create: `apps/workers/src/tests/langfuseOtlp.test.ts`

**Steps (TDD):**

1. Write `langfuseOtlp.test.ts` to cover:
   - trace ID normalization from UUID-with-hyphens to 32 hex chars
   - observation ID shape is 16 lowercase hex chars
   - OTLP JSON includes `langfuse.observation.type = "generation"`
   - OTLP JSON includes prompt name/version and model attributes
   - POST target is `${baseUrl}/api/public/otel/v1/traces`
   - headers include Basic Auth and `x-langfuse-ingestion-version: 4`
   - export helper swallows network failure
2. Run: `pnpm --filter @repo/workers test -- src/tests/langfuseOtlp.test.ts` — verify FAIL.
3. Implement `otlp.ts`.
4. Run: `pnpm --filter @repo/workers test -- src/tests/langfuseOtlp.test.ts` — verify PASS.
5. Run: `pnpm --filter @repo/workers lint` and `pnpm --filter @repo/workers check-types`.

**Acceptance:**

- [ ] OTLP export uses documented endpoint and headers
- [ ] Trace IDs and observation IDs match Langfuse format requirements
- [ ] Prompt metadata is mapped via `langfuse.observation.prompt.*`
- [ ] Export failures never break request handling
- [ ] `pnpm --filter @repo/workers test -- src/tests/langfuseOtlp.test.ts` passes

---

### Phase 3: Adapter telemetry and Langfuse dispatch [Complexity: M]

#### [adapter] Task 3.1: Expose primary-call telemetry and allow prompt override in `suggestMappings()`

**Status:** pending

**Depends:** None

Refactor the adapter so the caller can inject the resolved primary prompt text
instead of always rebuilding it internally, and so the adapter returns runtime
telemetry needed for Langfuse tracing: model id, prompt text, start/end time,
duration, structured output text, and token usage when the provider reports it.
This data is runtime-only and must not alter the persisted API contract.

**Files:**

- Modify: `apps/workers/src/intake/aiMappingAdapter.ts`
- Modify: `apps/workers/src/intake/aiMappingAdapter.test.ts`
- Modify: `apps/workers/src/tests/payloadMappingPrompt.test.ts`

**Steps (TDD):**

1. Update `aiMappingAdapter.test.ts` with failing cases for:
   - injected `primaryPromptText` is used instead of `buildMappingPrompt()`
   - runtime telemetry is returned on `success`, `abstain`, and `runtime_failure`
   - usage fields pass through when the runner provides them
2. Update `payloadMappingPrompt.test.ts` so the existing fallback prompt contract remains covered.
3. Run: `pnpm --filter @repo/workers test -- src/intake/aiMappingAdapter.test.ts src/tests/payloadMappingPrompt.test.ts` — verify FAIL.
4. Refactor the adapter and runner types to retain usage/timing metadata.
5. Run: `pnpm --filter @repo/workers test -- src/intake/aiMappingAdapter.test.ts src/tests/payloadMappingPrompt.test.ts` — verify PASS.
6. Run: `pnpm --filter @repo/workers lint` and `pnpm --filter @repo/workers check-types`.

**Acceptance:**

- [ ] Caller can supply `primaryPromptText` without changing external request contracts
- [ ] Adapter returns runtime telemetry sufficient for latency/token tracing
- [ ] Existing fallback prompt builder remains tested and unchanged
- [ ] `pnpm --filter @repo/workers test -- src/intake/aiMappingAdapter.test.ts src/tests/payloadMappingPrompt.test.ts` passes

---

#### [dispatch] Task 3.2: Create a Langfuse trace/score dispatcher for intake results

**Status:** pending

**Depends:** Task 1.1, Task 2.2, Task 3.1

Build a small orchestration helper that turns the adapter’s runtime telemetry
into one OTLP generation trace plus one `overall_confidence` score. The helper
should return Promises for “post trace” and “flush scores” so route code can
schedule them with `c.executionCtx.waitUntil(...)`.

**Files:**

- Create: `apps/workers/src/langfuse/intakeTracing.ts`
- Create: `apps/workers/src/tests/intakeLangfuseTracing.test.ts`

**Steps (TDD):**

1. Write `intakeLangfuseTracing.test.ts` to cover:
   - success maps to observation level `DEFAULT`
   - abstain maps to `WARNING`
   - runtime failure maps to `ERROR`
   - `score.create({ traceId, name: "overall_confidence", value })` is issued
   - `langfuse.flush()` is required and exposed as a promise for scheduling
   - missing credentials yields no-op promises instead of throwing
2. Run: `pnpm --filter @repo/workers test -- src/tests/intakeLangfuseTracing.test.ts` — verify FAIL.
3. Implement `intakeTracing.ts`.
4. Run: `pnpm --filter @repo/workers test -- src/tests/intakeLangfuseTracing.test.ts` — verify PASS.
5. Run: `pnpm --filter @repo/workers lint` and `pnpm --filter @repo/workers check-types`.

**Acceptance:**

- [ ] Dispatcher emits one primary-generation trace per `suggestMappings()` call
- [ ] Dispatcher emits and flushes one `overall_confidence` score
- [ ] Missing credentials degrade to no-op behavior
- [ ] `pnpm --filter @repo/workers test -- src/tests/intakeLangfuseTracing.test.ts` passes

---

### Phase 4: Route wiring [Complexity: M]

#### [route] Task 4.1: Wire Langfuse prompt resolution and background dispatch into intake route

**Status:** pending

**Depends:** Task 1.2, Task 2.1, Task 3.2

Integrate the new helpers into `POST /api/intake/mapping-suggestions` without
changing the success/failure HTTP contract or existing Analytics Engine writes.
The route should resolve the primary prompt, call `suggestMappings()` with the
resolved prompt text and version, then schedule Langfuse trace/score work with
`c.executionCtx.waitUntil(Promise.allSettled([...]))`.

**Files:**

- Modify: `apps/workers/src/routes/intake.ts`
- Modify: `apps/workers/src/tests/intake.test.ts`

**Steps (TDD):**

1. Add failing route tests for:
   - Langfuse prompt resolution success path
   - fallback path when Langfuse prompt fetch fails
   - `c.executionCtx.waitUntil(...)` receives background Langfuse work
   - intake response still succeeds when Langfuse POST/flush fails
2. Run: `pnpm --filter @repo/workers test -- src/tests/intake.test.ts` — verify FAIL.
3. Integrate prompt resolution before `suggestMappings()` and Langfuse dispatch after it.
4. Re-run: `pnpm --filter @repo/workers test -- src/tests/intake.test.ts` — verify PASS.
5. Run: `pnpm --filter @repo/workers lint`, `pnpm --filter @repo/workers check-types`, and `pnpm --filter @repo/workers build`.

**Acceptance:**

- [ ] Route uses Langfuse-managed primary prompt text when available
- [ ] Fallback prompt keeps the route functional when Langfuse is unavailable
- [ ] Background Langfuse work is scheduled with `c.executionCtx.waitUntil(...)`
- [ ] Existing `recordIntakeLifecycle()` calls remain intact
- [ ] Langfuse failure never changes the route’s HTTP success/error behavior
- [ ] `pnpm --filter @repo/workers test -- src/tests/intake.test.ts` passes
- [ ] `pnpm --filter @repo/workers lint`, `pnpm --filter @repo/workers check-types`, and `pnpm --filter @repo/workers build` pass

---

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Type safety | `pnpm check-types` | Zero errors |
| Lint | `pnpm lint` | Zero violations |
| Tests | `pnpm test` | All relevant suites pass |
| Build | `pnpm build` | Workspace build succeeds |

## Cross-Plan References

| Type | Blueprint | Relationship |
| ---- | --------- | ------------ |
| Upstream | `ai-payload-intake-mapper` | This plan extends the AI-mapping adapter and intake route introduced there |
| Downstream | None | |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --------- | ---- | -------- | ---- |
| Langfuse prompt fetch fails on cold start | No cached prompt yet | Use Langfuse `fallback` with the current hardcoded primary prompt text | 2.1, 4.1 |
| Langfuse score queue never flushes | Scores disappear in short-lived Worker | Explicitly schedule `langfuse.flush()` with `c.executionCtx.waitUntil(...)` | 3.2, 4.1 |
| `mappingTraceId` includes hyphens | Trace rejected or split in Langfuse | Normalize to 32 hex by stripping hyphens before OTLP export | 2.2, 3.2 |
| OTLP POST fails or times out | Lost trace, broken request if uncaught | Export helper never throws; route response path stays unchanged | 2.2, 4.1 |
| First prompt fetch adds latency | Intake p99 spike on first request per isolate | Rely on SDK cache for steady-state; accept one cold fetch as bounded overhead | 2.1, 4.1 |
| Worker fast-path skips `suggestMappings()` | No Langfuse trace for fast-path requests | Accept by design; blueprint scope is “every `suggestMappings()` call”, not every intake POST | 4.1 |
| Payload/prompt/output are large | Trace payload bloat | Truncate serialized input/output fields in OTLP helper before export | 2.2 |
| `waitUntil` budget exceeded | Background work cancelled after response | Keep v1 to one trace POST + one score flush, no per-suggestion score fan-out | 3.2, 4.1 |

## Non-goals

- Managing the advisory judge prompt in Langfuse during v1
- Emitting Langfuse spans for judge-model calls during v1
- Returning Langfuse trace URLs in the API response
- Replacing Cloudflare Analytics Engine telemetry
- Auto-seeding prompts into Langfuse via repo scripts
- Langfuse evaluations, datasets, or experiments
- Self-hosted Langfuse support beyond honoring `LANGFUSE_BASE_URL`
- Adding OpenTelemetry SDK/runtime dependencies to the Worker

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Adapter refactor leaks runtime telemetry into persisted API shapes | Behavior regression in intake flow | Keep telemetry in runtime-only fields consumed by route code, not DB persistence | 
| Langfuse prompt fetch latency regresses cold requests | User-visible slowdown on first isolate hit | Use SDK caching, keep fallback local, and verify route behavior with prompt-fetch failure tests |
| Background flush work exceeds Worker post-response budget | Missing scores/traces | Keep v1 fan-out minimal and use one `Promise.allSettled(...)` scheduled via `c.executionCtx.waitUntil(...)` |
| Dual telemetry systems confuse future maintainers | Misinterpretation of metrics vs traces | Document clearly: CF Analytics = aggregate lifecycle metrics; Langfuse = per-call AI trace detail |

## Technology Choices

| Component | Technology | Version | Why |
| --------- | ---------- | ------- | --- |
| Prompt retrieval | `@langfuse/client` | latest compatible | Universal JS client with prompt caching/fallback support |
| Prompt cache | `prompt.get(..., { cacheTtlSeconds })` | built-in | Official stale-while-revalidate behavior; no custom cache code |
| Prompt fallback | `prompt.get(..., { fallback })` | built-in | Preserves availability without extra repo-side retry logic |
| Score ingest | `langfuse.score.create()` + `langfuse.flush()` | built-in | Official score path for JS/TS, with short-lived-env guidance |
| Trace export | Manual OTLP HTTP/JSON | n/a | Workers-safe and doc-backed; avoids Node-only tracing packages |
| Background scheduling | `c.executionCtx.waitUntil(...)` | Hono/Cloudflare built-in | Correct API surface for fire-and-forget work from Hono on Workers |
| Trace correlation | `mappingTraceId.replace(/-/g, "")` | n/a | Reuses existing correlation ID while satisfying Langfuse trace format |
| Secrets/config | Doppler + Wrangler secrets + `LANGFUSE_BASE_URL` | existing | Matches repo policy: no `.env` files |

## Refinement Summary

| Metric | Value |
| ------ | ----- |
| Findings total | 10 |
| Critical | 1 |
| High | 5 |
| Medium | 3 |
| Low | 1 |
| Fixes applied to blueprint | 10/10 |
| Cross-plans updated | 0 |
| Total tasks | 7 |
| Critical path | 3 waves |
| Max parallel agents | 4 in Wave 0 |
| Parallelization score | B |
| Blueprint compliant | 7/7 |
