---
type: blueprint
status: planned
complexity: M
created: "2026-04-23"
last_updated: "2026-04-23"
progress: "0% planned; refined against local dataset and intake API paths"
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

# Public dataset demo ingestion

**Goal:** Turn the AI mapper into a crisp integration-platform-relevant demo using a public,
reproducible dataset: ingest pinned `open-apply-jobs` ATS payloads, show
vendor-shape differences, map them to a unified job schema, publish normalized
events through IngestLens, and present the observability trail.

## Planning Summary

- Verified local dataset path: `data/payload-mapper/payloads/ats/open-apply-sample.jsonl`
  exists and the adjacent README documents 8 pinned records across Ashby,
  Greenhouse, and Lever.
- Verified upstream intake handoff: this repo does **not** yet have
  `apps/workers/src/routes/intake.ts`, `apps/client/src/pages/Intake.tsx`, or
  `apps/client/src/components/MappingSuggestionReview.tsx`; those arrive via
  `ai-payload-intake-mapper` and are the exact surfaces this blueprint extends.
- Planned demo API surface should stay inside `/api/intake/*`: add fixture
  catalog endpoints, reuse upstream mapping/approval endpoints, and keep live
  fetch optional and allowlisted.
- Constraint: deterministic pinned fixtures are the default demo path; no
  private candidate/employee data and no arbitrary public-URL scraping.

## Architecture Overview

```text
Pinned ATS fixtures at data/payload-mapper/payloads/ats/open-apply-sample.jsonl
  -> GET /api/intake/public-fixtures
  -> GET /api/intake/public-fixtures/:fixtureId
  -> existing POST /api/intake/mapping-suggestions
  -> existing POST /api/intake/mapping-suggestions/:id/approve
  -> ats.job.normalized event + existing delivery/telemetry rails

Optional later live mode
  -> POST /api/intake/public-live-fetch (allowlisted vendors/tenants only)
  -> same mapping suggestion + approval flow
  -> fallback back to pinned fixtures on fetch/rate-limit failure
```

## Fact-Checked Findings

| ID  | Severity | Claim / assumption                                         | Reality / source                                                                                                                          | Blueprint fix                                                                                                                                           |
| --- | -------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | High     | The public demo dataset path is still speculative.         | `data/payload-mapper/payloads/ats/open-apply-sample.jsonl` exists locally; README says 8 pinned ATS rows.                                 | Keep that exact file as the default fixture source and name it in task specs. (Fx: dataset-path-verified)                                               |
| F2  | High     | This blueprint can invent a parallel demo API.             | Current Worker routes are `auth`, `dashboard`, `message`, `queue`, `topic`; `ai-payload-intake-mapper` is the upstream intake API plan.   | Reuse `apps/workers/src/routes/intake.ts` and extend `/api/intake/*` instead of adding a second route tree. (Fx: api-reuse)                             |
| F3  | Medium   | Intake UI files already exist in the repo.                 | `apps/client/src/pages/Intake.tsx` and `apps/client/src/components/MappingSuggestionReview.tsx` are not present yet.                      | Make every UI/API task explicitly depend on `ai-payload-intake-mapper` and target those exact upstream files. (Fx: upstream-intake-gate)                |
| F4  | Medium   | One fixture endpoint is enough.                            | The demo needs small list metadata first, then payload-by-id loading; sending all payloads in the initial list adds unnecessary coupling. | Split catalog and detail endpoints into `GET /api/intake/public-fixtures` and `GET /api/intake/public-fixtures/:fixtureId`. (Fx: fixture-catalog-split) |
| F5  | High     | Live public fetch can be a default or arbitrary URL fetch. | User constraints and repo direction require a deterministic default demo and safe networking boundaries.                                  | Keep live fetch opt-in, allowlisted, cached, and visibly secondary to pinned fixtures. (Fx: live-fetch-guardrails)                                      |

## Key Decisions

| Decision         | Choice                                                                                                                                                                                                                            | Rationale                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Default data     | Pinned `open-apply-jobs` sample at `data/payload-mapper/payloads/ats/open-apply-sample.jsonl` (Fx: dataset-path-verified)                                                                                                         | Public, deterministic, already in repo, and directly relevant to ATS demos.    |
| Demo API surface | `GET /api/intake/public-fixtures`, `GET /api/intake/public-fixtures/:fixtureId`, existing mapping/approval endpoints, optional `POST /api/intake/public-live-fetch` (Fx: api-reuse, fixture-catalog-split, live-fetch-guardrails) | Extends the upstream intake path instead of fragmenting the API.               |
| Domain           | Public job postings, not candidates                                                                                                                                                                                               | Avoids PII and private ATS records.                                            |
| Event type       | `ats.job.normalized`                                                                                                                                                                                                              | Matches the ATS-focused demo story while staying explicit about normalization. |
| Scope            | Demo ingestion polish, not connector marketplace                                                                                                                                                                                  | Keeps the integration-platform interview slice focused and credible.           |

## Quick Reference (Execution Waves)

| Wave              | Tasks           | Dependencies               | Parallelizable | Effort (T-shirt) |
| ----------------- | --------------- | -------------------------- | -------------- | ---------------- |
| **Wave 0**        | 1.1, 1.2        | Blueprint-level gates only | 2 agents       | XS-S             |
| **Wave 1**        | 2.1, 2.2        | Wave 0                     | 2 agents       | S-M              |
| **Wave 2**        | 2.3, 3.1        | Wave 1                     | 2 agents       | S                |
| **Critical path** | 1.2 → 2.2 → 2.3 | —                          | 3 waves        | M                |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning                  | Target               | Actual                        |
| ------ | ---------------------------------- | -------------------- | ----------------------------- |
| RW0    | Ready tasks in Wave 0              | ≥ planned agents / 2 | 2 runnable tasks for 2 agents |
| CPR    | total_tasks / critical_path_length | ≥ 2.5                | 6 / 3 = 2.0                   |
| DD     | dependency_edges / total_tasks     | ≤ 2.0                | 7 / 6 = 1.17                  |
| CP     | same-file overlaps per wave        | 0                    | 0                             |

**Parallelization score:** B. CPR is slightly below the generic 2.5 target,
but the task graph now keeps two useful waves of parallel work and explicitly
serializes `apps/workers/src/routes/intake.ts` / `apps/client/src/pages/Intake.tsx`
conflicts into Task 2.3 so same-wave file pressure stays at zero.

---

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

#### [fixtures] Task 1.2: Add a public fixture catalog API on the intake route

**Status:** todo

**Depends:** None

Expose the pinned public fixtures through the planned intake route with a small
catalog response and a payload-by-id detail response. Do not add a parallel demo
route tree and do not fetch the dataset over the network at runtime. (Fx: api-reuse,
Fx: fixture-catalog-split, Fx: upstream-intake-gate)

**Files:**

- Create: `apps/workers/src/intake/publicFixtureLoader.ts`
- Create: `apps/workers/src/intake/publicFixtureLoader.test.ts`
- Modify: `apps/workers/src/routes/intake.ts`

**Steps (TDD):**

1. Write failing Worker tests for fixture listing metadata, load-by-id, unknown
   id, and schema drift from the pinned JSONL envelope.
2. Run `pnpm --filter @repo/workers test -- publicFixtureLoader` — verify FAIL.
3. Implement loader logic against
   `data/payload-mapper/payloads/ats/open-apply-sample.jsonl` and wire:
   - `GET /api/intake/public-fixtures`
   - `GET /api/intake/public-fixtures/:fixtureId`
4. Re-run `pnpm --filter @repo/workers test -- publicFixtureLoader` — verify PASS.
5. Run `pnpm --filter @repo/workers check-types && pnpm --filter @repo/workers lint`.

**Acceptance:**

- [ ] Initial catalog response returns metadata only: fixture id, source system,
      title/name/text summary, source URL, and target schema hint.
- [ ] Detail endpoint returns one validated payload by fixture id.
- [ ] No dynamic network fetch is required for the default demo path.
- [ ] `pnpm --filter @repo/workers check-types && pnpm --filter @repo/workers lint` passes.

---

### Phase 2: Deterministic demo flow and optional live mode [Complexity: M]

#### [worker-flow] Task 2.1: Normalize approved fixtures into a shared job event

**Status:** todo

**Depends:** Task 1.1, Task 1.2

Convert the approved mapping result for Ashby, Greenhouse, and Lever fixtures
into one stable `ats.job.normalized` event shape with provenance preserved. Keep
this in the upstream intake approval flow instead of adding a new demo-only
publish path. (Fx: api-reuse, Fx: dataset-path-verified)

**Files:**

- Create: `apps/workers/src/intake/normalizedJobEvent.ts`
- Create: `apps/workers/src/intake/normalizedJobEvent.test.ts`
- Modify: `apps/workers/src/intake/normalizeWithMapping.ts`
- Modify: `apps/workers/src/routes/intake.ts`

**Steps (TDD):**

1. Write failing Worker tests for one Ashby, one Greenhouse, and one Lever
   fixture normalizing into the same event contract after approval.
2. Run `pnpm --filter @repo/workers test -- normalizedJobEvent` — verify FAIL.
3. Implement the shared normalized-event builder and wire it into the existing
   approval path so the emitted event includes fixture id, source system,
   `source_url`, and mapping suggestion id.
4. Re-run `pnpm --filter @repo/workers test -- normalizedJobEvent` — verify PASS.
5. Run `pnpm --filter @repo/workers check-types && pnpm --filter @repo/workers lint`.

**Acceptance:**

- [ ] Approved fixtures from all three vendors emit the same top-level event shape.
- [ ] Event metadata preserves fixture id and provenance.
- [ ] No normalized event is published before explicit approval.
- [ ] `pnpm --filter @repo/workers check-types && pnpm --filter @repo/workers lint` passes.

---

#### [client-flow] Task 2.2: Polish the Intake page around pinned public fixtures

**Status:** todo

**Depends:** Task 1.2

Use the upstream Intake page and review component as the only client surface:
load fixture metadata, fetch a selected payload by id, prefill the existing
mapping-suggestion flow, and show approval/delivery status without inventing a
second UI path. (Fx: upstream-intake-gate, Fx: fixture-catalog-split)

**Files:**

- Modify: `apps/client/src/pages/Intake.tsx`
- Modify: `apps/client/src/components/MappingSuggestionReview.tsx`
- Modify: `apps/client/src/services/api.ts`
- Create: `apps/client/src/pages/Intake.test.tsx`

**Steps (TDD):**

1. Write a failing client test covering: fixture catalog load, fixture selection,
   mapping suggestion request, approval CTA, and delivery-state rendering.
2. Run `pnpm --filter client test -- Intake.test.tsx` — verify FAIL.
3. Add API methods for `GET /api/intake/public-fixtures` and
   `GET /api/intake/public-fixtures/:fixtureId`, then wire the Intake page to
   reuse the upstream `POST /api/intake/mapping-suggestions` and approval flow.
4. Re-run `pnpm --filter client test -- Intake.test.tsx` — verify PASS.
5. Run `pnpm --filter client check-types && pnpm --filter client lint`.

**Acceptance:**

- [ ] User can browse pinned fixtures before any live/network path is shown.
- [ ] The page reuses the existing mapping suggestion and approval UX.
- [ ] Delivery status and mapping confidence remain visible after approval.
- [ ] `pnpm --filter client check-types && pnpm --filter client lint` passes.

---

#### [live-fetch] Task 2.3: Add optional allowlisted live public ATS fetch

**Status:** todo

**Depends:** Task 2.1, Task 2.2

Add a clearly secondary live-demo mode that fetches public job postings only
from configured Greenhouse/Lever/Ashby tenants. This task is intentionally
serialized after the worker and client demo-flow tasks because it touches both
`apps/workers/src/routes/intake.ts` and `apps/client/src/pages/Intake.tsx`.
(Fx: live-fetch-guardrails, Fx: api-reuse)

**Files:**

- Create: `apps/workers/src/intake/publicAtsFetch.ts`
- Create: `apps/workers/src/intake/publicAtsFetch.test.ts`
- Modify: `apps/workers/src/routes/intake.ts`
- Modify: `apps/workers/wrangler.toml`
- Modify: `apps/client/src/pages/Intake.tsx`
- Modify: `docs/guides/public-dataset-demo.md`

**Steps (TDD):**

1. Write failing Worker tests for allowlist enforcement, timeout/backoff,
   cache hit, unsupported vendor, and safe fallback to pinned fixtures.
2. Run `pnpm --filter @repo/workers test -- publicAtsFetch` — verify FAIL.
3. Implement `POST /api/intake/public-live-fetch` using explicit vendor/tenant
   config, bounded record counts, caching, and a disabled-by-default UI toggle.
4. Re-run `pnpm --filter @repo/workers test -- publicAtsFetch` — verify PASS.
5. Run `pnpm --filter client test -- Intake.test.tsx` to prove the optional
   toggle stays secondary and clearly labelled.
6. Run `pnpm --filter @repo/workers check-types && pnpm --filter client check-types`.

**Acceptance:**

- [ ] No arbitrary URL fetch is possible.
- [ ] Live fetch is disabled by default and clearly secondary to pinned fixtures.
- [ ] Fetch failures and rate limits fall back to the deterministic fixture path.
- [ ] `pnpm --filter @repo/workers check-types && pnpm --filter client check-types` passes.

---

### Phase 3: Interview packaging [Complexity: S]

#### [demo] Task 3.1: Add a one-command demo runner and rehearsal docs

**Status:** todo

**Depends:** Task 2.1, Task 2.2

Package the deterministic demo so a reviewer can rehearse it quickly without
paid credentials. Make the runner script the single source of truth for the
README and interview checklist so the docs cannot drift. (Fx: dataset-path-verified)

**Files:**

- Create: `scripts/demo/ingestlens-demo.mjs`
- Create: `docs/guides/interview-demo-script.md`
- Modify: `README.md`
- Modify: `package.json`

**Steps (TDD):**

1. Run `pnpm demo:ingestlens -- --check` — verify FAIL before the script exists.
2. Create `scripts/demo/ingestlens-demo.mjs` to print/validate the deterministic
   setup, fixture-selection path, and fallback steps.
3. Add `demo:ingestlens` to `package.json`, then document the five-minute main path,
   two-minute fallback path, and screenshot checklist in the new guide + README.
4. Re-run `pnpm demo:ingestlens -- --check` — verify PASS.
5. Run `pnpm docs:check && pnpm format:check`.

**Acceptance:**

- [ ] A reviewer can discover and run `pnpm demo:ingestlens` from the README.
- [ ] The rehearsal guide covers intake, mapping suggestion, approval,
      delivery telemetry, and a fallback branch.
- [ ] The scripted path does not require paid SaaS credentials.
- [ ] `pnpm docs:check && pnpm format:check` passes.

## Verification Gates

| Gate                   | Command                                                   | Success Criteria                      |
| ---------------------- | --------------------------------------------------------- | ------------------------------------- |
| Worker fixture catalog | `pnpm --filter @repo/workers test -- publicFixtureLoader` | Catalog + detail tests pass           |
| Worker normalization   | `pnpm --filter @repo/workers test -- normalizedJobEvent`  | Shared job-event tests pass           |
| Worker live fetch      | `pnpm --filter @repo/workers test -- publicAtsFetch`      | Allowlist/fallback tests pass         |
| Client demo flow       | `pnpm --filter client test -- Intake.test.tsx`            | Fixture-driven Intake UI tests pass   |
| Type safety            | `pnpm check-types`                                        | Zero workspace type errors            |
| Build                  | `pnpm build`                                              | Worker/client build succeeds          |
| Docs + formatting      | `pnpm docs:check && pnpm format:check`                    | Docs valid and formatted              |
| Blueprint validation   | `pnpm blueprints:check`                                   | Blueprint lifecycle validation passes |

## Cross-Plan References

| Type     | Blueprint                            | Relationship                                                                                                                          |
| -------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Upstream | `showcase-hardening-100`             | Demo polish assumes honest auth, CI, and verification baselines.                                                                      |
| Upstream | `rebrand-ingestlens`                 | Public docs and Intake copy should use the IngestLens framing.                                                                        |
| Upstream | `ai-payload-intake-mapper`           | Creates `apps/workers/src/routes/intake.ts`, `apps/client/src/pages/Intake.tsx`, and the mapping/approval API this blueprint extends. |
| Related  | `integration-payload-mapper-dataset` | Supplies the pinned ATS dataset and evaluation framing already committed under `data/payload-mapper/`.                                |

## Edge Cases and Error Handling

| Edge Case                                            | Risk                     | Solution                                                                                                                                           | Task               |
| ---------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Fixture metadata drifts from the pinned JSONL schema | Broken demo fixture list | Validate list/detail responses against the existing payload envelope before returning them. (Fx: dataset-path-verified, Fx: fixture-catalog-split) | 1.2                |
| Greenhouse/Ashby/Lever shapes normalize differently  | Inconsistent demo story  | Centralize `ats.job.normalized` building and test all three vendors against one contract. (Fx: api-reuse)                                          | 2.1                |
| Client eagerly loads all payload bodies up front     | Slow or noisy initial UX | Keep list metadata separate from payload detail fetch by id. (Fx: fixture-catalog-split)                                                           | 1.2, 2.2           |
| Job text or HTML is unsafe to render directly        | XSS / ugly demo output   | Render escaped/sanitized preview text only in the client flow.                                                                                     | 2.2                |
| Live endpoint rate-limits or changes response shape  | Demo flakiness           | Apply allowlist, cache, timeout/backoff, and deterministic fixture fallback. (Fx: live-fetch-guardrails)                                           | 2.3                |
| Upstream intake files are not merged yet             | Execution blocker        | Treat those tasks as blocked until `ai-payload-intake-mapper` lands the agreed file paths. (Fx: upstream-intake-gate)                              | 1.2, 2.1, 2.2, 2.3 |

## Non-goals

- No private candidate ingestion.
- No connector marketplace.
- No arbitrary public-URL scraping.
- No new paid SaaS dependency.
- No second demo-only API surface outside `/api/intake/*`.

## Risks

| Risk                                                                                      | Impact     | Mitigation                                                                                                                                               |
| ----------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live fetch distracts from the core deterministic demo                                     | Medium     | Keep it optional, disabled by default, and visibly subordinate to pinned fixtures. (Fx: live-fetch-guardrails)                                           |
| Upstream intake blueprint drifts from these file/path assumptions                         | Medium     | This blueprint names the exact upstream files and reuses the upstream API paths instead of inventing new ones. (Fx: upstream-intake-gate, Fx: api-reuse) |
| README/demo docs drift from the actual runnable steps                                     | Low-medium | Make `pnpm demo:ingestlens` the source of truth and validate it in the rehearsal task.                                                                   |
| Public ATS data feels less HRIS-like than unified integration-platform production records | Low-medium | Frame it explicitly as a safe public ATS wedge and keep synthetic/private-record claims out of the demo.                                                 |

## Technology Choices

| Component            | Technology / path                                                                                             | Version / state           | Why                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------- |
| Default fixture data | `data/payload-mapper/payloads/ats/open-apply-sample.jsonl`                                                    | Existing pinned file      | Already local, deterministic, and documented in `data/payload-mapper/payloads/ats/README.md`.     |
| Fixture catalog API  | `GET /api/intake/public-fixtures` + `GET /api/intake/public-fixtures/:fixtureId`                              | Planned in this blueprint | Small metadata-first flow fits the current demo better than shipping every payload body up front. |
| Mapping API reuse    | Existing upstream `POST /api/intake/mapping-suggestions` + `POST /api/intake/mapping-suggestions/:id/approve` | Planned upstream          | Avoids a parallel demo-only backend path.                                                         |
| Optional live fetch  | `POST /api/intake/public-live-fetch` with Wrangler-configured allowlist                                       | Planned optional          | Safe, bounded wow-factor after the deterministic path works.                                      |
| Demo runner          | `pnpm demo:ingestlens` backed by `scripts/demo/ingestlens-demo.mjs`                                           | Planned in this blueprint | Gives the README and interview checklist a single executable source of truth.                     |

## Refinement Summary

| Metric                    | Value                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------- |
| Findings total            | 5                                                                                      |
| Critical                  | 0                                                                                      |
| High                      | 3                                                                                      |
| Medium                    | 2                                                                                      |
| Low                       | 0                                                                                      |
| Fixes applied             | 5/5 in blueprint                                                                       |
| Cross-plans updated       | 0; this pass aligned to upstream blueprints without editing them                       |
| Edge cases documented     | 6                                                                                      |
| Risks documented          | 4                                                                                      |
| **Parallelization score** | B (2 runnable tasks in every wave; same-wave conflict pressure = 0)                    |
| **Critical path**         | 3 waves                                                                                |
| **Max parallel agents**   | 2                                                                                      |
| **Total tasks**           | 6                                                                                      |
| **Blueprint compliant**   | 6/6 tasks include `Status`, `Depends`, exact files, TDD steps, and acceptance criteria |

**Refinement delta (2026-04-23):** This pass locked the blueprint to the
verified local ATS sample path, replaced vague demo wiring with exact
`/api/intake/*` paths, split the fixture API into catalog + detail endpoints,
serialised the shared Worker/client file edits into Task 2.3 to keep same-wave
file pressure at zero, converted every task to `**Status:** todo`, and added a
real demo-runner task so the README/checklist can stay executable instead of
aspirational.

```

```
