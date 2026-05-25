---
type: research
last_updated: "2026-05-23"
owner: worker-2
---

# Reviewer-facing verification audit

## Scope

Audit the reviewer-facing surfaces, existing unit/integration/E2E coverage, and the doc trail from shipped claims to executable proof.

## Executive summary

- The canonical reviewer entrypoints are `README.md` and `docs/project/REVIEWER-GUIDE.md`.
- The strongest existing executable proof for the intake review story is API-level E2E in `apps/e2e/journeys/intake-mapping-flow.e2e.ts` plus browser smoke in `apps/e2e/journeys/intake-heal-ui.spec.ts`.
- The admin review UI (`apps/client/src/pages/AdminIntake.tsx`) has unit coverage, but the browser E2E proof is only a smoke path and does not prove reviewer-critical behaviors like sanitized preview rendering, explicit suggestion selection, rejection path, or trace/proof correlation.
- Current docs describe proof surfaces, but they do **not** consistently link each reviewer-facing claim to at least one executable E2E command/file.

## Lane 1 — claim inventory and canonical docs surfaces

### Canonical reviewer-facing docs

1. `README.md`
   - reviewer path
   - engineering proof points
   - high-level E2E suite commands
2. `docs/project/REVIEWER-GUIDE.md`
   - primary 15-minute reviewer walkthrough
   - proof-surface index
3. `docs/architecture.md`
   - AI intake + mapping flow claims
4. `docs/delivery-guarantees.md`
   - delivery semantics and operator behavior claims
5. `docs/system-architecture.md`
   - system boundary claims

### Reviewer-facing product/code surfaces

1. `apps/client/src/pages/AdminIntake.tsx`
   - intake review queue
   - suggestion review/approval
   - rejection flow
   - sanitized payload preview
   - mapping trace visibility
2. `apps/client/src/pages/Intake.tsx`
   - intake submission/history surface
3. `apps/client/src/services/api-client.ts`
   - client ↔ Worker transport seam for intake review flows
4. `apps/workers/src/routes/intake.ts`
   - server truth for suggestion creation/listing/approval/rejection

### Claim inventory with current proof status

| Reviewer-facing claim                                                  | Primary doc/code surface                                                                | Current executable proof                                                                                                                   | Status  |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| Reviewer can create a mapping suggestion from messy input              | `README.md`, `docs/architecture.md`, `apps/client/src/pages/Intake.tsx`                 | `apps/e2e/journeys/intake-mapping-flow.e2e.ts`, `apps/e2e/journeys/self-healing-intake.e2e.ts`, `apps/e2e/journeys/intake-heal-ui.spec.ts` | Partial |
| Reviewer can inspect a pending review queue                            | `apps/client/src/pages/AdminIntake.tsx`, `docs/project/REVIEWER-GUIDE.md`               | `apps/client/src/pages/AdminIntake.test.tsx`, browser smoke in `apps/e2e/journeys/intake-heal-ui.spec.ts`                                  | Partial |
| Reviewer sees sanitized payload preview rather than raw unsafe payload | `apps/client/src/pages/AdminIntake.tsx`, ADRs                                           | unit test assertion in `apps/client/src/pages/AdminIntake.test.tsx`; no browser E2E proof                                                  | Gap     |
| Reviewer can explicitly select suggestions before approval             | `apps/client/src/pages/AdminIntake.tsx`                                                 | unit test in `apps/client/src/pages/AdminIntake.test.tsx`                                                                                  | Gap     |
| Approval creates a mapping version and ingests a normalized record     | `docs/architecture.md`, `apps/workers/src/routes/intake.ts`                             | `apps/e2e/journeys/intake-mapping-flow.e2e.ts`, `apps/e2e/journeys/public-fixture-demo-flow.e2e.ts`, worker tests                          | Covered |
| Rejection requires a reason and updates status                         | `apps/client/src/pages/AdminIntake.tsx`, `apps/workers/src/routes/intake.ts`            | client unit test + worker route tests; no browser E2E                                                                                      | Gap     |
| Mapping trace provides review/proof correlation                        | `apps/client/src/pages/AdminIntake.tsx`, `apps/workers/src/routes/intake.ts`, docs/ADRs | client unit tests + worker tests; no doc-level “run this proof” link                                                                       | Partial |
| Fixture-based demo can replay through delivery rails                   | `README.md`, `docs/research/product/VISION.md`                                          | `apps/e2e/journeys/public-fixture-demo-flow.e2e.ts`                                                                                        | Covered |

## Lane 2 — E2E journey gap analysis

### Existing E2E coverage

#### API-style journey coverage

- `apps/e2e/journeys/intake-mapping-flow.e2e.ts`
  - auth gate
  - fixture catalog listing/detail
  - mapping suggestion creation
  - pending review listing
  - approval
  - normalized record delivery to queue
- `apps/e2e/journeys/public-fixture-demo-flow.e2e.ts`
  - fixture catalog story
  - fixture-backed approval
  - delivery-rail proof
- `apps/e2e/journeys/self-healing-intake.e2e.ts`
  - self-healing/adaptive intake paths
  - auth/error paths

#### Browser-style journey coverage

- `apps/e2e/journeys/intake-heal-ui.spec.ts`
  - intake form render + submit
  - admin review page render smoke
  - loose approve-flow smoke

### High-confidence gaps

1. **Admin review UI E2E is too shallow**
   - current browser proof accepts any visible badge/heading
   - approve flow uses the first approve button rather than selecting a specific suggestion
   - no assertion for `mappingTraceId`
   - no assertion for sanitized preview content
   - no rejection-path E2E

2. **Docs do not map claims → proof file → run command**
   - reviewer docs mention proof surfaces generically
   - a reviewer still has to infer which executable test proves which claim

3. **No explicit E2E proof for reviewer-safe rendering**
   - important because “sanitized preview” is a trust claim, not just UI copy

4. **No browser proof for failure/guard paths on admin review**
   - approve disabled until suggestion selected
   - rejection blocked without reason
   - empty/no-suggestion states

### Recommended file additions/edits

#### Highest priority

1. **Extend** `apps/e2e/journeys/intake-heal-ui.spec.ts`
   - add assertion for `mappingTraceId`
   - add assertion for sanitized preview text
   - create/select a known suggestion checkbox before approval
   - assert approve is disabled until selection exists
   - add explicit rejection flow with required reason

2. **Add** `docs/project/reviewer-proof-matrix.md`
   - one row per reviewer-facing claim
   - include doc surface, code surface, executable test file, and exact command

3. **Edit** `docs/project/REVIEWER-GUIDE.md`
   - add a “Run proof” subsection linking directly to the proof matrix and named E2E files

4. **Edit** `README.md`
   - under “Engineering proof points” or “Verification and demo flows”, add named reviewer-proof commands instead of only suite names

#### Medium priority

5. **Add/extend** client page tests in `apps/client/src/pages/AdminIntake.test.tsx`
   - loading failure toast
   - approve-disabled-without-selection
   - reject-blocked-without-reason
   - no-suggestion-batch rendering
   - queue vs topic delivery target formatting

6. **Add/extend** worker tests in `apps/workers/src/tests/intake.test.ts`
   - rejection of already-approved attempt
   - approval request mismatch / invalid suggestion id guard
   - list filtering around pending/approved/ingested reviewer queue semantics

## Lane 3 — verification matrix and unit/integration coverage gaps

## Verification matrix

| Layer                   | Files with current proof                                                                            | Strong areas                               | Missing areas                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------- |
| Docs                    | `README.md`, `docs/project/REVIEWER-GUIDE.md`                                                       | orientation and architecture framing       | explicit claim→proof mapping                      |
| Client unit/integration | `apps/client/src/pages/AdminIntake.test.tsx`, `apps/client/src/services/api.contract.test.ts`       | load/approve/reject seam coverage          | guard/failure/empty-state coverage                |
| Worker unit/integration | `apps/workers/src/tests/intake.test.ts`, `validateIntakeRequest.test.ts`, `toAttemptRecord.test.ts` | intake contract and route behavior         | reviewer-queue semantics documented weakly        |
| API E2E                 | `intake-mapping-flow.e2e.ts`, `public-fixture-demo-flow.e2e.ts`, `self-healing-intake.e2e.ts`       | ingestion, approval, replay/delivery proof | no direct doc linkage for reviewers               |
| Browser E2E             | `intake-heal-ui.spec.ts`                                                                            | basic render/smoke                         | reviewer-critical interaction proof is incomplete |

## Concrete verification commands

Use these as the reviewer-facing proof command set:

```bash
corepack pnpm --filter @repo/client exec vitest run src/pages/AdminIntake.test.tsx src/services/api.contract.test.ts
corepack pnpm --filter @repo/workers exec vitest run src/tests/intake.test.ts src/tests/validateIntakeRequest.test.ts src/tests/toAttemptRecord.test.ts
corepack pnpm --filter @repo/e2e exec vitest run --config vitest.journeys.config.ts journeys/intake-mapping-flow.e2e.ts journeys/public-fixture-demo-flow.e2e.ts journeys/self-healing-intake.e2e.ts
corepack pnpm --filter @repo/e2e exec playwright test journeys/intake-heal-ui.spec.ts
corepack pnpm --filter @repo/client exec oxlint src/pages/AdminIntake.tsx src/pages/AdminIntake.test.tsx
corepack pnpm --filter @repo/workers exec oxlint src/routes/intake.ts src/tests/intake.test.ts src/tests/validateIntakeRequest.test.ts src/tests/toAttemptRecord.test.ts
corepack pnpm --filter @repo/client exec tsgo --noEmit
corepack pnpm --filter @repo/workers exec tsgo --noEmit
```

## Suggested reviewer-proof command aliases

Recommended root scripts:

```json
{
  "reviewer:proof:unit": "corepack pnpm --filter @repo/client exec vitest run src/pages/AdminIntake.test.tsx src/services/api.contract.test.ts && corepack pnpm --filter @repo/workers exec vitest run src/tests/intake.test.ts src/tests/validateIntakeRequest.test.ts src/tests/toAttemptRecord.test.ts",
  "reviewer:proof:e2e": "corepack pnpm --filter @repo/e2e exec vitest run --config apps/e2e/vitest.journeys.config.ts apps/e2e/journeys/intake-mapping-flow.e2e.ts apps/e2e/journeys/public-fixture-demo-flow.e2e.ts apps/e2e/journeys/self-healing-intake.e2e.ts",
  "reviewer:proof:browser": "corepack pnpm --filter @repo/e2e exec playwright test journeys/intake-heal-ui.spec.ts"
}
```

## Recommended next implementation order

1. Harden `apps/e2e/journeys/intake-heal-ui.spec.ts` into a true reviewer-proof browser test.
2. Add `docs/project/reviewer-proof-matrix.md`.
3. Link that matrix from `README.md` and `docs/project/REVIEWER-GUIDE.md`.
4. Backfill missing client unit tests for guard/empty/error states.
5. If needed, add one extra worker route test for rejection/approval conflict semantics.

## Notes

- This audit intentionally distinguishes **generic coverage** from **reviewer-consumable proof**.
- The repo already has meaningful executable coverage; the biggest gap is proof discoverability plus shallow browser verification of the admin review queue.
- Subagent skip reason: no native subagent execution interface was exposed in this worker thread, so bounded serial analysis was safer than claiming unavailable delegation.
