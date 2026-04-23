---
type: blueprint
title: "Blueprint: AI OSS Tooling Adapter"
status: "planned"
priority: "P1"
owners: ["agent"]
created: "2026-04-24"
updated: "2026-04-24"
depends_on:
  - rebrand-ingestlens
unblocks:
  - ai-payload-intake-mapper
  - admin-review-replay-console
  - public-dataset-demo-ingestion
progress: "0% planned; technology fact-check complete"
---

# Blueprint: AI OSS Tooling Adapter

## Intent

Adopt a minimal, open-source AI/tooling layer that strengthens IngestLens's
self-healing ingestion story without turning the portfolio project into an AI
framework showcase. The v1 architecture should keep deterministic validation,
queue replay, and human approval as the core product, while isolating model calls
behind a small adapter that can run on Cloudflare Workers AI and be tested without
network access.

This blueprint resolves the technology decisions raised during research:
Vercel AI SDK vs direct Workers AI bindings, TypeBox/Ajv vs Zod for JSON Schema,
JSON Pointer/Patch safety, Promptfoo evals, Langfuse-style observability, and
BAML-style typed prompts.

## Fact-Checked Findings

| ID  | Finding                                                                                                    | Evidence                                                                                                                 | Decision                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| F1  | Vercel AI SDK is open-source and provider-based.                                                           | The official repository is Apache-2.0 and documents provider packages plus a `generateObject` API for structured output. | Use `ai` only inside an internal adapter; do not leak SDK types into domain code.                                          |
| F2  | Cloudflare Workers AI has an AI SDK-compatible provider.                                                   | Cloudflare's Workers AI docs show AI SDK integration through `workers-ai-provider` and binding-backed model execution.   | Prefer `workers-ai-provider` over direct `env.AI.run` in v1 to keep provider portability and structured-output ergonomics. |
| F3  | Vercel AI Gateway is a hosted routing product, not required for this stack.                                | AI Gateway documentation positions it as a managed unified API and dashboard.                                            | Reject AI Gateway for v1 because no paid SaaS or external control plane is allowed.                                        |
| F4  | TypeBox emits JSON Schema-compatible TypeScript schemas.                                                   | TypeBox documents runtime JSON Schema generation and static TypeScript inference.                                        | Use TypeBox for canonical intake/replay schemas so admin UI, workers, and tests share one contract.                        |
| F5  | Ajv is the mature JSON Schema validator.                                                                   | Ajv documents JSON Schema validation and standalone/compiled validators.                                                 | Use Ajv behind a local validator module; do not scatter Ajv calls across features.                                         |
| F6  | `jsonpointer` is a small MIT library for RFC 6901 paths, but it is not a policy engine.                    | npm package metadata lists MIT and pointer get/set helpers.                                                              | Do not expose raw pointer mutation; implement a restricted source-path parser/validator for LLM suggestions.               |
| F7  | `fast-json-patch` is mature and MIT, but broad JSON Patch support is more power than v1 needs.             | The project implements RFC 6902 operations.                                                                              | Defer JSON Patch; v1 suggestions are allowlisted field mappings with explicit before/after previews.                       |
| F8  | Promptfoo is OSS and useful for prompt/model regression evals, but it adds another CLI and fixture format. | Promptfoo repo documents evals and CI usage.                                                                             | Defer until after deterministic mapper tests exist; do not block v1 on eval tooling.                                       |
| F9  | Langfuse/BAML are valuable categories, but too heavy for this portfolio phase.                             | Langfuse adds a self-hosted observability stack; BAML introduces its own schema/prompt language.                         | Implement lightweight decision logs and typed adapter functions first; revisit only if local evidence shows a gap.         |

## Key Decisions

| Decision              | Choice                                                              | Rationale                                                                                                     |
| --------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| AI call boundary      | `apps/workers/src/intake/aiMappingAdapter.ts`                       | One adapter owns provider selection, retries, timeouts, schema prompts, response parsing, and test fakes.     |
| Model provider        | Cloudflare Workers AI via `workers-ai-provider`                     | Uses existing Cloudflare-oriented infra and avoids paid SaaS.                                                 |
| Structured output     | `ai.generateObject` + TypeBox/Ajv validation                        | Model output is advisory until deterministic validation passes and a human approves it.                       |
| Schema source         | TypeBox in workers, exported shared DTO types from `packages/types` | Keeps JSON Schema and TypeScript aligned without adding a separate IDL.                                       |
| Validation            | Ajv compiled validators behind `validators.ts`                      | Fast deterministic validation, easy negative-path tests, no model dependency.                                 |
| Suggestion addressing | Restricted source-path helper, not arbitrary JSON Patch             | Prevents broad mutation semantics while preserving explainable field-level suggestions.                       |
| LLM-as-judge          | Advisory second pass inside adapter                                 | Helpful for confidence/explanation quality, but cannot override deterministic validation or approval gates.   |
| Evals                 | Defer Promptfoo                                                     | Start with deterministic fixtures and golden tests; add eval CLI only when prompt regressions become painful. |
| Observability         | Decision logs + metrics counters in existing worker metrics         | Avoid self-hosting overhead while showing engineering rigor.                                                  |

## Quick Reference (Execution Waves)

| Wave   | Parallel Tasks                                                | Dependency Barrier       | Expected Output                                                                    |
| ------ | ------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------- |
| Wave 0 | Task 1.1 `[deps]`, Task 1.2 `[contracts]`, Task 1.3 `[paths]` | None                     | Dependency boundary, shared DTO contract, restricted pointer/path helper.          |
| Wave 1 | Task 2.1 `[schemas]`                                          | Tasks 1.1 and 1.2        | TypeBox/Ajv schema module with positive and negative fixture coverage.             |
| Wave 2 | Task 3.1 `[adapter]`                                          | Tasks 1.1, 1.2, 1.3, 2.1 | AI SDK adapter with deterministic fake provider tests and Cloudflare binding seam. |
| Wave 3 | Task 3.2 `[judge]`                                            | Tasks 2.1 and 3.1        | Optional advisory judge result captured in review payload without gating replay.   |

### Parallel Metrics Snapshot

| Metric                   | Value          | Notes                                                                                   |
| ------------------------ | -------------- | --------------------------------------------------------------------------------------- |
| Total executable tasks   | 6              | Deferred technologies are recorded as decisions, not implementation tasks.              |
| Critical path length     | 4 waves        | Dependency boundary and contracts must exist before schema/adapter code.                |
| Maximum safe parallelism | 3 tasks        | Wave 0 has disjoint write sets and can run in parallel.                                 |
| Average parallelism      | 1.5 tasks/wave | Small adapter blueprint has an intentionally serial validation → adapter → judge chain. |
| Write-conflict risk      | Low            | Each same-wave task owns disjoint files.                                                |
| Parallelization grade    | B-             | Good initial fan-out; later serialization is justified by schema and adapter ownership. |

## Execution Tasks

### Task 1.1 — `[deps]` Add AI/validation dependencies behind a boundary

**Depends:** None

**Files:**

- `apps/workers/package.json`
- `pnpm-lock.yaml`
- `apps/workers/src/tests/aiDependencyBoundary.test.ts`

**Steps (TDD):**

1. Add a failing boundary test that imports only the planned adapter path and asserts no `ai`, `workers-ai-provider`, `ajv`, or TypeBox imports are used outside `apps/workers/src/intake/*`.
2. Add dependencies: `ai`, `workers-ai-provider`, `@sinclair/typebox`, and `ajv` to `apps/workers/package.json`.
3. Install with `pnpm install --lockfile-only` or the repo-standard package-manager command.
4. Make the boundary test pass by keeping dependency usage inside the adapter/schema modules only.
5. Run targeted worker tests and `pnpm blueprints:check`.

**Acceptance:**

- Lockfile is consistent with `apps/workers/package.json`.
- No model SDK or Ajv imports appear in route handlers, repositories, queue consumers, or UI code.
- Tests fail if future code bypasses the adapter boundary.

### Task 1.2 — `[contracts]` Extend shared intake suggestion contracts

**Depends:** None

**Files:**

- `packages/types/IntakeMapping.ts`
- `packages/types/IntakeMapping.test.ts`

**Steps (TDD):**

1. Add failing contract tests for `MappingSuggestion`, `MappingSuggestionBatch`, `JudgeAssessment`, and `ReplayPlan` DTOs.
2. Extend shared TypeScript types with provider-neutral fields: source path, target field, transform kind, confidence, explanation, evidence sample, deterministic validation result, optional judge assessment, and replay status.
3. Keep types domain-oriented; do not reference Vercel AI SDK, Workers AI, Ajv, or TypeBox types.
4. Add serialization round-trip tests for accepted, rejected, and pending suggestions.
5. Run `pnpm --filter @ingestlens/types test` or the repo-equivalent targeted type package test.

**Acceptance:**

- Shared DTOs describe the review/replay workflow without provider-specific imports.
- DTO tests cover pending, approved, rejected, and replayed suggestion states.
- Existing consumers compile without backward-compatibility shims that preserve old branding.

### Task 1.3 — `[paths]` Implement restricted source-path handling

**Depends:** None

**Files:**

- `apps/workers/src/intake/sourcePath.ts`
- `apps/workers/src/intake/sourcePath.test.ts`

**Steps (TDD):**

1. Add failing tests for allowed paths such as `/company/name`, `/location/city`, and `/description`.
2. Add failing tests for disallowed paths: `__proto__`, `constructor`, empty segments, wildcard traversal, array-wide mutation, relative syntax, and paths outside the current intake payload.
3. Implement a small RFC 6901-style parser and resolver that only reads values from an allowlisted input object.
4. Return typed errors instead of throwing raw exceptions for invalid model suggestions.
5. Run targeted tests.

**Acceptance:**

- LLM suggestions cannot mutate arbitrary JSON or address prototype-pollution keys.
- Path errors are explainable enough for the admin review UI.
- Helper has no dependency on the AI SDK or Ajv.

### Task 2.1 — `[schemas]` Define TypeBox/Ajv schemas and validators

**Depends:** Task 1.1, Task 1.2

**Files:**

- `apps/workers/src/intake/schemas.ts`
- `apps/workers/src/intake/validators.ts`
- `apps/workers/src/intake/intakeSchemas.test.ts`

**Steps (TDD):**

1. Add failing tests for valid and invalid `MappingSuggestionBatch`, `JudgeAssessment`, and `ReplayPlan` payloads.
2. Define TypeBox schemas that mirror the shared DTO contract from `packages/types`.
3. Compile Ajv validators in `validators.ts` and expose narrow functions such as `validateMappingSuggestionBatch`.
4. Include negative fixtures for missing explanations, invalid confidence ranges, unknown target fields, and malformed source paths.
5. Ensure validation errors are stable enough for tests and UI display.
6. Run targeted tests and typecheck.

**Acceptance:**

- Schema and shared DTO drift is caught by tests or type assertions.
- Ajv is hidden behind validator functions.
- Invalid model output cannot become an admin-review suggestion.

### Task 3.1 — `[adapter]` Implement the AI SDK mapping adapter

**Depends:** Task 1.1, Task 1.2, Task 1.3, Task 2.1

**Files:**

- `apps/workers/src/intake/aiMappingAdapter.ts`
- `apps/workers/src/intake/aiMappingAdapter.test.ts`
- `apps/workers/src/db/client.ts`
- `apps/workers/src/tests/helpers.ts`
- `apps/workers/wrangler.toml`

**Steps (TDD):**

1. Add failing tests for `suggestMappings(payload, targetSchema, context)` using a fake model provider.
2. Add failing tests for model timeout, malformed structured output, invalid source paths, and low-confidence output.
3. Implement an adapter that calls `generateObject` with a TypeBox/Ajv-validated schema and normalizes errors into domain errors.
4. Inject the model/provider so tests never call a live model.
5. Add a Cloudflare Workers AI binding seam in config without requiring paid SaaS or local credentials for tests.
6. Persist decision-log metadata needed by observability: provider, model, prompt version, validation outcome, confidence distribution, and failure reason.
7. Run targeted adapter tests and worker typecheck.

**Acceptance:**

- The adapter can be unit-tested deterministically with a fake provider.
- Live Workers AI usage is isolated to configuration/injection code.
- Model output is never trusted until schema validation and source-path validation pass.
- Observability data is captured without storing raw secrets or unnecessary sensitive payloads.

### Task 3.2 — `[judge]` Add advisory LLM-as-judge assessment

**Depends:** Task 2.1, Task 3.1

**Files:**

- `apps/workers/src/intake/aiMappingAdapter.ts`
- `apps/workers/src/intake/aiMappingAdapter.test.ts`
- `apps/workers/src/intake/schemas.ts`
- `apps/workers/src/intake/intakeSchemas.test.ts`

**Steps (TDD):**

1. Add failing tests where the primary mapper proposes a plausible-but-wrong mapping and the judge returns a warning.
2. Add failing tests proving judge failure does not block deterministic validation or admin review creation.
3. Extend schemas with `JudgeAssessment` fields: verdict, concerns, confidence, and recommended human action.
4. Implement the judge call as optional and advisory; deterministic validators and human approval remain authoritative.
5. Add metrics/log fields for judge disagreement and judge unavailability.
6. Run targeted adapter/schema tests.

**Acceptance:**

- Judge output is visible to reviewers but cannot auto-approve, auto-reject, or replay changes.
- Judge unavailability degrades gracefully with an explicit observability event.
- Tests prove deterministic validation still owns safety.

## Deferred Decisions

| Technology                     | Decision       | Revisit Trigger                                                                                             | Required Precondition                                                           |
| ------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Promptfoo                      | Defer from v1. | Prompt wording or model choice starts changing often enough that fixture tests no longer catch regressions. | `ai-payload-intake-mapper` has shipped golden fixtures and prompt-version logs. |
| JSON Patch / `fast-json-patch` | Defer from v1. | Admin reviewers need multi-field structural edits beyond allowlisted mapping suggestions.                   | Admin review UI and replay audit trail are shipped.                             |
| Langfuse                       | Defer from v1. | Local decision logs and metrics are insufficient for debugging prompt/model regressions.                    | A self-hosting story is justified without paid SaaS.                            |
| BAML                           | Reject for v1. | Prompt/schema complexity exceeds what TypeBox + adapter functions can maintain.                             | Team accepts another language/toolchain in the repo.                            |
| Vercel AI Gateway              | Reject for v1. | Project constraints change to allow paid/hosted control planes.                                             | Explicit approval of external SaaS dependency.                                  |

## Verification Gates

Run after the implementation wave that touches code:

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm docs:check
pnpm blueprints:check
pnpm format:check
git diff --check
```

Additional targeted checks:

```bash
pnpm --filter apps-workers test -- aiMappingAdapter
pnpm --filter apps-workers test -- intakeSchemas
pnpm --filter apps-workers test -- sourcePath
pnpm --filter @ingestlens/types test -- IntakeMapping
rg -n "from ['\"](ai|workers-ai-provider|ajv|@sinclair/typebox)" apps packages
```

## Cross-Plan References

- `ai-payload-intake-mapper` should consume the adapter and validators from this blueprint instead of choosing its own model/validation stack.
- `admin-review-replay-console` should display suggestion confidence, validation failures, and optional judge concerns, but must not import AI SDK code.
- `public-dataset-demo-ingestion` should provide messy public fixtures; this blueprint only defines how suggestions are generated and validated.
- `showcase-hardening-100` should include the adapter boundary tests and no-SaaS dependency posture in final repository hygiene.

## Edge Cases to Preserve

- Model returns syntactically valid JSON that fails domain validation.
- Model returns a valid source path that points to an empty or null value.
- Model proposes a target field that is not in the active target schema.
- Judge disagrees with primary mapper.
- Judge/model call times out.
- Cloudflare AI binding is absent in local tests.
- Suggestion is approved after target schema version changes.
- Multiple suggestions map the same source path to conflicting target fields.

## Non-goals

- No full marketplace, connector marketplace, or generic integration platform.
- No paid SaaS control plane.
- No auto-replay without human approval.
- No model-provider abstraction beyond the one adapter needed for tests and Workers AI.
- No broad JSON Patch mutation language in v1.

## Risks

| Risk                                                    | Mitigation                                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| AI SDK provider abstractions leak into domain code.     | Boundary test plus adapter-only imports.                                                   |
| TypeBox schemas drift from shared TypeScript DTOs.      | Type assertions and round-trip fixtures.                                                   |
| LLM-as-judge creates false confidence.                  | Advisory-only status, human approval gate, deterministic validation remains authoritative. |
| Workers AI local development is brittle.                | Fake provider for tests; binding required only for live demo mode.                         |
| Tooling pile-up makes the project look over-engineered. | Defer Promptfoo/Langfuse/BAML/JSON Patch until evidence justifies them.                    |

## Technology Choices

| Package               | Status                     | License / Posture         | Notes                                                                |
| --------------------- | -------------------------- | ------------------------- | -------------------------------------------------------------------- |
| `ai`                  | Adopt                      | Apache-2.0                | Use only in adapter.                                                 |
| `workers-ai-provider` | Adopt                      | MIT                       | Cloudflare-compatible provider for AI SDK.                           |
| `@sinclair/typebox`   | Adopt                      | MIT                       | JSON Schema-first contract definitions.                              |
| `ajv`                 | Adopt                      | MIT                       | Deterministic validation.                                            |
| `jsonpointer`         | Not adopted directly in v1 | MIT                       | Implement restricted helper first; revisit if helper grows too much. |
| `fast-json-patch`     | Deferred                   | MIT                       | Too broad for first replay design.                                   |
| `promptfoo`           | Deferred                   | MIT                       | Valuable after prompt fixtures exist.                                |
| `langfuse`            | Deferred                   | OSS/self-hostable posture | Too much infra for v1.                                               |
| `baml`                | Rejected for v1            | OSS posture               | Adds a language/toolchain before the project needs it.               |
| Vercel AI Gateway     | Rejected for v1            | Hosted SaaS               | Conflicts with no-paid-SaaS constraint.                              |

## Refinement Summary

| Area                           | Result                                                                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Technology claims fact-checked | 9 findings reviewed against official package/docs sources.                                                                                         |
| Decisions resolved             | 10 concrete choices across provider, validation, pointer safety, evals, observability, and deferred tooling.                                       |
| Executable tasks               | 6 tasks with `Depends`, `Files`, TDD steps, and acceptance criteria.                                                                               |
| Deferred technologies          | 5 deferred/rejected decisions moved out of the execution task graph.                                                                               |
| Cross-plan alignment           | Roadmap and AI intake mapper plan must depend on this adapter before implementing model-assisted mapping.                                          |
| Edge cases                     | 8 explicit safety and degradation cases documented.                                                                                                |
| Remaining risk                 | Later waves are intentionally serial because adapter/judge work must consume validated schemas rather than parallel-writing conflicting contracts. |

## Sources

- Vercel AI SDK repository: <https://github.com/vercel/ai>
- Vercel AI SDK docs: <https://vercel.com/docs/ai-sdk>
- Cloudflare Workers AI SDK integration: <https://developers.cloudflare.com/workers-ai/configuration/ai-sdk/>
- TypeBox repository: <https://github.com/sinclairzx81/typebox>
- Ajv documentation: <https://ajv.js.org/>
- jsonpointer package: <https://www.npmjs.com/package/jsonpointer>
- fast-json-patch repository: <https://github.com/Starcounter-Jack/JSON-Patch>
- Promptfoo repository: <https://github.com/AI-App/PromptFoo>
- Langfuse self-hosting docs: <https://langfuse.com/self-hosting>
- BAML repository: <https://github.com/BoundaryML/baml>
- BAML docs: <https://docs.boundaryml.com/>
