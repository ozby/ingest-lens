---
type: blueprint
status: completed
complexity: L
created: "2026-04-23"
last_updated: "2026-04-25"
progress: "100% — merged to main on 2026-04-25"
depends_on:
  - showcase-hardening-100
  - rebrand-ingestlens
  - ai-oss-tooling-adapter
tags:
  - ai
  - workers-ai
  - integration
  - payload-mapping
  - observability
---

# Intake mapping review flow

**Goal:** Add a protected IngestLens intake flow that accepts an example
third-party payload, asks Cloudflare Workers AI for a suggestion-only field
mapping to a target contract, validates the response locally, and ingests only
after explicit admin approval.

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
- Architecture decision: [ADR 0004](../../../docs/adrs/0004-ingestlens-ai-intake-architecture.md) fixes the AI boundary, review-retention model, bundled-fixture path, normalized event versioning, and `mappingTraceId` lifecycle.
- Command fact-check: workspace commands are `pnpm --filter @repo/workers ...`,
  `pnpm --filter client ...`, root verification uses `pnpm check-types`,
  `pnpm build`, `pnpm lint:repo`, and root TS scripts are run via `bun` from
  package scripts.

## Architecture Overview

```text
Client intake page
  -> POST /api/intake/mapping-suggestions
    -> auth + rate limit + payload/schema/contract validation
    -> prompt builder from repo schema records
    -> env.AI.run(model, response_format: json_schema)
    -> strict JSON parse + schema validation + source-path existence checks
    -> persist suggestion attempt + confidence + abstention + delivery target draft
  -> admin reviews uncertainty in /admin/intake approval panel
    -> GET /api/intake/mapping-suggestions?status=pending_review
    -> POST /api/intake/mapping-suggestions/:id/approve or /reject
    -> approval creates approved mapping revision and replays source payload
    -> deterministic ingest of eventType ingest.record.normalized + schemaVersion v1 through existing DELIVERY_QUEUE rails
    -> dashboard shows drift + approved mapping revision + ingest + delivery telemetry without raw payload leakage
```

### Simplification constraints from architecture review

This blueprint owns the generic ingestion core only. Job-posting fixtures and vendor-specific assertions belong to
`public-dataset-demo-ingestion`. Keep the implementation lens-agnostic and
deterministic:

- inject AI runner, DB facade, queue publisher, telemetry writer, clock, id
  generator, and payload-hash function in tests;
- no runtime contract registry, runtime live fetch, LLM-as-judge approval gate,
  or connector marketplace in v1;
- deterministic validation must run before any AI call;
- telemetry tests assert an exact allowlist of emitted fields.

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

| Decision            | Choice                                                                                                                                                                            | Rationale                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| AI provider         | Cloudflare Workers AI                                                                                                                                                             | On-stack, no paid external SaaS, aligns with existing Worker runtime.                               |
| Model behavior      | Adapter-only JSON Mode + strict local validation + abstention                                                                                                                     | Keeps the model behind one boundary and treats invalid output as failure, not success.              |
| Shared contracts    | Flat `packages/types/IntakeMapping.ts` export                                                                                                                                     | Matches current `packages/types` layout instead of inventing nested folders.                        |
| Delivery            | Reuse existing `DELIVERY_QUEUE.send(...)` message shape                                                                                                                           | Smallest diff that stays aligned with current queue/topic delivery rails.                           |
| Eval runner         | Root `pnpm ai:eval` -> `bun ./scripts/run-mapping-eval.ts`                                                                                                                        | Fits the repo's current script-running pattern for TS utilities.                                    |
| UX                  | Operator-in-the-loop                                                                                                                                                              | Mapping uncertainty is visible product value, not something to hide.                                |
| Canonical contracts | `packages/types/IntakeMapping.ts` plus versioned target-contract/eval docs under `data/payload-mapper/`                                                                           | Worker, client, eval runner, and docs need one shared contract/version model.                       |
| Retention/redaction | Persist attempts, drift category, approved mapping revisions, status, prompt/model metadata, validation errors, and redacted summaries; never write raw payload text to telemetry | Auditability is valuable only if it does not leak sensitive payload content.                        |
| Failure semantics   | Return abstention for ambiguity, validation failure for bad model output, and retryable runtime errors only for infrastructure failures                                           | Keeps AI uncertainty distinct from platform failure.                                                |
| Runtime data access | Public fixture serving uses a curated bundled Worker fixture module; larger datasets and optional live cache can use storage later                                                | Checked-in JSONL/schema files are not automatically available to deployed Workers.                  |
| Trace lifecycle     | Create one `mappingTraceId` per attempt and carry it through suggestion, approval, event metadata, delivery telemetry, and replay                                                 | Observability is the product; disconnected IDs make the demo unverifiable.                          |
| Raw payload TTL     | Pinned fixtures persist id/hash only; pasted JSON stores owner-scoped review payload with default 24h expiry and redacted long-term metadata                                      | Supports review without turning telemetry into a data leak.                                         |
| Normalized event    | Approved mappings emit `ingest.record.normalized` with `recordType` and `schemaVersion: "v1"`; the job-posting demo uses `recordType: "job_posting"`                              | Versioned envelopes make downstream delivery/replay explainable while keeping the platform generic. |
| LLM-as-judge        | Deferred from v1; later offline eval/admin-assist critique only; never production approval or ingest                                                                              | Keeps initial quality gates deterministic and credential-free.                                      |
| Deterministic deps  | AI runner, DB facade, queue publisher, telemetry writer, clock, id generator, and hash function are injectable in tests                                                           | Prevents route tests from depending on live services, clocks, UUIDs, or network behavior.           |

### Phase 1: Contracts, prompt, and AI boundary [Complexity: M]

#### [contracts] Task 1.1: Define intake suggestion and approval contracts

**Status:** todo

**Depends:** None

Define the minimum shared types for suggestion results, approval/rejection,
validation errors, trace metadata, approved mapping revisions, and
review-retention metadata. Keep the type surface small and generic; the
job-posting dataset is only the initial demo lens.
(Fx1, Fx2, Fx8, Fx9)

**Files:**

- Create: `packages/types/IntakeMapping.ts`
- Modify: `packages/types/index.ts`
- Modify: `apps/workers/package.json`
- Create: `apps/workers/src/intake/contracts.ts`
- Create: `apps/workers/src/tests/intakeContracts.test.ts`

**Steps (TDD):**

1. Write failing contract tests in
   `apps/workers/src/tests/intakeContracts.test.ts` for valid suggestions,
   abstention, ambiguous fields, hallucinated `sourcePath` values, and invalid
   approval targets (`queueId` xor `topicId`).
2. Run the RED step:
   `pnpm --filter @repo/workers test -- src/tests/intakeContracts.test.ts`.
3. Add `packages/types/IntakeMapping.ts`, export it from
   `packages/types/index.ts`, add the Worker package dependency on `@repo/types`, and implement worker-local validation helpers in
   `apps/workers/src/intake/contracts.ts`, including target-contract ids, approved-mapping-revision ids, drift categories, quarantine states, ingest states, and deterministic dependency contracts for `clock`, `idGenerator`, and `hashPayload`.
4. Re-run the focused test until GREEN, then run:
   `pnpm --filter @repo/workers check-types` and `pnpm check-types`.

**Acceptance:**

- [ ] Shared contracts represent pending review, approved, rejected, failed, abstained, ingesting, ingested, and ingest-failed states.
- [ ] `apps/workers/package.json` can consume `@repo/types` for the shared intake contract.
- [ ] Approval target is explicit and rejects both-or-neither `queueId` / `topicId` input.
- [ ] Contract metadata includes `intakeAttemptId`, `mappingTraceId`, `contractId`, `mappingVersionId`, drift category, model name, prompt version, source hash, raw-payload expiry, and validation errors.
- [ ] Contracts are lens-agnostic and contain no domain-specific target names.
- [ ] Tests can inject `clock`, `idGenerator`, and `hashPayload` instead of using ambient time, UUIDs, or runtime crypto directly.
- [ ] Tests prove nonexistent `sourcePath` values are rejected before publish.

---

#### [ai-boundary] Task 1.2: Add a Workers AI adapter with deterministic fallback

**Status:** todo

**Depends:** Task 1.1

Wrap Workers AI behind one adapter (`suggestMapping(input, deps)`) so tests and local demos stay deterministic, and bind AI only where the current repo actually expects runtime bindings. The adapter returns a closed union result; route code never handles raw model output.
(Fx1, Fx3, Fx9)

**Files:**

- Create: `apps/workers/src/intake/aiMappingAdapter.ts`
- Create: `apps/workers/src/tests/aiMappingAdapter.test.ts`
- Modify: `apps/workers/package.json`
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
   implement `apps/workers/src/intake/aiMappingAdapter.ts`. If using the Vercel
   AI SDK, add `ai` and `workers-ai-provider` only to `apps/workers` and keep
   all SDK imports inside the adapter.
4. Re-run the focused test until GREEN, then run:
   `pnpm --filter @repo/workers check-types` and
   `pnpm --filter @repo/workers lint`.

**Acceptance:**

- [ ] Production AI calls happen only in `apps/workers/src/intake/aiMappingAdapter.ts`.
- [ ] If the Vercel AI SDK is used, no file outside `aiMappingAdapter.ts` imports `ai` or `workers-ai-provider`.
- [ ] Adapter tests run with a fake runner only; no test reads runtime `env.AI` directly.
- [ ] Adapter returns a closed union for success, abstention, invalid-output, and runtime-failure states.
- [ ] Local/test fallback is explicit and visibly labelled, never silent fake AI.
- [ ] JSON Mode failures become safe API failures or abstentions.
- [ ] No test depends on live Cloudflare credentials.

---

#### [prompt] Task 1.3: Keep one prompt contract in sync with deterministic fixture checks

**Status:** todo

**Depends:** Task 1.1

Keep one prompt contract with the AI adapter and one deterministic fixture-based
contract check. Teach the model to abstain rather than invent fields. Do not add
LLM-as-judge artifacts in v1. (Fx1, Fx8, Fx9, Fx10)

**Files:**

- Modify: `apps/workers/src/intake/aiMappingAdapter.ts`
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
3. Keep the prompt version and prompt builder in `apps/workers/src/intake/aiMappingAdapter.ts` and update `docs/ai/payload-mapper.md` plus `data/payload-mapper/evals/eval-contract.json` if the prompt/response contract adds persisted fields such as prompt version.
4. Re-run the focused test until GREEN, then run:
   `pnpm --filter @repo/workers check-types`.

**Acceptance:**

- [ ] Prompt instructs the model not to map fields that are absent from the payload.
- [ ] Prompt output shape matches the checked-in eval contract.
- [ ] Prompt version is carried forward in suggestion records and API responses.
- [ ] Core prompt tests use generic payload shapes; downstream demo tests cover at least three example-lens vendor payload shapes already present in-repo.
- [ ] No LLM-as-judge task is required for the v1 quality gate.

---

### Phase 2: Worker API, approval, and telemetry [Complexity: M]

#### [api] Task 2.1: Add the protected mapping-suggestion endpoint

**Status:** todo

**Depends:** Task 1.1, Task 1.2, Task 1.3

Add the first authenticated intake endpoint for generating mapping suggestions
from supplied payloads, target contract identifiers, and current approved mapping revisions. Keep route wiring and DB
changes explicit. (Fx1, Fx4, Fx8, Fx9)

**Files:**

- Create: `apps/workers/src/routes/intake.ts`
- Create: `apps/workers/src/intake/validateIntakeRequest.ts`
- Create: `apps/workers/src/tests/intake.test.ts`
- Create: `apps/workers/src/tests/validateIntakeRequest.test.ts`
- Modify: `apps/workers/src/db/schema.ts`
- Create: `apps/workers/src/db/migrations/0002_add_intake_attempts.sql`
- Modify: `apps/workers/src/index.ts`

**Steps (TDD):**

1. Write failing endpoint tests in `apps/workers/src/tests/intake.test.ts` for
   unauthenticated access, rate-limited access, invalid payload,
   too-large/too-deep payload rejection before AI, invalid contract id, pasted-payload vs fixture-reference rules, valid generic fixture suggestion, abstention, and validation failure.
2. Run the RED step:
   `pnpm --filter @repo/workers test -- src/tests/intake.test.ts`.
3. Add storage shape in `apps/workers/src/db/schema.ts` plus a matching SQL migration, implement pure pre-route validation in `apps/workers/src/intake/validateIntakeRequest.ts`, implement `apps/workers/src/routes/intake.ts`, and register it in `apps/workers/src/index.ts`. Persist `intakeAttemptId`, `mappingTraceId`, `contractId`, `mappingVersionId`, drift category, review-payload expiry, redacted summary, source hash, prompt/model metadata, and validation results.
4. Re-run the focused test until GREEN, then run:
   `pnpm --filter @repo/workers test`,
   `pnpm --filter @repo/workers check-types`, and
   `pnpm --filter @repo/workers lint`.

**Acceptance:**

- [ ] `/api/intake/mapping-suggestions` is authenticated and rate-limited.
- [ ] Invalid, oversized, too-deep, or unknown-contract payloads fail before any AI call is attempted.
- [ ] Suggestion attempts persist owner scope, contract id, approved mapping revision id, drift category, `mappingTraceId`, prompt version, model name, status, confidence, source hash, review payload expiry, redacted summary, and validation errors.
- [ ] `apps/workers/src/index.ts` is the only route-registration touchpoint for the new endpoint.
- [ ] Expired pasted payloads cannot be approved; pinned fixtures approve by fixture id/hash without raw DB payload persistence.

---

#### [approval] Task 2.2: Approve or reject a suggestion and ingest once deterministically

**Status:** todo

**Depends:** Task 2.1

Allow admins to approve or reject a suggestion. Approval stores the approved mapping revision and performs the first deterministic ingest. Defer manual replay to a later blueprint unless a concrete operator use case appears. (Fx2, Fx5, Fx9)

**Files:**

- Modify: `packages/types/IntakeMapping.ts`
- Modify: `apps/workers/src/db/schema.ts`
- Modify: `apps/workers/src/routes/intake.ts`
- Modify: `apps/workers/src/tests/intake.test.ts`
- Create: `apps/workers/src/intake/normalizeWithMapping.ts`
- Create: `apps/workers/src/intake/normalizedEnvelope.ts`
- Create: `apps/workers/src/tests/normalizeWithMapping.test.ts`

**Steps (TDD):**

1. Extend `apps/workers/src/tests/intake.test.ts` and add
   `apps/workers/src/tests/normalizeWithMapping.test.ts` with failing tests for
   admin approval, admin rejection, non-owner rejection, repeated approval idempotency,
   invalid/missing delivery target, generic normalized-envelope output, ingest status, and downstream publish failure.
2. Run the RED step:
   `pnpm --filter @repo/workers test -- src/tests/intake.test.ts src/tests/normalizeWithMapping.test.ts`.
3. Implement approval/reject behavior in `apps/workers/src/routes/intake.ts`,
   add pure mapping application in `apps/workers/src/intake/normalizeWithMapping.ts`, generic envelope creation in `apps/workers/src/intake/normalizedEnvelope.ts`, and extend schema/contracts only as needed for approval, delivery status, `mappingTraceId`, and `ingest.record.normalized` event metadata.
4. Re-run the focused tests until GREEN, then run:
   `pnpm --filter @repo/workers test`,
   `pnpm --filter @repo/workers check-types`, and
   `pnpm --filter @repo/workers lint`.

**Acceptance:**

- [ ] No normalized event is ingested before admin approval.
- [ ] Approval and rejection are idempotent and owner-scoped.
- [ ] Publish uses the existing `DELIVERY_QUEUE.send({ messageId, seq, queueId, pushEndpoint, topicId, attempt })` shape.
- [ ] Normalized events include generic envelope fields: `eventType: "ingest.record.normalized"`, `recordType`, `schemaVersion: "v1"`, `contractId`, `mappingVersionId`, `intakeAttemptId`, `mappingTraceId`, source provenance, and payload hash.
- [ ] Core replay code does not import job-posting-specific normalization; example-lens shaping lives in `public-dataset-demo-ingestion`.
- [ ] Publish failures do not mark suggestions as ingested.
- [ ] Approve performs deterministic replay+ingest exactly once; any future manual replay path must never call AI.

---

#### [telemetry] Task 2.3: Record intake counters and trace ids without payload text

**Status:** todo

**Depends:** Task 2.2

Expose only the counters and trace links needed to prove the flow works without
storing or emitting raw payload content. Keep telemetry centralized and
payload-free. (Fx6, Fx8, Fx9)

**Files:**

- Modify: `apps/workers/src/telemetry.ts`
- Modify: `apps/workers/src/routes/dashboard.ts`
- Modify: `apps/workers/src/routes/intake.ts`
- Create: `apps/workers/src/tests/mappingTelemetry.test.ts`

**Steps (TDD):**

1. Write failing telemetry tests in
   `apps/workers/src/tests/mappingTelemetry.test.ts` for exact telemetry-field allowlist enforcement, payload redaction, `mappingTraceId` propagation, suggestion-status aggregation, and approval/ingest/publish counters.
2. Run the RED step:
   `pnpm --filter @repo/workers test -- src/tests/mappingTelemetry.test.ts`.
3. Extend `apps/workers/src/telemetry.ts`, `apps/workers/src/routes/intake.ts`,
   and `apps/workers/src/routes/dashboard.ts` with redacted allowlisted metrics only.
4. Re-run the focused test until GREEN, then run:
   `pnpm --filter @repo/workers test`,
   `pnpm --filter @repo/workers lint`, and
   `pnpm --filter @repo/workers check-types`.

**Acceptance:**

- [ ] Telemetry never includes raw candidate, employee, job-description, or pasted payload text.
- [ ] Dashboard can show suggestion success, abstention, validation-failure, approval, rejection, ingest, publish counts, and trace drilldown by `mappingTraceId`.
- [ ] Redaction is enforced by tests, not comments alone.
- [ ] Tests assert the exact permitted telemetry field names for every mapping lifecycle event.

---

### Phase 3: Client intake UI and measurable quality gate [Complexity: M]

#### [client] Task 3.1: Build a minimal intake page and admin review page

**Status:** todo

**Depends:** Task 2.2

Add one operator page and one admin review page using existing client routing,
nav, and API patterns. Avoid any new client architecture layer. (Fx2, Fx7)

**Files:**

- Create: `apps/client/src/pages/Intake.tsx`
- Create: `apps/client/src/pages/AdminIntake.tsx`
- Create: `apps/client/src/pages/Intake.test.tsx`
- Create: `apps/client/src/pages/AdminIntake.test.tsx`
- Create: `apps/client/src/components/MappingSuggestionReview.tsx`
- Modify: `apps/client/src/services/api.ts`
- Modify: `apps/client/src/App.tsx`
- Modify: `apps/client/src/components/Sidebar.tsx`

**Steps (TDD):**

1. Write failing client tests in `apps/client/src/pages/Intake.test.tsx` for
   fixture load, invalid JSON, escaped/sanitized payload preview, suggestion rendering, pending admin queue, reject action, approve action, ambiguous-field display, and ingest-status rendering. Delivery-dashboard richness is deferred.
2. Run the RED step:
   `pnpm --filter client test -- src/pages/Intake.test.tsx`.
3. Implement the intake page, admin approval page, review component, API methods, route registration (`/intake` and `/admin/intake`), and sidebar navigation using the existing client patterns.
4. Re-run the focused test until GREEN, then run:
   `pnpm --filter client test`,
   `pnpm --filter client check-types`, and
   `pnpm --filter client lint`.

**Acceptance:**

- [ ] Users can paste JSON or load a fixture and receive a validated mapping suggestion.
- [ ] Payload preview renders escaped/sanitized text and never injects source HTML.
- [ ] Missing and ambiguous fields are visually distinct from confident mappings.
- [ ] Admin approval is explicit and shows ingest status; detailed delivery dashboard drilldown is deferred.
- [ ] Admin can reject with a reason; manual replay is deferred from v1.
- [ ] The UI change stays inside the listed files; no new client architecture layer is introduced.

---

#### [eval] Task 3.2: Add deterministic fixture checks for mapping quality

**Status:** todo

**Depends:** Task 1.1, Task 1.2, Task 1.3

Measure mapping quality with deterministic fixture checks first. Use a testable helper plus a thin root CLI script so the plan remains TDD-compliant and credential-free. Add a rubric shape that an optional advisory judge can use later, but keep the required gate deterministic. (Fx8, Fx9, Fx10)

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
- [ ] The eval runner uses no network, no credentials, and no live AI by default.
- [ ] LLM-as-judge output is not part of the v1 quality gate.
- [ ] Any judge rubric is advisory and can run with a fake judge runner in tests.
- [ ] Non-hallucination remains a hard gate in the runner output.
- [ ] Eval docs explain deterministic vs live modes using the checked-in dataset.

---

---

#### [judge] Optional Task 3.3: Add advisory LLM critique for admin review

**Status:** optional

**Depends:** Task 2.1, Task 3.2

Add LLM-as-judge only as an admin-assist reviewer after deterministic
validation exists. The judge reads the source payload summary, target contract,
validated suggestion, deterministic validation results, and rubric. It returns
critique, risk flags, and questions for the human admin. It never approves,
rejects, replays, ingests, or blocks deterministic gates.

**Files:**

- Modify: `apps/workers/src/intake/aiMappingAdapter.ts`
- Modify: `apps/workers/src/tests/aiMappingAdapter.test.ts`
- Modify: `apps/client/src/components/MappingSuggestionReview.tsx`
- Modify: `docs/ai/payload-mapper.md`

**Steps (TDD):**

1. Add failing adapter tests for judge success, judge abstention, malformed judge
   output, and deterministic fake judge mode.
2. Run `pnpm --filter @repo/workers test -- src/tests/aiMappingAdapter.test.ts`
   — verify FAIL.
3. Add a `critiqueSuggestion(input, deps)` method behind the existing AI adapter
   boundary and render the critique as advisory copy in the review component.
4. Re-run focused tests, then `pnpm --filter @repo/workers test`,
   `pnpm --filter client test`, and `pnpm check-types`.

**Acceptance:**

- [ ] Judge critique is visually labelled advisory in the admin UI.
- [ ] Judge output cannot change suggestion status, approval state, replay state,
      ingest state, or deterministic eval score.
- [ ] Tests use a fake judge runner only; no test depends on live AI.
- [ ] Invalid judge output fails closed and hides critique rather than blocking
      approval.

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
| Upstream   | `ai-oss-tooling-adapter`        | Supplies the approved OSS dependency boundary, schema validators, and source-path helper.  |
| Downstream | `public-dataset-demo-ingestion` | Can add live public dataset ingestion polish after the deterministic intake mapper exists. |

## Edge Cases and Error Handling

| Edge Case                                                                    | Risk                               | Solution                                                                                             | Task          |
| ---------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------- |
| Workers AI returns invalid JSON or `JSON Mode couldn't be met`               | API crash or unsafe mapping        | Catch in the adapter, persist failure details, and abstain/fail closed                               | 1.2, 2.1      |
| Suggested `sourcePath` does not exist in the payload                         | Silent data corruption             | Validate every suggested path before persistence or approval                                         | 1.1, 2.1      |
| Approval request sends both `queueId` and `topicId`, or neither              | Ambiguous delivery target          | Enforce an xor contract in shared types + route validation                                           | 1.1, 2.2      |
| Downstream queue/topic target does not exist or is not owned by the approver | Cross-tenant publish risk          | Re-check ownership at approval time before any publish call                                          | 2.2           |
| Approval is repeated                                                         | Duplicate normalized events        | Store approval state/idempotency and short-circuit repeats                                           | 2.2           |
| Payload contains PII                                                         | Telemetry/log leakage              | Redact telemetry and never emit raw payload text                                                     | 2.3           |
| Local dev lacks an AI binding                                                | Blocked demos/tests                | Use explicit deterministic fallback path                                                             | 1.2           |
| Nested arrays or optional fields create ambiguous mappings                   | Overconfident suggestions          | Preserve ambiguity/missing-field outputs instead of forcing exact mappings                           | 1.1, 1.3      |
| Payload is too large or deeply nested for safe Worker processing             | Latency or memory spikes           | Reject early before prompt construction or AI invocation                                             | 2.1           |
| Trace id is missing from publish or replay path                              | Unverifiable demo lifecycle        | Require `mappingTraceId` in API response, DB row, normalized event, delivery metadata, and telemetry | 2.1, 2.2, 2.3 |
| Pasted review payload expires before approval                                | Confusing operator failure         | Return explicit expired-attempt state; allow rerun from original input, not publish stale data       | 2.1, 2.2      |
| LLM judge approves or blocks production ingest                               | Unsafe automation                  | Keep LLM judge output offline/advisory; only deterministic validation plus admin action can ingest   | 3.2           |
| Admin approves the wrong target queue/topic                                  | Cross-tenant or wrong-route ingest | Re-check target ownership and show target details in approval panel before replay+ingest             | 2.2, 3.1      |

## Non-goals

- No autonomous production transforms.
- No paid external LLM provider.
- No connector marketplace.
- No RAG / AI Search assistant in this first AI slice.
- No scraping of private source data.
- No refactor of the existing queue/topic publisher architecture beyond reuse.

## Risks

| Risk                                                                                 | Impact | Mitigation                                                                                 |
| ------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------ |
| Workers AI latency is inconsistent                                                   | Medium | Keep async UX, persist attempt status, and surface telemetry rather than blocking silently |
| JSON Mode cannot satisfy the schema for some payloads                                | High   | Fail closed, abstain, and score the behavior in `pnpm ai:eval`                             |
| Shared contracts/approved-mapping-revision semantics drift between client and worker | Medium | Centralize them in `packages/types/IntakeMapping.ts` and gate with `pnpm check-types`      |
| Approval flow becomes a multi-target publish surface by accident                     | Medium | Keep xor target semantics and reuse the current queue-send shape only                      |
| Deterministic eval diverges from live AI behavior over time                          | Medium | Keep live eval opt-in and documented; do not let it break CI determinism                   |

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
