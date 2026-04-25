---
type: blueprint
status: completed
complexity: M
created: "2026-04-23"
last_updated: "2026-04-25"
progress: "100% — merged to main on 2026-04-25"
depends_on:
  - showcase-hardening-100
  - rebrand-ingestlens
  - ai-payload-intake-mapper
tags:
  - dataset
  - demo
  - ats
  - ingestion
  - ingestlens
---

# Public job-posting demo lens

**Goal:** Show the generic intake review flow with pinned public job-posting
fixtures. ATS is the example lens, not the product boundary.

## Planning Summary

- Verified local dataset path: `data/payload-mapper/payloads/ats/open-apply-sample.jsonl`
  exists and the adjacent README documents 8 pinned records across Ashby,
  Greenhouse, and Lever.
- Verified upstream intake handoff: this repo does **not** yet have
  `apps/workers/src/routes/intake.ts`, `apps/client/src/pages/Intake.tsx`, or
  `apps/client/src/components/MappingSuggestionReview.tsx`; those arrive via
  `ai-payload-intake-mapper` and are the exact surfaces this blueprint extends.
- Planned demo API surface should stay inside `/api/intake/*`: add fixture
  catalog endpoints and reuse upstream mapping/approval endpoints. Live fetch is
  deferred from v1.
- Constraint: deterministic pinned fixtures are the default demo path; no
  private candidate/employee data and no arbitrary public-URL scraping.

## Architecture Overview

```text
Pinned ATS fixtures at data/payload-mapper/payloads/ats/open-apply-sample.jsonl
  -> GET /api/intake/public-fixtures
  -> GET /api/intake/public-fixtures/:fixtureId
  -> existing POST /api/intake/mapping-suggestions
  -> admin review in /admin/intake
  -> existing POST /api/intake/mapping-suggestions/:id/approve
  -> deterministic replay + ingest
  -> ingest.record.normalized event with recordType=job_posting + existing delivery/telemetry rails

Optional freshness mode
  -> pre-demo fixture refresh script fetches from allowlisted public sources
  -> writes pinned fixtures + hashes
  -> runtime still uses the deterministic fixture catalog
```

## Fact-Checked Findings

| ID  | Severity | Claim / assumption                                         | Reality / source                                                                                                                          | Blueprint fix                                                                                                                                           |
| --- | -------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | High     | The public demo dataset path is still speculative.         | `data/payload-mapper/payloads/ats/open-apply-sample.jsonl` exists locally; README says 8 pinned ATS rows.                                 | Keep that exact file as the default fixture source and name it in task specs. (Fx: dataset-path-verified)                                               |
| F2  | High     | This blueprint can invent a parallel demo API.             | Current Worker routes are `auth`, `dashboard`, `message`, `queue`, `topic`; `ai-payload-intake-mapper` is the upstream intake API plan.   | Reuse `apps/workers/src/routes/intake.ts` and extend `/api/intake/*` instead of adding a second route tree. (Fx: api-reuse)                             |
| F3  | Medium   | Intake UI files already exist in the repo.                 | `apps/client/src/pages/Intake.tsx` and `apps/client/src/components/MappingSuggestionReview.tsx` are not present yet.                      | Make every UI/API task explicitly depend on `ai-payload-intake-mapper` and target those exact upstream files. (Fx: upstream-intake-gate)                |
| F4  | Medium   | One fixture endpoint is enough.                            | The demo needs small list metadata first, then payload-by-id loading; sending all payloads in the initial list adds unnecessary coupling. | Split catalog and detail endpoints into `GET /api/intake/public-fixtures` and `GET /api/intake/public-fixtures/:fixtureId`. (Fx: fixture-catalog-split) |
| F5  | High     | Live public fetch can be a default or arbitrary URL fetch. | User constraints and repo direction require a deterministic default demo and safe networking boundaries.                                  | Defer live fetch from v1; revisit only after the pinned fixture path is stable. (Fx: live-fetch-guardrails)                                             |

## Key Decisions

| Decision                  | Choice                                                                                                                                                                                            | Rationale                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Default data              | Pinned `open-apply-jobs` sample at `data/payload-mapper/payloads/ats/open-apply-sample.jsonl` (Fx: dataset-path-verified)                                                                         | Public, deterministic, already in repo, and directly relevant to ATS demos.    |
| Demo API surface          | `GET /api/intake/public-fixtures`, `GET /api/intake/public-fixtures/:fixtureId`, existing mapping/approval endpoints (Fx: api-reuse, fixture-catalog-split)                                       | Extends the upstream intake path instead of fragmenting the API.               |
| Demo lens                 | Public job postings, not candidates                                                                                                                                                               | Avoids PII and private ATS records while keeping the platform generic.         |
| Event type                | `ingest.record.normalized` with `recordType: "job_posting"`                                                                                                                                       | Matches the generic ingestion architecture while preserving an ATS demo story. |
| Scope                     | Demo ingestion polish, not connector marketplace                                                                                                                                                  | Keeps the integration-platform interview slice focused and credible.           |
| Canonical demo entrypoint | `docs/guides/public-dataset-demo.md`; README links only                                                                                                                                           | Prevents competing demo paths and guide drift.                                 |
| Runtime fixture access    | Generate and commit a small Worker fixture module from the pinned JSONL sample; do not read repo-local files at request time                                                                      | Makes the deployed demo deterministic without adding R2/KV.                    |
| Demo success proof        | fixture selected, mapping suggested/abstained, validation shown, admin approval recorded, replay+ingest completed, normalized event emitted, `mappingTraceId` visible, delivery telemetry visible | Makes the demo measurable instead of narrative-only.                           |

### Phase 1: Provenance and fixture catalog [Complexity: S]

#### [provenance] Task 1.1: Document public dataset provenance and demo-safe framing

**Status:** todo

**Depends:** None

Execute this blueprint only after the frontmatter `depends_on` gates (`showcase-hardening-100`, `rebrand-ingestlens`, `ai-payload-intake-mapper`) are complete. Make the public-data story legible before polishing the demo: bind the guide and
README updates to the verified pinned ATS fixture path, explain what the sample
is and is not, and call out that the demo reuses the upstream intake API rather
than inventing a separate "demo mode" backend. (Fx: dataset-path-verified,
Fx: api-reuse)

**Files:**

- Modify: `data/payload-mapper/payloads/ats/README.md`
- Create: `docs/guides/public-dataset-demo.md`
- Modify: `README.md`

**Steps (TDD):**

1. Stub the new guide and README link targets, then run `pnpm docs:check` —
   verify FAIL until the new guide/frontmatter and headings exist.
2. Document the exact pinned file path, its 8-record scope, and the distinction
   between public ATS job postings vs. private ATS records.
3. Add a short API-surface note that the demo extends `/api/intake/*` and reuses
   upstream mapping approval endpoints.
4. Run `pnpm docs:check && pnpm format:check` — verify PASS.

**Acceptance:**

- [ ] `docs/guides/public-dataset-demo.md` exists and names
      `data/payload-mapper/payloads/ats/open-apply-sample.jsonl` explicitly.
- [ ] README links to the guide and makes the public-data boundary clear.
- [ ] Docs distinguish deterministic pinned fixtures from optional live fetch.
- [ ] `pnpm docs:check && pnpm format:check` passes.

---

#### [fixtures] Task 1.2: Bundle and expose demo fixtures on the intake route

**Status:** todo

**Depends:** None

Expose a small fixture catalog and fixture-by-id endpoint from committed demo
fixtures. Keep this runtime path fully deterministic and filesystem-free. Do
not add a parallel demo route tree. (Fx: api-reuse, Fx: fixture-catalog-split,
Fx: upstream-intake-gate)

**Files:**

- Create: `apps/workers/src/intake/demoFixtures.ts`
- Create: `scripts/generate-demo-fixtures.ts`
- Create: `apps/workers/src/tests/demoFixtures.test.ts`
- Modify: `apps/workers/src/routes/intake.ts`

**Steps (TDD):**

1. Write failing Worker tests for fixture listing metadata, load-by-id, unknown
   id, and schema drift from the pinned JSONL envelope.
2. Run `pnpm --filter @repo/workers test -- demoFixtures` — verify FAIL.
3. Generate the bundled fixture module from
   `data/payload-mapper/payloads/ats/open-apply-sample.jsonl` and wire:
   - `GET /api/intake/public-fixtures`
   - `GET /api/intake/public-fixtures/:fixtureId`
4. Re-run `pnpm --filter @repo/workers test -- demoFixtures` — verify PASS.
5. Run `pnpm --filter @repo/workers check-types && pnpm --filter @repo/workers lint`.

**Acceptance:**

- [ ] Initial catalog response returns metadata only: fixture id, source system,
      title/name/text summary, source URL, and target schema hint.
- [ ] Detail endpoint returns one validated payload by fixture id.
- [ ] No dynamic network fetch is required for the default demo path.
- [ ] Fixture endpoints work from bundled Worker data and do not depend on runtime filesystem access.
- [ ] `pnpm --filter @repo/workers check-types && pnpm --filter @repo/workers lint` passes.

---

### Phase 2: Deterministic demo flow and optional live mode [Complexity: M]

#### [coverage] Task 2.1: Extend upstream normalization coverage with public job-posting fixtures

**Status:** todo

**Depends:** Task 1.1, Task 1.2

Add fixture cases to the upstream intake normalization and evaluation tests
instead of creating a second normalization implementation task. The generic core
applies mappings; this blueprint only proves the pinned job-posting lens works
through that core. (Fx: api-reuse, Fx: dataset-path-verified)

**Files:**

- Modify: `apps/workers/src/tests/normalizeWithMapping.test.ts`
- Modify: `apps/workers/src/tests/evaluateMappings.test.ts`
- Modify: `data/payload-mapper/mapping_tasks/eval.jsonl`

**Steps (TDD):**

1. Write failing upstream Worker tests for one Ashby, one Greenhouse, and one
   Lever fixture normalizing into the same generic envelope after approval.
2. Run `pnpm --filter @repo/workers test -- normalizeWithMapping evaluateMappings` — verify FAIL.
3. Add only fixture/eval cases and contract data needed by the existing generic
   normalization path. Do not add job-posting-specific code to core modules.
4. Re-run `pnpm --filter @repo/workers test -- normalizeWithMapping evaluateMappings` — verify PASS.
5. Run `pnpm --filter @repo/workers check-types && pnpm --filter @repo/workers lint`.

**Acceptance:**

- [ ] Pinned fixtures from all three source shapes emit the same top-level event shape through the upstream core.
- [ ] Event metadata preserves fixture id, source URL, payload hash, schema version, and `mappingTraceId`.
- [ ] Example-lens fixtures map into the generic normalized envelope without job-posting code in the core blueprint.
- [ ] No normalized event is published before explicit approval.
- [ ] `pnpm --filter @repo/workers check-types && pnpm --filter @repo/workers lint` passes.

---

#### [client-flow] Task 2.2: Preload the intake UI from demo fixtures

**Status:** todo

**Depends:** Task 1.2

Use the upstream Intake page and review component as the only client surface:
load fixture metadata, fetch a selected payload by id, prefill the existing
mapping-suggestion flow, and show approval, ingest, and delivery status without
inventing a second UI path. (Fx: upstream-intake-gate, Fx: fixture-catalog-split)

**Files:**

- Modify: `apps/client/src/pages/Intake.tsx`
- Modify: `apps/client/src/pages/AdminIntake.tsx`
- Modify: `apps/client/src/components/MappingSuggestionReview.tsx`
- Modify: `apps/client/src/services/api.ts`
- Create: `apps/client/src/pages/Intake.test.tsx`

**Steps (TDD):**

1. Write a failing client test covering: fixture catalog load, fixture selection,
   mapping suggestion request, pending admin approval queue, approval CTA, ingest status, and delivery-state rendering.
2. Run `pnpm --filter client test -- Intake.test.tsx` — verify FAIL.
3. Add API methods for `GET /api/intake/public-fixtures` and
   `GET /api/intake/public-fixtures/:fixtureId`, then wire the Intake/AdminIntake pages to
   reuse the upstream `POST /api/intake/mapping-suggestions` and approval flow.
4. Re-run `pnpm --filter client test -- Intake.test.tsx` — verify PASS.
5. Run `pnpm --filter client check-types && pnpm --filter client lint`.

**Acceptance:**

- [ ] User can browse pinned fixtures before any live/network path is shown.
- [ ] The pages reuse the existing mapping suggestion and admin approval UX.
- [ ] Ingest status, delivery status, mapping confidence, and `mappingTraceId` remain visible after approval.
- [ ] `pnpm --filter client check-types && pnpm --filter client lint` passes.

---

#### [freshness] Optional Task 2.3: Add a pre-demo fixture refresh script

**Status:** optional

**Depends:** shipped deterministic pinned-fixture demo

Do not add runtime live fetch to the v1 Worker route. If source freshness matters
for the interview, add a local/admin pre-demo refresh script that fetches only
from allowlisted public sources, writes pinned fixture files, records source
URLs and hashes, and lets the runtime demo continue using deterministic bundled
fixtures.

**Files:**

- Create: `scripts/refresh-demo-fixtures.ts`
- Modify: `data/payload-mapper/payloads/ats/README.md`
- Modify: `docs/guides/public-dataset-demo.md`

**Acceptance:**

- [ ] No `POST /api/intake/public-live-fetch` endpoint is required for showcase readiness.
- [ ] Refresh script is allowlist-only, timeout-bounded, payload-size-bounded, and never part of required CI gates.
- [ ] Refresh output is committed/pinned with hashes before the demo.
- [ ] README/demo docs describe runtime live fetch as future-only, not a shipped or required path.

---

### Phase 3: Interview packaging [Complexity: S]

#### [demo] Task 3.1: Add a short deterministic demo guide

**Status:** todo

**Depends:** Task 2.1, Task 2.2

Document the main path and fallback path for the pinned-fixture demo. Add a
runner script only if docs drift becomes a real problem. (Fx:
dataset-path-verified)

**Files:**

- Modify: `docs/guides/public-dataset-demo.md`
- Modify: `README.md`

**Steps (TDD):**

1. Add the guide and README link targets, then run `pnpm docs:check` — verify
   FAIL until frontmatter/headings exist.
2. Document the five-minute main path, two-minute fallback path, admin approval
   path, ingest/delivery proof, and screenshot checklist.
3. Run `pnpm docs:check && pnpm format:check` — verify PASS.

**Acceptance:**

- [ ] A reviewer can discover the deterministic demo path from the README.
- [ ] The rehearsal guide covers intake, mapping suggestion, admin approval, ingest,
      delivery telemetry, and a fallback branch.
- [ ] The documented path does not require paid SaaS credentials.
- [ ] `pnpm docs:check && pnpm format:check` passes.

## Verification Gates

| Gate                    | Command                                                                     | Success Criteria                      |
| ----------------------- | --------------------------------------------------------------------------- | ------------------------------------- |
| Worker fixture catalog  | `pnpm --filter @repo/workers test -- demoFixtures`                          | Catalog + detail tests pass           |
| Worker fixture coverage | `pnpm --filter @repo/workers test -- normalizeWithMapping evaluateMappings` | Fixture coverage passes               |
| Client demo flow        | `pnpm --filter client test -- Intake.test.tsx`                              | Fixture-driven Intake UI tests pass   |
| Type safety             | `pnpm check-types`                                                          | Zero workspace type errors            |
| Build                   | `pnpm build`                                                                | Worker/client build succeeds          |
| Docs + formatting       | `pnpm docs:check && pnpm format:check`                                      | Docs valid and formatted              |
| Blueprint validation    | `pnpm blueprints:check`                                                     | Blueprint lifecycle validation passes |

## Cross-Plan References

| Type     | Blueprint                            | Relationship                                                                                                                          |
| -------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Upstream | `showcase-hardening-100`             | Demo polish assumes honest auth, CI, and verification baselines.                                                                      |
| Upstream | `rebrand-ingestlens`                 | Public docs and Intake copy should use the IngestLens framing.                                                                        |
| Upstream | `ai-payload-intake-mapper`           | Creates `apps/workers/src/routes/intake.ts`, `apps/client/src/pages/Intake.tsx`, and the mapping/approval API this blueprint extends. |
| Related  | `integration-payload-mapper-dataset` | Supplies the pinned ATS dataset and evaluation framing already committed under `data/payload-mapper/`.                                |

## Edge Cases and Error Handling

| Edge Case                                            | Risk                     | Solution                                                                                                                                           | Task          |
| ---------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Fixture metadata drifts from the pinned JSONL schema | Broken demo fixture list | Validate list/detail responses against the existing payload envelope before returning them. (Fx: dataset-path-verified, Fx: fixture-catalog-split) | 1.2           |
| Greenhouse/Ashby/Lever shapes normalize differently  | Inconsistent demo story  | Prove all three source shapes through the upstream generic mapping/envelope tests. (Fx: api-reuse)                                                 | 2.1           |
| Client eagerly loads all payload bodies up front     | Slow or noisy initial UX | Keep list metadata separate from payload detail fetch by id. (Fx: fixture-catalog-split)                                                           | 1.2, 2.2      |
| Job text or HTML is unsafe to render directly        | XSS / ugly demo output   | Render escaped/sanitized preview text only in the client flow.                                                                                     | 2.2           |
| Bundled fixture module drifts from pinned JSONL      | Demo/source mismatch     | Generator test compares module records to `open-apply-sample.jsonl` source ids and hashes.                                                         | 1.2           |
| Runtime live endpoint distracts from pinned path     | Demo flakiness           | Use a pre-demo refresh script instead; keep runtime future-only. (Fx: live-fetch-guardrails)                                                       | 2.3           |
| Upstream intake files are not merged yet             | Execution blocker        | Treat those tasks as blocked until `ai-payload-intake-mapper` lands the agreed file paths. (Fx: upstream-intake-gate)                              | 1.2, 2.1, 2.2 |

## Non-goals

- No private candidate ingestion.
- No connector marketplace.
- No arbitrary public-URL scraping.
- No new paid SaaS dependency.
- No second demo-only API surface outside `/api/intake/*`.

## Risks

| Risk                                                                               | Impact     | Mitigation                                                                                                                                                        |
| ---------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime live fetch distracts from the core deterministic demo                      | Medium     | Prefer pre-demo fixture refresh; keep runtime fetch deferred until the pinned-fixture path is shipped and measured. (Fx: live-fetch-guardrails)                   |
| Upstream intake blueprint drifts from these file/path assumptions                  | Medium     | This blueprint names the exact upstream files and reuses the upstream API paths instead of inventing new ones. (Fx: upstream-intake-gate, Fx: api-reuse)          |
| README/demo docs drift from the actual runnable steps                              | Low-medium | Keep one guide as the source of truth and validate docs frontmatter/links.                                                                                        |
| Public job-posting data feels narrower than generic integration production records | Low-medium | Frame it explicitly as a safe public first lens; use synthetic employee-style fixtures only as adversarial/eval inputs until a privacy-safe public source exists. |

## Technology Choices

| Component            | Technology / path                                                                                             | Version / state           | Why                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------- |
| Default fixture data | `data/payload-mapper/payloads/ats/open-apply-sample.jsonl`                                                    | Existing pinned file      | Already local, deterministic, and documented in `data/payload-mapper/payloads/ats/README.md`.     |
| Fixture catalog API  | `GET /api/intake/public-fixtures` + `GET /api/intake/public-fixtures/:fixtureId`                              | Planned in this blueprint | Small metadata-first flow fits the current demo better than shipping every payload body up front. |
| Mapping API reuse    | Existing upstream `POST /api/intake/mapping-suggestions` + `POST /api/intake/mapping-suggestions/:id/approve` | Planned upstream          | Avoids a parallel demo-only backend path.                                                         |
| Demo guide           | `docs/guides/public-dataset-demo.md`                                                                          | Planned in this blueprint | Gives README and interview rehearsal one deterministic source of truth.                           |
