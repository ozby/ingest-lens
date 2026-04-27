---
type: blueprint
status: planned
complexity: M
created: "2026-04-27"
last_updated: "2026-04-27"
progress: "0% (planned)"
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
confidence, token usage, and prompt version — without breaking the existing
Analytics Engine telemetry or deterministic test runner.

## Planning Summary

- **Current state:** Prompts are hardcoded as template strings in
  `apps/workers/src/intake/aiMappingAdapter.ts:139-165`. Prompt version is a
  single constant `"payload-mapper-v1"` (line 11). Telemetry goes exclusively
  to Cloudflare Analytics Engine via `apps/workers/src/telemetry.ts`.
- **Langfuse deps:** `@langfuse/client` and `@langfuse/tracing` are Universal
  JS — both work in Cloudflare Workers. `@langfuse/otel` is **Node.js >= 20
  only** — it requires `@opentelemetry/sdk-node` which has no Worker runtime.
- **OTLP export:** Langfuse accepts OTLP traces at
  `POST /api/public/otel/v1/traces` (HTTP/JSON or HTTP/protobuf). A custom
  `SpanExporter` that posts via `fetch()` is the Workers-compatible path.
- **Secrets:** `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`
  injected via Doppler (same pattern as `JWT_SECRET`).
- **Coexistence:** Langfuse tracing runs alongside existing
  `recordIntakeLifecycle` calls — they are additive, not replacements.
  Prompt management replaces the hardcoded `buildMappingPrompt` /
  `buildJudgePrompt` with Langfuse-fetched prompts.
- **Blueprint path:** `blueprints/planned/langfuse-prompt-tracing/_overview.md`

## Architecture Overview

```text
Before:
  route/intake.ts → suggestMappings() → buildMappingPrompt() (hardcoded string)
                                       → generateObject() (untraced)
                                       → recordIntakeLifecycle() (CF Analytics)

After:
  route/intake.ts → langfuse.prompt.get("payload-mapper") // fetch versioned prompt
                  → suggestMappings() → prompt.compile(vars)       // inject vars
                                      → trace wrapper (Langfuse)   // latency, tokens, status
                                      → generateObject()           // unchanged
                                      → recordIntakeLifecycle()    // untouched
                                      → custom OTLP exporter       // POST to Langfuse via fetch()
```

```text
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare Worker                     │
│                                                          │
│  POST /api/intake/mapping-suggestions                    │
│    │                                                     │
│    ├─ @langfuse/client  ──  fetch prompt by label        │
│    │                                                     │
│    ├─ @langfuse/tracing ──  startActiveObservation(...)  │
│    │   ├─ primary generation (generateObject)             │
│    │   └─ judge generations (if enableJudge)              │
│    │                                                     │
│    ├─ recordIntakeLifecycle()  ──  CF Analytics (existing)│
│    │                                                     │
│    └─ OTLP SpanExporter ── fetch() ──► Langfuse API      │
│                                           /api/public/   │
│                                           otel/v1/traces │
└─────────────────────────────────────────────────────────┘
```

### Langfuse SDK compatibility matrix (from official docs)

| Package               | Environment   | Workers? | Purpose                              |
| --------------------- | ------------- | -------- | ------------------------------------ |
| `@langfuse/client`    | Universal JS  | Yes      | Prompt management, scores, datasets  |
| `@langfuse/tracing`   | Universal JS  | Yes      | startObservation, observe wrapper    |
| `@langfuse/core`      | Universal JS  | Yes      | Shared utils, logger                 |
| `@langfuse/otel`      | Node.js >= 20 | **No**   | LangfuseSpanProcessor (requires SDK) |
| `@langfuse/openai`    | Universal JS  | Yes      | Auto-tracing for OpenAI SDK          |
| `@langfuse/langchain` | Universal JS  | Yes      | CallbackHandler for LangChain        |

## Key Decisions

| Decision                     | Choice                                     | Rationale                                                                                                     |
| ---------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Prompt storage               | Langfuse Prompt Management                 | UI editing, version history, labels (production/staging), rollback — better than in-code registry             |
| Tracing mechanism            | `@langfuse/tracing` + custom OTLP exporter | `@langfuse/otel` (LangfuseSpanProcessor) requires `@opentelemetry/sdk-node` — no Worker runtime               |
| Exporter transport           | `fetch()` to OTLP HTTP/JSON                | Workers have no `http`/`https` module; OTLP over HTTP is supported by Langfuse's `/api/public/otel/v1/traces` |
| Existing telemetry           | Keep CF Analytics Engine                   | `recordIntakeLifecycle` remains in place; Langfuse tracing is additive                                        |
| Secrets injection            | Doppler (same as JWT_SECRET)               | No `.env` files; secrets flow through Pulumi → wrangler secrets                                               |
| Prompt migration             | Manual via Langfuse UI                     | Two prompts to migrate; not worth automation for v1                                                           |
| Judge model (per-suggestion) | Traced as child generations                | Each judge call is a separate `generateObject` — trace it as a child of the primary observation               |
| No Langfuse AI binding       | No change to Workers AI usage              | Langfuse is observability only; it does not proxy model calls                                                 |

## Quick Reference (Execution Waves)

| Wave              | Tasks     | Dependencies | Parallelizable |
| ----------------- | --------- | ------------ | -------------- |
| **Wave 0**        | 1.1, 1.2  | None         | 2 agents       |
| **Wave 1**        | 2.1, 2.2  | Wave 0       | 2 agents       |
| **Critical path** | 1.1 → 2.1 | --           | Serial         |

### Phase 1: Dependencies and secrets [Complexity: S]

#### [deps] Task 1.1: Add @langfuse/client and @langfuse/tracing to the Worker package

**Status:** pending

**Depends:** None

Install two Langfuse packages in `apps/workers`. Both are Universal JS — they
work in the Cloudflare Workers runtime without Node.js polyfills. Do not install
`@langfuse/otel` (Node.js only) or `@opentelemetry/sdk-node`.

**Files:**

- Modify: `apps/workers/package.json`
- Modify: `pnpm-lock.yaml` (generated)

**Steps (TDD):**

1. Run: `pnpm --filter @repo/workers add @langfuse/client @langfuse/tracing`
2. Run: `pnpm --filter @repo/workers check-types` — verify no type conflicts
3. Run: `pnpm --filter @repo/workers build` — verify bundle includes Langfuse packages without Node.js errors

**Acceptance:**

- [ ] `@langfuse/client` and `@langfuse/tracing` appear in `apps/workers/package.json` under `dependencies`
- [ ] `pnpm check-types` passes with zero errors
- [ ] `pnpm build` succeeds (all workspace builds)
- [ ] Neither `@langfuse/otel` nor `@opentelemetry/sdk-node` appear in `package.json`

---

#### [secrets] Task 1.2: Add Langfuse secrets to Doppler and wrangler.toml

**Status:** pending

**Depends:** None (can run parallel to 1.1)

Add three new env vars: `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`,
`LANGFUSE_HOST`. These must be available in both `dev` and `prd` environments.
Test mode uses a fake OTLP exporter (Task 2.1) — no live secrets needed in CI.

**Files:**

- Modify: `apps/workers/wrangler.toml` — add `[env.dev.vars]` and `[env.prd.vars]` entries
- Modify: `apps/workers/src/db/client.ts` — extend `Env` type
- Doppler: add secrets to `ingest-lens:dev` and `ingest-lens:prd` projects

**Steps:**

1. Add to `apps/workers/src/db/client.ts` `Env` type:
   ```ts
   LANGFUSE_PUBLIC_KEY?: string;
   LANGFUSE_SECRET_KEY?: string;
   LANGFUSE_HOST?: string;
   ```
2. Add to `apps/workers/wrangler.toml`:
   - `[env.dev.vars]`:
     ```toml
     LANGFUSE_HOST = "https://cloud.langfuse.com"
     ```
   - `[env.prd.vars]`:
     ```toml
     LANGFUSE_HOST = "https://cloud.langfuse.com"
     ```
   - Keys are secrets — set via `wrangler secret put` (Pulumi pipeline) or Doppler injection, **not** committed plaintext
3. Add `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` to Doppler projects `ingest-lens:dev` and `ingest-lens:prd`
4. Run: `pnpm --filter @repo/workers check-types`

**Acceptance:**

- [ ] `Env` type includes `LANGFUSE_PUBLIC_KEY?`, `LANGFUSE_SECRET_KEY?`, `LANGFUSE_HOST?`
- [ ] `LANGFUSE_HOST` is set in `wrangler.toml` for both `dev` and `prd`
- [ ] No plaintext API keys committed to `wrangler.toml`
- [ ] `pnpm check-types` passes

---

### Phase 2: Adapter and integration [Complexity: M]

#### [exporter] Task 2.1: Build a Workers-compatible OTLP SpanExporter

**Status:** pending

**Depends:** Task 1.1, Task 1.2

Write a custom OpenTelemetry `SpanExporter` that serializes spans to OTLP JSON
and POSTs them to Langfuse's OTLP HTTP endpoint via `fetch()`. This replaces the
`LangfuseSpanProcessor` from `@langfuse/otel` (which requires Node.js
`@opentelemetry/sdk-node`).

The exporter must:

1. Accept `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`
2. Serialize `ReadableSpan[]` to OTLP/JSON per the
   [OTLP spec](https://opentelemetry.io/docs/specs/otlp/#json-protobuf-encoding)
3. POST to `{LANGFUSE_HOST}/api/public/otel/v1/traces` with Basic Auth
4. Include the `x-langfuse-ingestion-version: 4` header for real-time preview
5. Flush on `shutdown()` (called via `ctx.waitUntil` in the Worker response)
6. Never throw — failures are logged but never break the intake pipeline

The exporter pairs with `@langfuse/tracing`'s `startActiveObservation` and
`startObservation` — those create OTel spans; the exporter sends them.

**Files:**

- Create: `apps/workers/src/tracing/langfuseOtlpExporter.ts`
- Create: `apps/workers/src/tests/langfuseOtlpExporter.test.ts`

**Steps (TDD):**

1. Write failing tests in `apps/workers/src/tests/langfuseOtlpExporter.test.ts`:
   - Exporter serializes a minimal span to valid OTLP JSON shape
   - Exporter authenticates with Basic Auth (base64 of `publicKey:secretKey`)
   - Exporter sets `x-langfuse-ingestion-version: 4` header
   - Exporter calls the correct URL `{host}/api/public/otel/v1/traces`
   - Exporter does not throw on network failure (uses try/catch)
   - `shutdown()` resolves after flush completes
   - Missing credentials → no POST (graceful skip)
2. Run the RED step:
   `pnpm --filter @repo/workers test -- src/tests/langfuseOtlpExporter.test.ts`
3. Implement `apps/workers/src/tracing/langfuseOtlpExporter.ts`:

   ```ts
   import type { SpanExporter, ReadableSpan } from "@opentelemetry/sdk-trace-base";
   import { ExportResultCode } from "@opentelemetry/core";

   export interface LangfuseOtlpExporterConfig {
     publicKey?: string;
     secretKey?: string;
     host?: string;
   }

   export class LangfuseOtlpExporter implements SpanExporter {
     // export(spans, resultCallback) — serialize + POST
     // shutdown() — flush + resolve
     // forceFlush() — immediate flush
   }
   ```

4. Re-run focused test until GREEN, then:
   `pnpm --filter @repo/workers check-types`
   `pnpm --filter @repo/workers lint`

**Acceptance:**

- [ ] Exporter implements the `SpanExporter` interface from `@opentelemetry/sdk-trace-base`
- [ ] Exporter POSTs valid OTLP JSON to the correct `/api/public/otel/v1/traces` endpoint
- [ ] Basic Auth header is base64-encoded `publicKey:secretKey`
- [ ] `x-langfuse-ingestion-version: 4` header is included
- [ ] Network failures do not throw (caught and logged)
- [ ] Missing credentials → exporter is a no-op (no fetch)
- [ ] Tests use a fake `fetch` — no live network calls
- [ ] `pnpm check-types` and `pnpm lint` pass

---

#### [integration] Task 2.2: Wire Langfuse prompt management and tracing into the intake route

**Status:** pending

**Depends:** Task 2.1, Task 1.1, Task 1.2

Integrate Langfuse into the `POST /api/intake/mapping-suggestions` handler in
`apps/workers/src/routes/intake.ts`. This task has two parts:

**Part A — Prompt management:**
Replace the hardcoded `buildMappingPrompt(input)` call with Langfuse-fetched
prompts. At request time, fetch the `"payload-mapper"` text prompt by the
`"production"` label, compile it with variables, and pass it to
`suggestMappings`. Keep `buildMappingPrompt` as a fallback when Langfuse is
unavailable (graceful degradation).

**Part B — Tracing:**
Wrap the `suggestMappings` call with `startActiveObservation` from
`@langfuse/tracing`. Create a trace with:

- Root observation: `"intake-mapping"` (span type)
  - `attributes`: `langfuse.trace.metadata.contractId`,
    `langfuse.trace.metadata.sourceSystem`, `langfuse.trace.metadata.queueId`
  - Child observation: `"primary-mapping"` (generation type)
    - `model`: the primary model name
    - `input`: the compiled prompt
    - `output`: the batch JSON or error
    - `usageDetails`: input/output tokens (if available from Workers AI response)
  - Child observations: `"judge-assessment"` (generation type) × N suggestions
    - Same shape as primary, per-suggestion
    - Only when `enableJudge` is true
- On `"success"`: update trace output with `{ kind, overallConfidence, suggestionCount }`
- On `"abstain"` / `"invalid_output"` / `"runtime_failure"`: update with
  `{ kind, reason }`, set observation `level: "WARNING"` or `level: "ERROR"`
- Score: attach `overallConfidence` and per-suggestion confidence as Langfuse
  scores on the trace
- Flush: call `exporter.forceFlush()` via `ctx.waitUntil()` before the response
  returns

The `MappingDecisionLog` fields (`model`, `promptVersion`, `validationOutcome`,
`confidence`, `failureReason`) map naturally to Langfuse trace attributes +
scores. Existing `recordIntakeLifecycle` calls remain untouched.

**Files:**

- Modify: `apps/workers/src/routes/intake.ts` — add Langfuse tracing wrapper + prompt fetch
- Modify: `apps/workers/src/intake/aiMappingAdapter.ts` — accept optional compiled prompt string, pass `langfusePrompt` metadata to trace
- Modify: `apps/workers/src/tests/intake.test.ts` — verify trace shape with fake exporter
- Create: `apps/workers/src/tests/intakeLangfuseTracing.test.ts` — focused tracing tests

**Steps (TDD):**

1. Create `apps/workers/src/tests/intakeLangfuseTracing.test.ts`:
   - Test: successful mapping creates a trace with correct span hierarchy (root span → generation)
   - Test: `overallConfidence` is attached as a score
   - Test: abstention creates a trace with `level: "WARNING"`
   - Test: runtime failure creates a trace with `level: "ERROR"` and failure reason
   - Test: Langfuse unavailable → route still works (graceful degradation, fallback to hardcoded prompt)
   - Test: trace includes `langfuse.observation.prompt.name` and `langfuse.observation.prompt.version` attributes
   - Use a fake OTLP exporter that captures spans in memory for assertions
2. Run RED: `pnpm --filter @repo/workers test -- src/tests/intakeLangfuseTracing.test.ts`
3. Implement in `apps/workers/src/routes/intake.ts`:
   - Initialize `LangfuseClient` and `LangfuseOtlpExporter` from `c.env`
   - At start of handler: `const prompt = await langfuse.prompt.get("payload-mapper")`
   - Wrap `suggestMappings` call with `startActiveObservation("intake-mapping", ...)`
   - Create child `startObservation("primary-mapping", ..., { asType: "generation" })`
   - Attach prompt metadata on the generation:
     ```ts
     "langfuse.observation.prompt.name": prompt.name,
     "langfuse.observation.prompt.version": prompt.version,
     ```
   - After result: update trace with computed scores
   - Before response: `ctx.waitUntil(exporter.forceFlush())`
   - Fallback: catch Langfuse errors and continue without tracing
4. Re-run focused test until GREEN, then:
   `pnpm --filter @repo/workers check-types`
   `pnpm --filter @repo/workers lint`
   `pnpm --filter @repo/workers test` (all worker tests)

**Acceptance:**

- [ ] Prompt is fetched from Langfuse at request time (with `"production"` label)
- [ ] Hardcoded prompt remains as fallback when Langfuse is unreachable
- [ ] Every `suggestMappings` call is wrapped in a Langfuse trace with root span + generation span
- [ ] Primary and judge generations have correct `model`, `input`, `output` fields
- [ ] `overallConfidence` is attached as a Langfuse score
- [ ] `prompt.name` and `prompt.version` are linked on every generation
- [ ] `level` is set to `"WARNING"` for abstention, `"ERROR"` for runtime failures
- [ ] `ctx.waitUntil(exporter.forceFlush())` is called before response
- [ ] Langfuse unavailable → route still returns 200/201 with fallback prompt
- [ ] Existing `recordIntakeLifecycle` calls are preserved
- [ ] Tests use fake OTLP exporter — no live Langfuse calls in CI
- [ ] `pnpm check-types` and `pnpm lint` pass
- [ ] All existing worker tests pass

---

## Verification Gates

| Gate        | Command                            | Success Criteria             |
| ----------- | ---------------------------------- | ---------------------------- |
| Type safety | `pnpm check-types`                 | Zero errors                  |
| Lint        | `pnpm lint`                        | Zero violations              |
| Tests       | `pnpm --filter @repo/workers test` | All suites pass              |
| Build       | `pnpm build`                       | All workspace builds succeed |

## Cross-Plan References

| Type       | Blueprint                  | Relationship                         |
| ---------- | -------------------------- | ------------------------------------ |
| Upstream   | `ai-payload-intake-mapper` | Wraps the AI adapter this depends on |
| Downstream | None                       |                                      |

## Edge Cases and Error Handling

| Edge Case                              | Risk                          | Solution                                                      | Task |
| -------------------------------------- | ----------------------------- | ------------------------------------------------------------- | ---- |
| Langfuse API unreachable               | Prompt fetch fails            | Fall back to hardcoded `buildMappingPrompt`                   | 2.2  |
| Langfuse API unreachable               | Tracing fails                 | Catch errors; intake continues without tracing                | 2.2  |
| LANGFUSE secrets not configured        | Exporter has no credentials   | Exporter is a no-op; no fetch calls                           | 2.1  |
| Worker CPU time limit                  | OTLP POST not sent            | `ctx.waitUntil` ensures POST runs after response              | 2.2  |
| Large payload size (up to 64KB)        | Span input exceeds OTLP limit | Truncate to first 8KB in trace; full payload in Postgres only | 2.2  |
| Judge model enabled (N parallel calls) | N generations in one trace    | Each is a child generation; no structural issue               | 2.2  |
| Doppler secrets rotation               | Stale credentials in Worker   | Workers must be redeployed after secret rotation              | 1.2  |

## Non-goals

- Auto-migrating existing hardcoded prompts to Langfuse (manual via Langfuse UI)
- Langfuse evaluations, datasets, experiments, or playground (v1 scope)
- Replacing CF Analytics Engine telemetry (`recordIntakeLifecycle` stays)
- Langfuse self-hosting
- Langfuse LLM-as-judge (judge model continues to be Workers AI, not Langfuse evals)
- A/B prompt variants or canary deployments
- Langfuse integration in the lab scenarios or E2E tests
- Changing the `wrangler.toml` `compatibility_date` or `compatibility_flags`

## Risks

| Risk                                       | Impact               | Mitigation                                                                                                             |
| ------------------------------------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `@langfuse/tracing` has hidden Node.js dep | Blocker              | Smoke test immediately after install: `import` + `startObservation` in a Worker build                                  |
| Custom OTLP exporter drift from spec       | Rejected by Langfuse | Validate against Langfuse's `openapi.yml`; test with Langfuse Cloud dev project                                        |
| Langfuse latency adds P99 tail             | User-visible         | Prompt fetch is async but must resolve before `generateObject` call; trace POST is fire-and-forget via `ctx.waitUntil` |
| Two telemetry systems (CF + Langfuse)      | Confusion            | Document which system answers which question: Langfuse = individual AI calls; CF Analytics = aggregate intake pipeline |

## Technology Choices

| Component         | Technology             | Version  | Why                                                   |
| ----------------- | ---------------------- | -------- | ----------------------------------------------------- |
| Prompt management | `@langfuse/client`     | latest   | Universal JS; fetch-based; prompt versioning + labels |
| Tracing SDK       | `@langfuse/tracing`    | latest   | Universal JS; OTel-native observation helpers         |
| Span export       | Custom `SpanExporter`  | n/a      | ~40 lines; replaces `@langfuse/otel` (Node.js only)   |
| OTLP transport    | `fetch()` to HTTP/JSON | n/a      | Workers-compatible; Langfuse supports this            |
| Secrets           | Doppler                | existing | Same pattern as `JWT_SECRET`                          |
| Test doubles      | `FakeOtlpExporter`     | n/a      | In-memory span capture for assertions                 |
