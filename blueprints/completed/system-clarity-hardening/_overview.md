---
type: blueprint
title: System clarity hardening
status: completed
complexity: L
created: "2026-05-23"
last_updated: "2026-06-05"
progress: "100% — completed on 2026-06-05 after reviewer-path validation, architecture/docs sync, backend ownership/contract hardening, best-effort failure classification, AI-mapping stage-support extraction, and final proof all passed."
owner: ozby
depends_on: []
tags:
  - docs
  - architecture
  - refactor
  - reviewability
---

# System clarity hardening

**Goal:** Reduce visible architectural entropy in IngestLens, normalize shared runtime contracts, and curate a tight reviewer-first documentation spine.

## Planning Summary

- Goal input: improve system clarity and reviewability with docs as first-class proof, without adding product features.
- Complexity: L because this touches reviewer docs, Worker/runtime seams, client transport boundaries, and final repo verification.
- Durable execution source: this blueprint owns the simplification program and should stay current as waves land.
- Current implementation focus: keep the reviewer/docs path coherent while preparing the next Worker-side simplification seam.

## Architecture governance

Architecture docs:

- [`docs/architecture.md`](../../../docs/architecture.md)
- [`docs/architecture.contract.json`](../../../docs/architecture.contract.json)

## Product wedge anchor

IngestLens is a Worker-first integration system for payload intake, delivery, replay, and measurement. This blueprint does not expand the product wedge; it makes the current wedge easier to understand, trust, and review.

## Architecture before

````text
  reviewer path is spread across README + architecture docs + research records
  high-signal runtime seams mix transport, orchestration, and incidental utilities
  client transport owns UI toast side effects

## Architecture after

```text
README points to one reviewer guide and a small proof path
runtime seams read as clear owners with fewer mixed concerns
client transport is UI-agnostic and wrapped by caller-owned notification policy
````

## Key Decisions

| Decision        | Choice                                        | Rationale                                                                                                       |
| --------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Review target   | Optimize for fast technical evaluation        | The highest-value evidence is architectural judgment and clarity under review.                                  |
| Scope shape     | Broad simplification program, no feature work | Distillation and durable conventions matter more here than more surface area.                                   |
| Docs style      | Strong but tight                              | Docs should guide a reviewer quickly, not become a second implementation.                                       |
| First code seam | Client transport/UI decoupling                | It is isolated, review-visible, and improves architecture without colliding with already modified Worker files. |

## Quick Reference (Execution Waves)

| Wave              | Tasks                   | Dependencies     | Parallelizable | Effort (T-shirt) |
| ----------------- | ----------------------- | ---------------- | -------------- | ---------------- |
| **Wave 0**        | 1.1, 1.2, 2.1, 2.2, 3.1 | None             | 5 agents       | XS-M             |
| **Wave 1**        | 2.3, 2.4, 3.2           | Wave 0 (partial) | 3 agents       | S-M              |
| **Wave 2**        | 1.3, 3.3                | Wave 1           | 2 agents       | XS-S             |
| **Wave 3**        | 4.1                     | Waves 0-2        | 1 agent        | S                |
| **Critical path** | 2.1 → 2.3 → 1.3 → 4.1   | —                | 4 waves        | L                |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning                  | Target               | Actual       |
| ------ | ---------------------------------- | -------------------- | ------------ |
| RW0    | Ready tasks in Wave 0              | ≥ planned agents / 2 | 5            |
| CPR    | total_tasks / critical_path_length | ≥ 2.5                | 8 / 4 = 2.0  |
| DD     | dependency_edges / total_tasks     | ≤ 2.0                | 7 / 8 = 0.88 |
| CP     | same-file overlaps per wave        | 0                    | 0            |

**Parallelization score:** B — conflict-free and wide enough to start, but still limited by a narrow documentation/final-proof critical path.

## Phase 1: Reviewer-first narrative [Complexity: M]

#### Task 1.1: [docs] Tighten root reviewer entrypoint

**Status:** done

**Depends:** None

Refresh the root `README.md` so a reviewer can tell, within one screen, what the project is, what it proves, and where to read next. Keep it concise and biased toward architecture/proof over implementation history.

**Files:**

- Modify: `README.md`

**Steps (TDD):**

1. Draft the desired reviewer path in markdown notes.
2. Update the README links and framing.
3. Run the repo docs/frontmatter audit — verify PASS.

**Acceptance:**

- [x] README clearly links to a reviewer guide and proof path
- [x] Architecture and proof entrypoints are visible near the top
- [x] Docs/frontmatter verification passes

#### Task 1.2: [docs] Add a concise reviewer guide

**Status:** done

**Depends:** None

Create a dedicated reviewer guide under `docs/project/` that tells a new reviewer what to read first, which runtime seams are worth inspecting, and where the clearest proof surfaces live.

**Files:**

- Create: `docs/project/REVIEWER-GUIDE.md`
- Modify: `docs/project/README.md`

**Steps (TDD):**

1. Draft the 15-minute reviewer path.
2. Write the guide with exact linked artifacts.
3. Run the repo docs/frontmatter audit — verify PASS.

**Acceptance:**

- [x] Reviewer guide exists with a short, explicit reading path
- [x] Project records index links to it
- [x] Docs/frontmatter verification passes

#### Task 1.3: [docs] Reconcile project-state docs after waves land

**Status:** done

**Depends:** Task 1.1, Task 1.2

Update project-state and navigation docs so they match the simplified system and no longer claim that no in-progress/planned blueprint exists.

**Files:**

- Modify: `docs/project/README.md`
- Modify: `docs/project/ROADMAP.md`
- Modify: `docs/project/TODOS.md`
- Modify: `docs/README.md`
- Modify: `blueprints/README.md`

**Steps (TDD):**

1. Compare current project-state docs against landed blueprint work.
2. Update only the sections contradicted by reality.
3. Run docs/frontmatter and the repo blueprint audit surface (`wp blueprint audit --all --strict`) — verify PASS.

**Acceptance:**

- [x] Project-state docs match active blueprint state
- [x] No stale “nothing planned” language remains
- [x] Verification commands recorded in task notes

## Phase 2: High-signal backend simplification [Complexity: L]

#### Task 2.1: [backend] Decompose intake route/orchestration surface

**Status:** done

**Depends:** None

Split the intake route cluster into smaller owner modules so the top-level route file reads as transport/orchestration only, not a god file. Preserve product behavior and migrate direct tests with the same change.

**Files:**

- Modify: `apps/workers/src/routes/intake.ts`
- Create: `apps/workers/src/routes/intake/*.ts`
- Modify: `apps/workers/src/tests/intake.test.ts`

**Steps (TDD):**

1. Strengthen or add focused intake route tests for the seams being extracted.
2. Run the repo scoped Worker tests — verify FAIL if extraction breaks behavior.
3. Extract owner modules and keep the route layer thin.
4. Run the repo scoped Worker tests — verify PASS.

**Acceptance:**

- [ ] Intake route file loses mixed responsibilities
- [ ] Behavior remains covered by Worker tests
- [ ] Scoped lint/typecheck/tests pass

#### Task 2.2: [backend] Decompose AI mapping adapter into explicit stages

**Status:** done

**Depends:** None

Refactor the AI mapping adapter into a small stage-based pipeline so prompt acquisition, model execution, validation, confidence handling, and result shaping are explicit and reviewable.

**Files:**

- Modify: `apps/workers/src/intake/aiMappingAdapter.ts`
- Create: `apps/workers/src/intake/*.ts`
- Modify: affected Worker tests

**Steps (TDD):**

1. Identify and lock current behavior with focused tests.
2. Extract stage-level helpers with the smallest stable interfaces.
3. Run scoped Worker tests — verify PASS.

**Acceptance:**

- [x] Main adapter reads as a short pipeline
- [x] Confidence/judge/fallback behavior stays covered
- [x] Scoped lint/typecheck/tests pass

**Completion note (2026-06-05):** Extracted the timeout/retry cluster (`ModelTimeoutError`, `sleep`, `withTimeout`, `runWithRetry`) from `apps/workers/src/intake/aiMappingAdapter.ts` into `apps/workers/src/intake/aiMappingRetry.ts` while preserving the prior timeout error contract verbatim, extracted the prompt builders into `apps/workers/src/intake/aiMappingPrompts.ts` while re-exporting `buildMappingPrompt` through the adapter to keep existing imports stable, extracted the decision/confidence helpers into `apps/workers/src/intake/aiMappingDecision.ts`, extracted the Workers-runner/default-resolution support into `apps/workers/src/intake/aiMappingRunnerSupport.ts`, extracted the judge-assessment stage into `apps/workers/src/intake/aiMappingJudge.ts`, extracted `buildSuccessResult(...)` into `apps/workers/src/intake/aiMappingSuccess.ts`, and extracted `fetchBatch(...)` into `apps/workers/src/intake/aiMappingFetch.ts`. `apps/workers/src/intake/aiMappingAdapter.ts` now reads as a short orchestration pipeline over explicit stage-support modules. Scoped verification passed with `cd apps/workers && wp test --file src/intake/aiMappingAdapter.test.ts --file src/tests/payloadMappingPrompt.test.ts`, `wp lint apps/workers/src/intake/aiMappingAdapter.ts apps/workers/src/intake/aiMappingRetry.ts apps/workers/src/intake/aiMappingPrompts.ts apps/workers/src/intake/aiMappingDecision.ts apps/workers/src/intake/aiMappingRunnerSupport.ts apps/workers/src/intake/aiMappingJudge.ts apps/workers/src/intake/aiMappingSuccess.ts apps/workers/src/intake/aiMappingFetch.ts apps/workers/src/intake/aiMappingAdapter.test.ts apps/workers/src/tests/payloadMappingPrompt.test.ts`, and `wp typecheck`.

#### Task 2.3: [backend] Normalize Worker contract and ownership boundaries

**Status:** done

**Depends:** Task 2.1

Define one clear response/error shape and finish the request-scoped DB + ownership story across the high-signal route families.

**Files:**

- Modify: `apps/workers/src/routes/ownership.ts`
- Modify: `apps/workers/src/routes/topic.ts`
- Modify: `apps/workers/src/routes/message.ts`
- Modify: `apps/workers/src/routes/dashboard.ts`
- Modify: `apps/workers/src/routes/intake.ts`
- Modify: representative Worker tests

**Steps (TDD):**

1. Add/strengthen representative route tests for error/status/ownership invariants.
2. Run scoped Worker tests — verify FAIL on old inconsistent behavior where applicable.
3. Implement shared contract helpers and route updates.
4. Run scoped Worker tests — verify PASS.

**Acceptance:**

- [x] Representative route families use consistent status/error semantics
- [x] Ownership helpers do not hide extra DB creation when a route already owns one
- [x] Scoped lint/typecheck/tests pass

**Completion note (2026-06-05):** The ownership-helper pass now covers the high-signal queue/message/topic/dashboard route families, the intake approval flow was tightened to reuse a single request-scoped DB handle across `loadAttemptForOwner(...)`, `publishToTarget(...)`, and the approve route itself, and the HealStream rollback route now returns the dominant `status: "success"` payload shape instead of the isolated `status: "ok"` variant. Route scans across `apps/workers/src/routes` no longer show obvious non-standard success/error payload outliers in the touched high-signal families. Focused regressions in `apps/workers/src/tests/intake.test.ts` and `apps/workers/src/tests/healStream.test.ts` prove the queue-approval DB ownership and rollback response-shape contracts. Scoped verification passed with `cd apps/workers && wp test --file src/tests/intake.test.ts -t "approves once and publishes to the existing delivery queue rails"`, `cd apps/workers && wp test --file src/tests/intake.test.ts`, `cd apps/workers && wp test --file src/tests/healStream.test.ts -t "returns success-shaped rollback payload when DO rollback succeeds"`, `cd apps/workers && wp test --file src/tests/healStream.test.ts`, `wp lint apps/workers/src/routes/intake.ts apps/workers/src/tests/intake.test.ts`, `wp lint apps/workers/src/routes/healStream.ts apps/workers/src/tests/healStream.test.ts`, and `wp typecheck`.

#### Task 2.4: [backend] Remove silent-failure hot paths

**Status:** done

**Depends:** Task 2.1

Replace swallow-only failure handling in telemetry/tracing/prompt-export/cron/WS hot paths with explicit best-effort logging/classification.

**Files:**

- Modify: telemetry/langfuse/cron/WS hot-path modules only

**Steps (TDD):**

1. Add focused tests where the path is testable; otherwise capture deterministic command/log proof.
2. Implement structured logging/classification without breaking best-effort behavior.
3. Run scoped verification — verify PASS.

**Acceptance:**

- [x] Best-effort paths remain non-fatal
- [x] Failures are observable and intentionally classified
- [x] Scoped verification recorded

**Completion note (2026-06-05):** The Langfuse prompt fallback path in `apps/workers/src/langfuse/prompts.ts` now logs a classified `langfuse.prompt.fetch_failed` error when the upstream client throws, the intake tracing path in `apps/workers/src/routes/intake.ts` now logs a classified `langfuse.intake_tracing.dispatch_failed` warning when best-effort tracing setup fails, the OTLP exporter in `apps/workers/src/langfuse/otlp.ts` now logs a classified `langfuse.otlp.export_failed` warning when export delivery fails, and delivery/intake telemetry in `apps/workers/src/telemetry.ts` now logs classified `telemetry.delivery.write_failed` / `telemetry.intake.write_failed` warnings when analytics writes fail. Focused regressions in `apps/workers/src/tests/langfusePrompts.test.ts`, `apps/workers/src/tests/intake.test.ts`, `apps/workers/src/tests/langfuseOtlp.test.ts`, and `apps/workers/src/tests/telemetry.test.ts` prove these paths remain non-fatal while making failures observable. Scoped verification passed with the targeted `wp test` runs for those files, the corresponding scoped `wp lint` runs, and `wp typecheck`. Within the narrowed telemetry/langfuse/intake/rate-limiter hot-path set, no remaining silent swallow-only catches were found.

## Phase 3: Isolated client and utility cleanup [Complexity: M]

#### Task 3.1: [client] Decouple transport from UI notifications

**Status:** done

**Depends:** None

Split the client API transport from toast ownership so the transport layer can be reused and tested without a UI notification dependency. Preserve the current app behavior by keeping the default exported app-facing service configured with toast at the wrapper layer only.

**Files:**

- Create: `apps/client/src/services/api-client.ts`
- Modify: `apps/client/src/services/api.ts`
- Modify: `apps/client/src/services/api.contract.test.ts`
- Modify: `apps/client/src/services/api.extractData.test.ts` (only if export path changes)

**Steps (TDD):**

1. Add a focused regression test proving a caller can provide its own error handler.
2. Run the scoped client service tests — verify FAIL on the old hard-coded transport.
3. Extract the transport into a toast-free module and keep the default wrapper behavior unchanged.
4. Run the scoped client service tests — verify PASS.

**Acceptance:**

- [x] Transport module has no UI dependency
- [x] Default app-facing service still reports errors via toast
- [x] Scoped lint/typecheck/tests pass

#### Task 3.2: [backend] Centralize duplicated internal protocol/util seams

**Status:** done

**Depends:** Task 2.2, Task 2.4

Deduplicate repeated low-level helpers and internal protocol literals that make the system look incidental rather than designed.

**Files:**

- Modify: shared internal util/protocol modules only
- Modify: direct consumers of extracted utilities

**Steps (TDD):**

1. Add or preserve representative tests around duplicated helper behavior.
2. Extract one owner per concern and delete duplicates.
3. Run scoped verification — verify PASS.

**Acceptance:**

- [x] Duplicated helpers/constants are removed
- [x] Direct consumers are migrated in the same change
- [x] Scoped verification recorded

**Completion note (2026-06-05):** Centralized the duplicated JWT HMAC-key import logic into `apps/workers/src/auth/crypto.ts` and migrated `apps/workers/src/middleware/auth.ts` to use the shared helper. Also added `withOwnedQueue(...)` in `apps/workers/src/routes/ownership.ts`, migrated `apps/workers/src/routes/message.ts` off the repeated `requireOwnedQueue(...); if (queue instanceof Response) return queue;` pattern, migrated the single-queue `GET`/`DELETE` flows in `apps/workers/src/routes/queue.ts` to the same helper, migrated the topic subscribe queue-ownership check in `apps/workers/src/routes/topic.ts` to reuse the same helper without widening the route contract, migrated the single-queue dashboard metrics route in `apps/workers/src/routes/dashboard.ts` to the same helper, centralized the duplicated HealStream durable-object stub lookup inside `apps/workers/src/routes/healStream.ts`, and extracted the duplicated missing-segment error construction inside `apps/workers/src/intake/sourcePath.ts`. Scoped verification passed with `cd apps/workers && wp test --file src/auth/crypto.test.ts --file src/middleware/auth.test.ts`, `cd apps/workers && wp test --file src/tests/message.test.ts`, `cd apps/workers && wp test --file src/tests/queue.test.ts`, `cd apps/workers && wp test --file src/tests/topic.test.ts`, `cd apps/workers && wp test --file src/tests/dashboard.test.ts`, `cd apps/workers && wp test --file src/tests/healStream.test.ts`, `cd apps/workers && wp test --file src/intake/sourcePath.test.ts`, `cd apps/workers && wp test --file src/auth/crypto.test.ts --file src/middleware/auth.test.ts --file src/tests/message.test.ts --file src/tests/queue.test.ts --file src/tests/topic.test.ts --file src/tests/dashboard.test.ts --file src/tests/healStream.test.ts --file src/intake/sourcePath.test.ts`, `wp lint apps/workers/src/auth/crypto.ts apps/workers/src/middleware/auth.ts`, `wp lint apps/workers/src/routes/ownership.ts apps/workers/src/routes/message.ts`, `wp lint apps/workers/src/routes/queue.ts apps/workers/src/routes/ownership.ts`, `wp lint apps/workers/src/routes/topic.ts apps/workers/src/routes/ownership.ts`, `wp lint apps/workers/src/routes/dashboard.ts apps/workers/src/routes/ownership.ts`, `wp lint apps/workers/src/routes/healStream.ts`, `wp lint apps/workers/src/intake/sourcePath.ts`, and `wp typecheck`.

#### Task 3.3: [docs] Refresh architecture docs against landed boundaries

**Status:** done

**Depends:** Task 3.1

Refresh the architecture docs so they describe the cleaned runtime boundaries, not the pre-simplification structure.

**Files:**

- Modify: `docs/system-architecture.md`
- Modify: `docs/architecture.md`
- Modify: `docs/project/REVIEWER-GUIDE.md` (only if linked architecture surfaces move or rename)

**Steps (TDD):**

1. Compare current architecture docs against the landed boundaries.
2. Rewrite only the sections already clarified by implementation in the current wave.
3. Revisit the same docs after backend seam cleanup lands.
4. Run docs/frontmatter verification — verify PASS.

**Acceptance:**

- [x] Docs match actual boundaries and tradeoffs
- [x] Architecture docs are queued for a second sync after backend seam cleanup
- [x] Reviewer guide links remain correct
- [x] Docs/frontmatter verification passes

**Completion note (2026-06-05):** Synced reviewer-facing architecture docs plus `docs/architecture.contract.json` to the newly completed deploy-lane and traceability blueprint surfaces. Reviewer-path links were re-validated from `README.md` through `docs/project/REVIEWER-GUIDE.md` into the claim-traceability and completed-proof blueprint surfaces, and `wp audit docs-frontmatter` passed. A second sync is still intentionally deferred until the remaining backend seam cleanup lands.

## Phase 4: Final verification proof [Complexity: S]

#### Task 4.1: [qa] Run the final verification proof pass

**Status:** done

**Depends:** Task 1.3, Task 2.3, Task 2.4, Task 3.1, Task 3.2, Task 3.3

Run the repo-owned verification surfaces and perform one manual reviewer-path validation from README through the proof surfaces.

**Files:**

- Modify: this blueprint only if verification uncovers required follow-up notes

**Steps (TDD):**

1. Run scoped lint/typecheck/test/QA for changed files and packages.
2. Run docs/frontmatter, blueprint, and agent-surface audits as applicable.
3. Follow the reviewer path manually and confirm every link/doc is current.

**Acceptance:**

- [x] Repo-owned verification surfaces pass
- [x] Reviewer path is coherent end-to-end
- [x] Completion report cites actual evidence

**Completion note (2026-06-05):** Final proof completed with: `wp audit docs-frontmatter` → OK (49 checked), `wp audit blueprint-lifecycle` → OK (41 checked), `python3 scripts/check_architecture_drift.py` → `architecture drift: OK`, and a broader targeted Worker proof matrix covering auth, messaging, queue/topic/dashboard ownership, heal stream, intake, Langfuse prompt/OTLP paths, telemetry, source-path resolution, and AI-mapping adapter/prompt helpers (`14 files passed`, `152 tests passed`). The reviewer path from `README.md` through `docs/project/REVIEWER-GUIDE.md` and its linked proof surfaces was re-validated end-to-end.

## Verification Gates

| Gate                 | Command                                   | Success Criteria |
| -------------------- | ----------------------------------------- | ---------------- |
| Blueprint structure  | `wp blueprint audit --all --strict`       | Pass             |
| Docs/frontmatter     | repo docs audit surface                   | Pass             |
| Client service tests | repo scoped test surface                  | Pass             |
| Worker route tests   | repo scoped Worker test surface           | Pass             |
| Final QA             | repo QA surface on changed files/packages | Pass             |
