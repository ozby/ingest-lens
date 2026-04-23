---
type: blueprint
status: planned
complexity: L
created: "2026-04-23"
last_updated: "2026-04-23"
progress: "0% planned; refinement pass complete"
depends_on:
  - showcase-hardening-100
  - rebrand-ingestlens
tags:
  - ai
  - workers-ai
  - integration
  - payload-mapping
  - observability
---

# AI payload intake mapper

**Goal:** Add the smallest impressive AI feature: a protected IngestLens intake
endpoint and UI that take a public ATS/HRIS-style payload, ask Cloudflare Workers
AI for a suggestion-only field mapping to a unified schema, validate the model's
JSON output, and publish an auditable normalized event only after explicit
operator approval.

## Planning Summary

- User constraints stay the same: no paid SaaS, no full marketplace,
  engineering-rigor-first.
- Repo-local fact-check: worker routes live in `apps/workers/src/routes`, worker
  tests live in `apps/workers/src/tests`, shared contracts live in
  `packages/types`, client routing lives in `apps/client/src/App.tsx`, and
  navigation lives in `apps/client/src/components/Sidebar.tsx`.
- Config fact-check: this repo uses `apps/workers/wrangler.toml` (not
  `wrangler.jsonc`) and currently does **not** commit a generated
  `worker-configuration.d.ts`.
- Dataset fact-check: the pinned demo/eval assets already exist under
  `data/payload-mapper/` and the design doc already exists at
  `docs/ai/payload-mapper.md`.
- Command fact-check: workspace commands are `pnpm --filter @repo/workers ...`,
  `pnpm --filter client ...`, root verification uses `pnpm check-types`,
  `pnpm build`, `pnpm lint:repo`, and root TS scripts are run via `bun` from
  package scripts.

## Architecture Overview

```text
Client intake page
  -> POST /api/intake/mapping-suggestions
    -> auth + rate limit + payload/schema validation
    -> prompt builder from repo schema records
    -> env.AI.run(model, response_format: json_schema)
    -> strict JSON parse + schema validation + source-path existence checks
    -> persist suggestion attempt + confidence + abstention + delivery target draft
  -> operator reviews uncertainty and approves
    -> POST /api/intake/mapping-suggestions/:id/approve
    -> normalize payload using approved mapping
    -> publish normalized event through the existing DELIVERY_QUEUE rails
    -> dashboard shows mapping + delivery telemetry without raw payload leakage
```

## Fact-Checked Findings

| ID  | Severity | Claim / assumption                                                                | Reality / source                                                                                                                                                                             | Blueprint fix                                                                                                                                           |
| --- | -------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | High     | New worker tests can be colocated beside the route files.                         | Existing worker route tests live in `apps/workers/src/tests/*.test.ts` (`topic.test.ts`, `message.test.ts`, `queue.test.ts`).                                                                | **Fx1** — Put all new worker tests in `apps/workers/src/tests/` and keep route files in `apps/workers/src/routes/`.                                     |
| F2  | High     | Shared contracts should be added under a new nested package structure.            | `packages/types` is a flat package with `Entities.ts`, `Requests.ts`, `Responses.ts`, and a single `index.ts` barrel.                                                                        | **Fx2** — Add one flat `packages/types/IntakeMapping.ts` file and re-export it from `packages/types/index.ts`.                                          |
| F3  | High     | Worker AI config belongs in `wrangler.jsonc` or a committed generated types file. | This repo ships `apps/workers/wrangler.toml`; `infra/src/deploy/wrangler-config.ts` writes `wrangler.generated.toml`; no committed `worker-configuration.d.ts` exists.                       | **Fx3** — Scope AI binding work to `apps/workers/wrangler.toml` and `apps/workers/src/db/client.ts`; do not plan around a missing generated `.d.ts`.    |
| F4  | High     | The intake endpoint can exist without touching the worker entrypoint.             | `apps/workers/src/index.ts` manually wires every route via `app.route(...)`.                                                                                                                 | **Fx4** — Register `intakeRoutes` in `apps/workers/src/index.ts` as part of the API task.                                                               |
| F5  | High     | Approval/publish needs a new delivery mechanism.                                  | Existing delivery already publishes through `c.env.DELIVERY_QUEUE.send(...)` in `apps/workers/src/routes/message.ts` and `apps/workers/src/routes/topic.ts`.                                 | **Fx5** — Reuse the current queue-send payload shape; do not introduce a parallel publisher abstraction in this blueprint.                              |
| F6  | Medium   | Telemetry can be added ad hoc in route handlers only.                             | The repo already centralizes Analytics Engine writes in `apps/workers/src/telemetry.ts`, while dashboard reads live in `apps/workers/src/routes/dashboard.ts`.                               | **Fx6** — Extend `telemetry.ts` and dashboard aggregates rather than scattering analytics writes.                                                       |
| F7  | Medium   | Client routing/navigation files are unclear.                                      | `apps/client/src/App.tsx`, `apps/client/src/services/api.ts`, and `apps/client/src/components/Sidebar.tsx` are the exact integration points; no `Intake.tsx` page exists yet.                | **Fx7** — Keep the UI slice limited to those exact files plus new intake page/review component/test files.                                              |
| F8  | Medium   | Dataset and eval assets still need discovery.                                     | `data/payload-mapper/payloads/ats/open-apply-sample.jsonl`, `data/payload-mapper/evals/eval-contract.json`, and `docs/ai/payload-mapper.md` already exist.                                   | **Fx8** — Reuse the pinned payload/eval/docs assets instead of inventing new dataset plumbing in this plan.                                             |
| F9  | High     | Workers AI JSON Mode can be treated as deterministic.                             | Cloudflare's Workers AI docs describe `[ai] binding = "AI"`, `env.AI.run(...)`, and JSON Mode schema output, but also explicitly note that schema satisfaction can fail and must be handled. | **Fx9** — Keep adapter-only AI access, fail closed on invalid JSON/schema mismatches, and persist abstention/validation errors as first-class outcomes. |
| F10 | Low      | A root `ai:eval` script already exists.                                           | Root `package.json` currently has no `ai:eval` script, but other TS scripts are already invoked via `bun`.                                                                                   | **Fx10** — Add `pnpm ai:eval` as a root script that runs `bun ./scripts/run-mapping-eval.ts`.                                                           |

## Key Decisions

| Decision         | Choice                                                        | Rationale                                                                              |
| ---------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| AI provider      | Cloudflare Workers AI                                         | On-stack, no paid external SaaS, aligns with existing Worker runtime.                  |
| Model behavior   | Adapter-only JSON Mode + strict local validation + abstention | Keeps the model behind one boundary and treats invalid output as failure, not success. |
| Shared contracts | Flat `packages/types/IntakeMapping.ts` export                 | Matches current `packages/types` layout instead of inventing nested folders.           |
| Delivery         | Reuse existing `DELIVERY_QUEUE.send(...)` message shape       | Smallest diff that stays aligned with current queue/topic delivery rails.              |
| Eval runner      | Root `pnpm ai:eval` -> `bun ./scripts/run-mapping-eval.ts`    | Fits the repo's current script-running pattern for TS utilities.                       |
| UX               | Operator-in-the-loop                                          | Mapping uncertainty is visible product value, not something to hide.                   |

## Quick Reference (Execution Waves)

| Wave              | Tasks                            | Dependencies               | Parallelizable | Effort |
| ----------------- | -------------------------------- | -------------------------- | -------------- | ------ |
| **Wave 0**        | 1.1, 1.2, 1.3                    | Blueprint-level gates only | 3 agents       | S-M    |
| **Wave 1**        | 2.1, 3.2                         | Wave 0                     | 2 agents       | M + S  |
| **Wave 2**        | 2.2                              | 2.1                        | 1 agent        | M      |
| **Wave 3**        | 2.3, 3.1                         | 2.2                        | 2 agents       | S + M  |
| **Critical path** | 1.1/1.2/1.3 -> 2.1 -> 2.2 -> 3.1 | --                         | 4 waves        | L      |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning                  | Target                | Actual                        |
| ------ | ---------------------------------- | --------------------- | ----------------------------- |
| RW0    | Ready tasks in Wave 0              | >= planned agents / 2 | 3 runnable tasks for 3 agents |
| CPR    | total_tasks / critical_path_length | >= 2.0                | 8 / 4 = 2.0                   |
| DD     | dependency_edges / total_tasks     | <= 2.0                | 13 / 8 = 1.625                |
| CP     | same-wave file overlaps per wave   | 0                     | 0                             |

**Parallelization score:** B. The plan keeps meaningful width in Waves 0, 1,
and 3 while forcing file-conflicting work (`apps/workers/src/routes/intake.ts`,
`apps/workers/src/db/schema.ts`) into serialized waves so same-wave conflict
pressure stays at zero.

---

### Phase 1: Contracts, prompt, and AI boundary [Complexity: M]

#### [contracts] Task 1.1: Define shared intake and mapping contracts

**Status:** todo

**Depends:** None

Define request/response contracts first, including suggestion results,
validation failures, abstention, and approval-target shape. Keep the shared type
surface flat and repo-native. (Fx1, Fx2, Fx8, Fx9)

**Files:**

- Create: `packages/types/IntakeMapping.ts`
- Modify: `packages/types/index.ts`
- Create: `apps/workers/src/intake/contracts.ts`
- Create: `apps/workers/src/tests/intakeContracts.test.ts`

**Steps (TDD):**

1. Write failing contract tests in
   `apps/workers/src/tests/intakeContracts.test.ts` for valid suggestions,
   abstention, ambiguous fields, hallucinated `sourcePath` values, and invalid
   approval targets (`queueId` xor `topicId`).
2. Run the RED step:
   `pnpm --filter @repo/workers test -- src/tests/intakeContracts.test.ts`.
3. Add `packages/types/IntakeMapping.ts` and export it from
   `packages/types/index.ts`; implement worker-local validation helpers in
   `apps/workers/src/intake/contracts.ts`.
4. Re-run the focused test until GREEN, then run:
   `pnpm --filter @repo/workers check-types` and `pnpm check-types`.

**Acceptance:**

- [ ] Shared contracts represent accepted, rejected, failed, and abstained suggestions.
- [ ] Approval target is explicit and rejects both-or-neither `queueId` / `topicId` input.
- [ ] Contract metadata includes model name, prompt version, and validation errors.
- [ ] Tests prove nonexistent `sourcePath` values are rejected before publish.

---

#### [ai-boundary] Task 1.2: Add a Workers AI adapter with deterministic fallback

**Status:** todo

**Depends:** Task 1.1

Wrap Workers AI behind one adapter so tests and local demos stay deterministic,
and bind AI only where the current repo actually expects runtime bindings.
(Fx1, Fx3, Fx9)

**Files:**

- Create: `apps/workers/src/intake/aiMappingAdapter.ts`
- Create: `apps/workers/src/tests/aiMappingAdapter.test.ts`
- Modify: `apps/workers/src/db/client.ts`
- Modify: `apps/workers/src/tests/helpers.ts`
- Modify: `apps/workers/wrangler.toml`

**Steps (TDD):**

1. Write failing adapter tests for AI success, JSON Mode schema failure,
   malformed JSON, explicit abstention, and deterministic fallback mode in
   `apps/workers/src/tests/aiMappingAdapter.test.ts`.
2. Run the RED step:
   `pnpm --filter @repo/workers test -- src/tests/aiMappingAdapter.test.ts`.
3. Add `[ai] binding = "AI"` to `apps/workers/wrangler.toml`, extend `Env` in
   `apps/workers/src/db/client.ts` with `AI?: Ai`, update test helpers, and
   implement `apps/workers/src/intake/aiMappingAdapter.ts`.
4. Re-run the focused test until GREEN, then run:
   `pnpm --filter @repo/workers check-types` and
   `pnpm --filter @repo/workers lint`.

**Acceptance:**

- [ ] Production AI calls happen only in `apps/workers/src/intake/aiMappingAdapter.ts`.
- [ ] Local/test fallback is explicit and visibly labelled, never silent fake AI.
- [ ] JSON Mode failures become safe API failures or abstentions.
- [ ] No test depends on live Cloudflare credentials.

---

#### [prompt] Task 1.3: Version the mapping prompt and eval contract together

**Status:** todo

**Depends:** Task 1.1

Create a versioned prompt that uses the existing schema/eval assets and teaches
the model to abstain rather than invent fields. Keep prompt and eval contract in
lock-step. (Fx1, Fx8, Fx9, Fx10)

**Files:**

- Create: `apps/workers/src/intake/prompts/payloadMappingV1.ts`
- Create: `apps/workers/src/tests/payloadMappingPrompt.test.ts`
- Modify: `docs/ai/payload-mapper.md`
- Modify: `data/payload-mapper/evals/eval-contract.json`

**Steps (TDD):**

1. Write failing prompt tests in
   `apps/workers/src/tests/payloadMappingPrompt.test.ts` using one Greenhouse,
   one Lever, and one Ashby fixture from
   `data/payload-mapper/payloads/ats/open-apply-sample.jsonl`.
2. Run the RED step:
   `pnpm --filter @repo/workers test -- src/tests/payloadMappingPrompt.test.ts`.
3. Implement `apps/workers/src/intake/prompts/payloadMappingV1.ts` and update
   `docs/ai/payload-mapper.md` plus `data/payload-mapper/evals/eval-contract.json`
   if the prompt/response contract adds persisted fields such as prompt version.
4. Re-run the focused test until GREEN, then run:
   `pnpm --filter @repo/workers check-types`.

**Acceptance:**

- [ ] Prompt instructs the model not to map fields that are absent from the payload.
- [ ] Prompt output shape matches the checked-in eval contract.
- [ ] Prompt version is carried forward in suggestion records and API responses.
- [ ] Fixture coverage includes at least three vendor payload shapes already present in-repo.

---

### Phase 2: Worker API, approval, and telemetry [Complexity: M]

#### [api] Task 2.1: Add the protected mapping-suggestion endpoint

**Status:** todo

**Depends:** Task 1.1, Task 1.2, Task 1.3

Add the first authenticated intake endpoint for generating mapping suggestions
from supplied payloads and target schema identifiers. Keep route wiring and DB
changes explicit. (Fx1, Fx4, Fx8, Fx9)

**Files:**

- Create: `apps/workers/src/routes/intake.ts`
- Create: `apps/workers/src/tests/intake.test.ts`
- Modify: `apps/workers/src/db/schema.ts`
- Modify: `apps/workers/src/index.ts`

**Steps (TDD):**

1. Write failing endpoint tests in `apps/workers/src/tests/intake.test.ts` for
   unauthenticated access, rate-limited access, invalid payload,
   too-large/too-deep payload rejection, valid fixture suggestion, abstention,
   and validation failure.
2. Run the RED step:
   `pnpm --filter @repo/workers test -- src/tests/intake.test.ts`.
3. Add storage shape in `apps/workers/src/db/schema.ts`, implement
   `apps/workers/src/routes/intake.ts`, and register it in
   `apps/workers/src/index.ts`.
4. Re-run the focused test until GREEN, then run:
   `pnpm --filter @repo/workers test`,
   `pnpm --filter @repo/workers check-types`, and
   `pnpm --filter @repo/workers lint`.

**Acceptance:**

- [ ] `/api/intake/mapping-suggestions` is authenticated and rate-limited.
- [ ] Invalid or oversized payloads fail before any AI call is attempted.
- [ ] Suggestion attempts persist owner scope, schema id, prompt version, model name, status, confidence, and validation errors.
- [ ] `apps/workers/src/index.ts` is the only route-registration touchpoint for the new endpoint.

---

#### [approval] Task 2.2: Approve a suggestion, normalize it, and publish once

**Status:** todo

**Depends:** Task 2.1

Allow operators to approve exactly one suggestion once, normalize the payload,
and publish it through the existing delivery queue rails without refactoring the
current queue/topic publisher paths. (Fx2, Fx5, Fx9)

**Files:**

- Modify: `packages/types/IntakeMapping.ts`
- Modify: `apps/workers/src/db/schema.ts`
- Modify: `apps/workers/src/routes/intake.ts`
- Modify: `apps/workers/src/tests/intake.test.ts`
- Create: `apps/workers/src/intake/normalizeWithMapping.ts`
- Create: `apps/workers/src/tests/normalizeWithMapping.test.ts`

**Steps (TDD):**

1. Extend `apps/workers/src/tests/intake.test.ts` and add
   `apps/workers/src/tests/normalizeWithMapping.test.ts` with failing tests for
   owner approval, non-owner rejection, repeated approval idempotency,
   invalid/missing delivery target, normalization output, and downstream publish
   failure.
2. Run the RED step:
   `pnpm --filter @repo/workers test -- src/tests/intake.test.ts src/tests/normalizeWithMapping.test.ts`.
3. Implement approval/publish behavior in `apps/workers/src/routes/intake.ts`,
   add normalization logic in `apps/workers/src/intake/normalizeWithMapping.ts`,
   and extend schema/contracts only as needed for approval and delivery status.
4. Re-run the focused tests until GREEN, then run:
   `pnpm --filter @repo/workers test`,
   `pnpm --filter @repo/workers check-types`, and
   `pnpm --filter @repo/workers lint`.

**Acceptance:**

- [ ] No normalized event is published before approval.
- [ ] Approval is idempotent and owner-scoped.
- [ ] Publish uses the existing `DELIVERY_QUEUE.send({ messageId, seq, queueId, pushEndpoint, topicId, attempt })` shape.
- [ ] Publish failures do not mark suggestions as delivered.

---

#### [telemetry] Task 2.3: Record AI + mapping telemetry without leaking payloads

**Status:** todo

**Depends:** Task 2.2

Expose suggestion lifecycle metrics and dashboard aggregates without storing or
emitting raw ATS/HRIS payload content. Keep telemetry centralized. (Fx6, Fx8,
Fx9)

**Files:**

- Modify: `apps/workers/src/telemetry.ts`
- Modify: `apps/workers/src/routes/dashboard.ts`
- Modify: `apps/workers/src/routes/intake.ts`
- Create: `apps/workers/src/tests/mappingTelemetry.test.ts`

**Steps (TDD):**

1. Write failing telemetry tests in
   `apps/workers/src/tests/mappingTelemetry.test.ts` for payload redaction,
   suggestion-status aggregation, and approval/publish counters.
2. Run the RED step:
   `pnpm --filter @repo/workers test -- src/tests/mappingTelemetry.test.ts`.
3. Extend `apps/workers/src/telemetry.ts`, `apps/workers/src/routes/intake.ts`,
   and `apps/workers/src/routes/dashboard.ts` with redacted metrics only.
4. Re-run the focused test until GREEN, then run:
   `pnpm --filter @repo/workers test`,
   `pnpm --filter @repo/workers lint`, and
   `pnpm --filter @repo/workers check-types`.

**Acceptance:**

- [ ] Telemetry never includes raw candidate, employee, or job-description text.
- [ ] Dashboard can show suggestion success, abstention, validation-failure, approval, and publish counts.
- [ ] Redaction is enforced by tests, not comments alone.

---

### Phase 3: Client intake UI and measurable quality gate [Complexity: M]

#### [client] Task 3.1: Build the IngestLens intake UI

**Status:** todo

**Depends:** Task 2.2

Add a focused UI for fixture selection or pasted JSON, suggestion review,
uncertainty display, and explicit approval. Keep the change isolated to the
existing client route/nav/service integration points. (Fx2, Fx7)

**Files:**

- Create: `apps/client/src/pages/Intake.tsx`
- Create: `apps/client/src/pages/Intake.test.tsx`
- Create: `apps/client/src/components/MappingSuggestionReview.tsx`
- Modify: `apps/client/src/services/api.ts`
- Modify: `apps/client/src/App.tsx`
- Modify: `apps/client/src/components/Sidebar.tsx`

**Steps (TDD):**

1. Write failing client tests in `apps/client/src/pages/Intake.test.tsx` for
   fixture load, invalid JSON, suggestion rendering, ambiguous-field display,
   and approve-button behavior.
2. Run the RED step:
   `pnpm --filter client test -- src/pages/Intake.test.tsx`.
3. Implement the page, review component, API methods, route registration, and
   sidebar navigation using the existing client patterns.
4. Re-run the focused test until GREEN, then run:
   `pnpm --filter client test`,
   `pnpm --filter client check-types`, and
   `pnpm --filter client lint`.

**Acceptance:**

- [ ] Users can paste JSON or load a fixture and receive a validated mapping suggestion.
- [ ] Missing and ambiguous fields are visually distinct from confident mappings.
- [ ] Approval is explicit and shows resulting delivery status.
- [ ] The UI change stays inside the listed files; no new client architecture layer is introduced.

---

#### [eval] Task 3.2: Add a deterministic mapping eval runner and quality gate

**Status:** todo

**Depends:** Task 1.1, Task 1.2, Task 1.3

Make mapping quality measurable with a deterministic runner first, then allow
opt-in live AI evals. Use a testable helper plus a thin root CLI script so the
plan remains TDD-compliant. (Fx8, Fx9, Fx10)

**Files:**

- Create: `apps/workers/src/intake/evaluateMappings.ts`
- Create: `apps/workers/src/tests/evaluateMappings.test.ts`
- Create: `scripts/run-mapping-eval.ts`
- Modify: `package.json`
- Modify: `data/payload-mapper/evals/README.md`
- Modify: `docs/ai/payload-mapper.md`

**Steps (TDD):**

1. Write failing eval tests in
   `apps/workers/src/tests/evaluateMappings.test.ts` for exact mapping,
   missing-field detection, ambiguity detection, and non-hallucination scoring.
2. Run the RED step:
   `pnpm --filter @repo/workers test -- src/tests/evaluateMappings.test.ts`.
3. Implement `apps/workers/src/intake/evaluateMappings.ts`, add the thin CLI at
   `scripts/run-mapping-eval.ts`, and add root script
   `"ai:eval": "bun ./scripts/run-mapping-eval.ts"` to `package.json`.
4. Re-run the focused test until GREEN, then run:
   `pnpm --filter @repo/workers test -- src/tests/evaluateMappings.test.ts` and
   `pnpm ai:eval`.

**Acceptance:**

- [ ] `pnpm ai:eval` passes deterministically without Cloudflare credentials.
- [ ] Live AI eval is opt-in only (for example via `RUN_LIVE_AI_EVAL=1`).
- [ ] Non-hallucination remains a hard gate in the runner output.
- [ ] Eval docs explain deterministic vs live modes using the checked-in dataset.

---

## Verification Gates

| Gate                 | Command                             | Success Criteria                                                            |
| -------------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| Worker tests         | `pnpm --filter @repo/workers test`  | Intake route, adapter, normalization, telemetry, and eval helper tests pass |
| Client tests         | `pnpm --filter client test`         | Intake UI tests pass                                                        |
| Worker lint          | `pnpm --filter @repo/workers lint`  | Zero worker lint issues                                                     |
| Client lint          | `pnpm --filter client lint`         | Zero client lint issues                                                     |
| Type safety          | `pnpm check-types`                  | Zero workspace type errors                                                  |
| Build                | `pnpm build`                        | Workspace builds succeed                                                    |
| Eval                 | `pnpm ai:eval`                      | Deterministic eval passes configured thresholds                             |
| Repo lint            | `pnpm lint:repo`                    | Repository static lint passes                                               |
| Blueprint validation | `pnpm blueprints:check`             | Blueprint lifecycle/frontmatter validation passes                           |
| Audit                | `pnpm audit --audit-level=moderate` | No newly introduced unresolved vulnerabilities                              |

## Cross-Plan References

| Type       | Blueprint                       | Relationship                                                                               |
| ---------- | ------------------------------- | ------------------------------------------------------------------------------------------ |
| Upstream   | `showcase-hardening-100`        | This blueprint should not land before the repo-wide security/type/CI baseline is hardened. |
| Upstream   | `rebrand-ingestlens`            | Intake route/page copy should use IngestLens naming and navigation language.               |
| Downstream | `public-dataset-demo-ingestion` | Can add live public dataset ingestion polish after the deterministic intake mapper exists. |

## Edge Cases and Error Handling

| Edge Case                                                                    | Risk                        | Solution                                                                   | Task     |
| ---------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------- | -------- |
| Workers AI returns invalid JSON or `JSON Mode couldn't be met`               | API crash or unsafe mapping | Catch in the adapter, persist failure details, and abstain/fail closed     | 1.2, 2.1 |
| Suggested `sourcePath` does not exist in the payload                         | Silent data corruption      | Validate every suggested path before persistence or approval               | 1.1, 2.1 |
| Approval request sends both `queueId` and `topicId`, or neither              | Ambiguous delivery target   | Enforce an xor contract in shared types + route validation                 | 1.1, 2.2 |
| Downstream queue/topic target does not exist or is not owned by the approver | Cross-tenant publish risk   | Re-check ownership at approval time before any publish call                | 2.2      |
| Approval is repeated                                                         | Duplicate normalized events | Store approval state/idempotency and short-circuit repeats                 | 2.2      |
| Payload contains PII                                                         | Telemetry/log leakage       | Redact telemetry and never emit raw payload text                           | 2.3      |
| Local dev lacks an AI binding                                                | Blocked demos/tests         | Use explicit deterministic fallback path                                   | 1.2      |
| Nested arrays or optional fields create ambiguous mappings                   | Overconfident suggestions   | Preserve ambiguity/missing-field outputs instead of forcing exact mappings | 1.1, 1.3 |
| Payload is too large or deeply nested for safe Worker processing             | Latency or memory spikes    | Reject early before prompt construction or AI invocation                   | 2.1      |

## Non-goals

- No autonomous production transforms.
- No paid external LLM provider.
- No connector marketplace.
- No RAG / AI Search assistant in this first AI slice.
- No scraping of private ATS/HRIS data.
- No refactor of the existing queue/topic publisher architecture beyond reuse.

## Risks

| Risk                                                             | Impact | Mitigation                                                                                 |
| ---------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| Workers AI latency is inconsistent                               | Medium | Keep async UX, persist attempt status, and surface telemetry rather than blocking silently |
| JSON Mode cannot satisfy the schema for some payloads            | High   | Fail closed, abstain, and score the behavior in `pnpm ai:eval`                             |
| Shared contracts drift between client and worker                 | Medium | Centralize them in `packages/types/IntakeMapping.ts` and gate with `pnpm check-types`      |
| Approval flow becomes a multi-target publish surface by accident | Medium | Keep xor target semantics and reuse the current queue-send shape only                      |
| Deterministic eval diverges from live AI behavior over time      | Medium | Keep live eval opt-in and documented; do not let it break CI determinism                   |

## Technology Choices

| Component         | Technology                                                   | Version                                        | Why                                                                                                 |
| ----------------- | ------------------------------------------------------------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Worker runtime    | Hono + Wrangler Worker app in `apps/workers`                 | Existing workspace tooling                     | Matches the current route/middleware/test structure                                                 |
| Shared contracts  | `packages/types/IntakeMapping.ts` + `index.ts` barrel export | New repo-local file in existing package layout | Smallest change that matches current `@repo/types` conventions                                      |
| AI inference      | Cloudflare Workers AI via `env.AI.run(...)`                  | Current platform docs                          | On-stack and compatible with Worker bindings                                                        |
| Structured output | Workers AI JSON Mode + local validation helpers              | Current platform docs + repo-local guardrails  | Structured output is useful, but local validation is mandatory because schema satisfaction can fail |
| Delivery          | Existing `DELIVERY_QUEUE.send(...)` rails                    | Existing repo behavior                         | Avoids adding another publisher path                                                                |
| Telemetry         | `apps/workers/src/telemetry.ts` + dashboard aggregates       | Existing repo behavior                         | Centralized, redacted Analytics Engine writes                                                       |
| Eval runner       | `bun ./scripts/run-mapping-eval.ts` via `pnpm ai:eval`       | Existing repo script pattern                   | Deterministic root command without new runtime dependencies                                         |

## Refinement Summary

| Metric                    | Value                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------- |
| Findings total            | 10                                                                                     |
| Critical                  | 0                                                                                      |
| High                      | 6                                                                                      |
| Medium                    | 3                                                                                      |
| Low                       | 1                                                                                      |
| Fixes applied             | 10/10 in blueprint                                                                     |
| Cross-plans updated       | 0                                                                                      |
| Edge cases documented     | 9                                                                                      |
| Risks documented          | 5                                                                                      |
| **Parallelization score** | B (useful width in 3 waves; same-wave file conflict pressure = 0)                      |
| **Critical path**         | 4 waves                                                                                |
| **Max parallel agents**   | 3                                                                                      |
| **Total tasks**           | 8                                                                                      |
| **Blueprint compliant**   | 8/8 tasks include `Status`, `Depends`, exact files, TDD steps, and acceptance criteria |

**Refinement delta (2026-04-23):** The original plan had the right product
shape, but it mixed guessed file paths with actual repo structure and left
same-file worker work too parallel to execute safely. This pass hardens the plan
around the real `apps/workers`, `apps/client`, `packages/types`, and
`data/payload-mapper` surfaces, moves every task to explicit TDD commands,
serializes `routes/intake.ts` / `db/schema.ts` edits to keep conflict pressure at
zero, and adds a deterministic `pnpm ai:eval` lane without changing the feature
intent.
