---
type: blueprint
status: completed
complexity: M
created: "2026-04-23"
last_updated: "2026-04-25"
progress: "100% — merged to main on 2026-04-25"
depends_on:
  - showcase-hardening-100
tags:
  - branding
  - docs
  - product
  - interview
---

# Rebrand to IngestLens

**Goal:** Replace the public `node-pubsub` take-home-assignment identity with
**IngestLens**, a modern IntegrationOps showcase: AI-assisted payload intake,
mapping, delivery, and observability for third-party ingestion data.

## Planning Summary

- Chosen public brand: `IngestLens`.
- Tagline: "AI-assisted integration observability for payload intake, mapping,
  and delivery."
- Why this brand: it names the actual portfolio wedge, avoids `pubsub`, and
  does not position the repo as a full connector-platform competitor.
- Search caveat: a 2026-04-23 web search found no obvious exact-match product
  for `IngestLens`; this is not trademark clearance.
- Refinement outcome: README/docs work, client shell copy, client page copy,
  and hygiene cleanup are now split into conflict-free file clusters.

## Architecture Overview

```text
Before
  README/docs/UI/package names say node-pubsub
  docs describe mixed old Express/Mongo/Redis and current Workers/Postgres state
  demo story is generic queues/topics

After
  public surfaces say IngestLens
  docs tell a single truth-state-labelled story
  demo narrative starts from messy third-party payload intake
  queues/topics are implementation primitives behind integration observability
```

## Fact-Checked Findings

| ID  | Severity | Claim / assumption                                            | Reality / repo evidence                                                                                                                                                                                 | Blueprint fix                                                                                                                         |
| --- | -------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Medium   | “Run docs checks” and “run client build” are specific enough. | Root `package.json` defines `pnpm docs:check`, `pnpm blueprints:check`, `pnpm format:check`; `apps/client/package.json` defines `pnpm --filter client test`, `build`, and `check-types`.                | (Fx1) Replace vague verification steps with exact `pnpm` commands in every task.                                                      |
| F2  | Medium   | `docs/guides/public-dataset-demo.md` already exists.          | Codebase verification shows `docs/guides/public-dataset-demo.md: false`; the downstream dataset blueprint owns the guide, while this blueprint only prepares README links/copy for that canonical path. | (Fx2) Make Task 2.1 update README copy/link expectations for `docs/guides/public-dataset-demo.md` without creating a competing guide. |
| F3  | Medium   | UI smoke tests from upstream probably already exist.          | `find apps/client -type f \( -name '*test.*' -o -name '*spec.*' \)` returned no committed client tests.                                                                                                 | (Fx3) Require first-pass Vitest smoke tests in UI tasks before copy changes ship.                                                     |
| F4  | Low      | Existing task boundaries are safe for parallel execution.     | `README.md` was shared by Tasks 1.1, 1.2, and 2.1; client shell/page files were also bundled too coarsely.                                                                                              | (Fx4) Split README/docs, client shell, client page, and hygiene work into serialized or conflict-free tasks so CP stays 0.            |
| F5  | Low      | Cross-plan names might need renaming during refinement.       | `showcase-hardening-100`, `ai-payload-intake-mapper`, and `public-dataset-demo-ingestion` already reference `rebrand-ingestlens` consistently.                                                          | (Fx5) Keep blueprint names stable; add a note that `docs/guides/public-dataset-demo.md` is the shared downstream guide path.          |

## Key Decisions

| Decision                | Choice                                                                                                          | Rationale                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Public name             | IngestLens                                                                                                      | Clear, uncommon, integration-observability oriented.                    |
| Internal package rename | Defer unless easy                                                                                               | Public polish matters more than risky workspace churn before interview. |
| Product wedge           | generic ingestion review and mapping repair                                                                     | integration-platform-relevant without building a marketplace.           |
| Docs truth state        | shipped / partial / planned labels                                                                              | Prevents old roadmap/docs from overselling incomplete features.         |
| Verification surface    | Repo-native `pnpm` scripts                                                                                      | Keeps execution aligned with actual workspace commands.                 |
| Canonical docs          | VISION = durable narrative; README = landing page; ROADMAP = execution order                                    | Prevents source-of-truth drift between public copy and execution plans. |
| Naming boundary         | Public docs/UI use IngestLens; internal package/runtime names may remain only with documented deferments        | Avoids risky churn while making public surfaces coherent.               |
| Demo guide ownership    | `docs/guides/public-dataset-demo.md` is the canonical human demo guide owned by `public-dataset-demo-ingestion` | Avoids competing guide paths and stale scripts.                         |

### Phase 1: Public identity, docs truth reset, and hygiene [Complexity: M]

#### [docs] Task 1.1: Rewrite README and supporting docs as the IngestLens landing page

**Status:** todo

**Depends:** None

**Effort:** S

Own all README-first truth-state work in one place so no other same-wave task
needs to touch `README.md`. Execute this blueprint only after the frontmatter `depends_on` gate (`showcase-hardening-100`) is complete. Apply (Fx1, Fx4): make the first screen explain the
product in under 30 seconds, use shipped/partial/planned labels, and swap the
queue-first story for intake -> mapping -> normalized event -> delivery ->
observability without overselling unbuilt features.

**Files:**

- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/delivery-guarantees.md`
- Modify: `docs/scale-considerations.md`

**Steps (TDD):**

1. Run `rg -n "node-pubsub|ozbys-node-pubsub|pub/sub|pubsub|pub-sub" README.md docs/architecture.md docs/delivery-guarantees.md docs/scale-considerations.md` to capture the failing legacy-copy baseline.
2. Rewrite the README sections for Product, Demo path, Architecture, Run locally, Verification, Security posture, and Roadmap; update the three supporting docs so they tell the same truth-state-labelled story.
3. Re-run `rg -n "node-pubsub|ozbys-node-pubsub|pub/sub|pubsub|pub-sub" README.md docs/architecture.md docs/delivery-guarantees.md docs/scale-considerations.md` and keep only intentionally labelled legacy references.
4. Run `pnpm docs:check && pnpm format:check`.

**Acceptance:**

- [ ] `README.md` first screen says `IngestLens` and explains the product quickly.
- [ ] `README.md` includes exact local run/verify commands from a clean checkout.
- [ ] `docs/architecture.md`, `docs/delivery-guarantees.md`, and `docs/scale-considerations.md` no longer present stale topology as current state.
- [ ] `pnpm docs:check` and `pnpm format:check` pass after the rewrite.

#### [brand] Task 1.2: Align product vision, ADR index, and worker-facing brand surfaces

**Status:** todo

**Depends:** None

**Effort:** XS

Apply (Fx1, Fx4) to the non-README public brand surfaces: keep historical ADR
context readable, update product-facing brand language, and only rename the
worker-facing resource label if the change is low-risk and still honest about
legacy internals.

**Files:**

- Modify: `docs/research/product/VISION.md`
- Modify: `docs/adrs/README.md`
- Modify: `apps/workers/wrangler.toml`

**Steps (TDD):**

1. Run `rg -n "IngestLens|node-pubsub|ozbys-node-pubsub" docs/research/product/VISION.md docs/adrs/README.md apps/workers/wrangler.toml` to capture the baseline naming state.
2. Update copy to `IngestLens` where it describes the public product, and keep legacy/internal references only when explicitly labelled.
3. If `apps/workers/wrangler.toml` keeps a legacy worker name for safety, document that deferment in `docs/adrs/README.md` instead of leaving it implicit.
4. Run `pnpm docs:check && pnpm format:check`.

**Acceptance:**

- [ ] Product vision and ADR index use `IngestLens` for the public story.
- [ ] Worker-facing naming is either rebranded or explicitly deferred with rationale.
- [ ] Historical ADR references remain understandable.
- [ ] `pnpm docs:check` and `pnpm format:check` pass.

#### [ui-shell] Task 1.3: Rebrand client shell copy with first-pass smoke coverage

**Status:** todo

**Depends:** None

**Effort:** XS

Apply (Fx3, Fx4) by adding the first committed client smoke assertions before
changing visible shell copy. This task owns the shared chrome only; page-level
copy moves to Phase 2 so shell and page work can run in parallel without file
conflicts.

**Files:**

- Create: `apps/client/src/components/brandingShell.test.tsx`
- Modify: `apps/client/src/components/NavBar.tsx`
- Modify: `apps/client/src/components/Sidebar.tsx`

**Steps (TDD):**

1. Create `apps/client/src/components/brandingShell.test.tsx` with failing assertions for `IngestLens` shell branding, legacy-name absence, and integration-observability navigation copy.
2. Run `pnpm --filter client test` and verify the new assertions fail.
3. Update `NavBar.tsx` and `Sidebar.tsx` to match the approved brand and product wedge without pretending queues/topics disappeared.
4. Run `pnpm --filter client test && pnpm --filter client check-types && pnpm --filter client build`.

**Acceptance:**

- [ ] A committed client smoke test covers shell branding.
- [ ] Nav and sidebar copy say what IngestLens is for.
- [ ] Shell copy keeps delivery primitives honest rather than hiding them.
- [ ] `pnpm --filter client test`, `pnpm --filter client check-types`, and `pnpm --filter client build` pass.

#### [hygiene] Task 1.4: Remove stale local-stack and template artifacts without collateral churn

**Status:** todo

**Depends:** None

**Effort:** S

Apply (Fx1, Fx4) to cleanup-only files so stale Express/Mongo/Redis/template
signals are removed in one serialized pass. Review `.new` files before deletion;
do not spread this work across other tasks.

**Files:**

- Modify: `.env.example`
- Modify or delete: `docker-compose.yml`
- Modify: `blueprints/README.md`
- Modify: `docs/project/ROADMAP.md`
- Delete after diff review: `AGENTS.md.new`
- Delete after diff review: `.agent/guides/agent-guardrails.md.new`
- Delete after diff review: `.agent/guides/parallel-execution.md.new`
- Delete after diff review: `.agent/guides/plan-audit-checklist.md.new`
- Delete after diff review: `.agent/rules/README.md.new`
- Delete after diff review: `.agent/rules/blueprint-scoping.md.new`
- Delete after diff review: `.agent/rules/cmd-execution.md.new`
- Delete after diff review: `.agent/rules/generated-code-governance.md.new`
- Delete after diff review: `.agent/rules/repo-restrictions.md.new`
- Delete after diff review: `.agent/skills/pll/SKILL.md.new`
- Delete after diff review: `blueprints/README.md.new`
- Delete after diff review: `docs/templates/blueprint.md.new`
- Delete after diff review: `docs/templates/guide.md.new`
- Delete after diff review: `docs/templates/postmortem.md.new`
- Delete after diff review: `docs/templates/runbook.md.new`
- Delete after diff review: `docs/templates/system.md.new`

**Steps (TDD):**

1. Run `rg -n "Mongo|Redis|Express|api-server|notification-server|node-pubsub|\\.new" .env.example docker-compose.yml blueprints/README.md docs/project/ROADMAP.md .agent docs AGENTS.md` to capture the stale-artifact baseline.
2. Rewrite or remove stale local-stack guidance for Workers/Postgres/Doppler reality, and update blueprint/roadmap references to the current IngestLens sequence.
3. Review each tracked `.new` file against its canonical counterpart, then delete only files proven redundant.
4. Run `pnpm blueprints:check && pnpm docs:check && pnpm format:check`.

**Acceptance:**

- [ ] No stale Mongo/Redis/Express stack is presented as current in the owned files.
- [ ] Tracked redundant `.new` files are either deleted or intentionally retained with rationale.
- [ ] `docs/project/ROADMAP.md` and `blueprints/README.md` point at the current planned IngestLens work.
- [ ] `pnpm blueprints:check`, `pnpm docs:check`, and `pnpm format:check` pass.

### Phase 2: Demo narrative and UI story polish [Complexity: S]

#### [demo] Task 2.1: Add README demo entrypoint pointing at the canonical guide

**Status:** todo

**Depends:** Task 1.1, Task 1.4

**Effort:** XS

Apply (Fx2, Fx5) by making README point at the canonical demo guide path without creating a second guide. The human-readable guide is owned by `public-dataset-demo-ingestion`; this rebrand task only establishes the landing-page entrypoint and truth-state language.

**Files:**

- Modify: `README.md`

**Steps (TDD):**

1. Capture current README demo-link state with `rg -n "demo guide|five minutes|public dataset|public-dataset-demo" README.md`.
2. Update `README.md` to link to the planned canonical guide `docs/guides/public-dataset-demo.md`, explain pinned fixtures, and state the no-paid-SaaS / no-marketplace scope.
3. Label the guide as planned until `public-dataset-demo-ingestion` creates it.
4. Run `pnpm docs:check && pnpm format:check`.

**Acceptance:**

- [ ] README points to `docs/guides/public-dataset-demo.md` as the canonical demo guide.
- [ ] README does not duplicate the full script.
- [ ] README labels the guide/demo truth state honestly until the guide exists.
- [ ] `pnpm docs:check` and `pnpm format:check` pass.

#### [ui-landing] Task 2.2: Reframe landing and dashboard pages around intake observability

**Status:** todo

**Depends:** Task 1.1, Task 1.3

**Effort:** XS

Apply (Fx3, Fx4) to the first two page surfaces users see after the shell. Keep
this task scoped to the landing/dashboard narrative so it can run in parallel
with delivery-rail copy updates.

**Files:**

- Create: `apps/client/src/pages/landingDashboardCopy.test.tsx`
- Modify: `apps/client/src/pages/Index.tsx`
- Modify: `apps/client/src/pages/Dashboard.tsx`

**Steps (TDD):**

1. Create `apps/client/src/pages/landingDashboardCopy.test.tsx` with failing assertions for IngestLens landing-page positioning, dashboard empty-state guidance, and absence of generic queue-first hero copy.
2. Run `pnpm --filter client test` and verify the new assertions fail.
3. Update `Index.tsx` and `Dashboard.tsx` so the app opens on payload intake, mapping, delivery, and observability language that matches README truth-state wording.
4. Run `pnpm --filter client test && pnpm --filter client check-types && pnpm --filter client build`.

**Acceptance:**

- [ ] The first client screens say what IngestLens does.
- [ ] Empty states guide the demo user toward payload ingestion and mapping review.
- [ ] No fake enterprise or connector-marketplace claims are introduced.
- [ ] `pnpm --filter client test`, `pnpm --filter client check-types`, and `pnpm --filter client build` pass.

#### [ui-rails] Task 2.3: Reword queues and topics as honest delivery rails

**Status:** todo

**Depends:** Task 1.3

**Effort:** XS

Apply (Fx3, Fx4) to the remaining page copy without pretending queues/topics are
gone. This task keeps those primitives visible while framing them as delivery
rails behind the higher-level integration observability story.

**Files:**

- Create: `apps/client/src/pages/deliveryRailsCopy.test.tsx`
- Modify: `apps/client/src/pages/Queues.tsx`
- Modify: `apps/client/src/pages/Topics.tsx`

**Steps (TDD):**

1. Create `apps/client/src/pages/deliveryRailsCopy.test.tsx` with failing assertions for delivery-rail framing, empty-state guidance, and legacy generic queue/topic wording removal.
2. Run `pnpm --filter client test` and verify the new assertions fail.
3. Update `Queues.tsx` and `Topics.tsx` to explain how payloads move through delivery rails after mapping/approval.
4. Run `pnpm --filter client test && pnpm --filter client check-types && pnpm --filter client build`.

**Acceptance:**

- [ ] Queue/topic pages support the IngestLens narrative without hiding the underlying primitives.
- [ ] Empty states connect delivery rails back to the payload ingestion demo.
- [ ] No fake enterprise or marketplace positioning appears.
- [ ] `pnpm --filter client test`, `pnpm --filter client check-types`, and `pnpm --filter client build` pass.

## Verification Gates

| Gate                | Command                            | Success Criteria                    |
| ------------------- | ---------------------------------- | ----------------------------------- |
| Docs frontmatter    | `pnpm docs:check`                  | All docs valid                      |
| Blueprint lifecycle | `pnpm blueprints:check`            | Valid statuses and dependency graph |
| Format              | `pnpm format:check`                | No formatting drift                 |
| Client smoke        | `pnpm --filter client test`        | Branding/copy smoke tests pass      |
| Client types        | `pnpm --filter client check-types` | Client pages/components typecheck   |
| Client build        | `pnpm --filter client build`       | Client build succeeds               |

## Cross-Plan References

| Type       | Blueprint                       | Relationship                                                                                            |
| ---------- | ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Upstream   | `showcase-hardening-100`        | Rebrand starts after critical reliability defects are fixed.                                            |
| Downstream | `ai-payload-intake-mapper`      | AI feature uses IngestLens naming and README/UI truth-state language.                                   |
| Downstream | `public-dataset-demo-ingestion` | Dataset-demo work should create and extend the canonical public dataset guide and pinned-fixture story. |

### Cross-Plan Notes

- (Fx5) Blueprint names are already consistent across `showcase-hardening-100`,
  `rebrand-ingestlens`, `ai-payload-intake-mapper`, and
  `public-dataset-demo-ingestion`; no rename cascade is needed.
- (Fx2, Fx5) `docs/guides/public-dataset-demo.md` is the canonical guide path owned by
  `public-dataset-demo-ingestion`; this blueprint should only prepare README
  copy/link expectations and must not create a second demo guide.

## Edge Cases and Error Handling

| Edge Case                                           | Risk   | Solution                                                                                                   | Task          |
| --------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- | ------------- |
| Brand rename breaks deployed resources              | Medium | Separate public copy rename from worker resource rename and document any deferment. (Fx1)                  | 1.2           |
| README/demo work conflicts with other rebrand edits | Medium | Keep all README truth-state work in 1.1 and only README link wiring in 2.1. (Fx4)                          | 1.1, 2.1      |
| UI copy lands without regression coverage           | Medium | Add first-pass Vitest smoke tests before changing shell/page copy. (Fx3)                                   | 1.3, 2.2, 2.3 |
| Demo guide path drifts from downstream plans        | Medium | Reference `docs/guides/public-dataset-demo.md` consistently and avoid a second demo-guide path. (Fx2, Fx5) | 2.1           |
| Overclaiming AI/product scope                       | High   | Keep shipped/partial/planned labels and explicit non-goals in README/demo copy. (Fx1)                      | 1.1, 2.1      |
| Cleanup deletes template artifacts blindly          | Medium | Review each tracked `.new` file before deletion; delete only redundant copies. (Fx4)                       | 1.4           |

## Non-goals

- No legal trademark clearance.
- No full package/workspace rename unless low-risk.
- No full visual design system.
- No paid branding tooling or SaaS analytics.

## Risks

| Risk                                       | Impact | Mitigation                                                                          |
| ------------------------------------------ | ------ | ----------------------------------------------------------------------------------- |
| Rebrand consumes implementation time       | Medium | Prioritize first-screen docs/UI and keep every task XS-S sized. (Fx4)               |
| Internal package/resource names remain old | Low    | Accept if not publicly visible; document intentional deferrals. (Fx1)               |
| Brand polish outruns product truth         | High   | Gate all public copy with shipped/partial/planned labels and demo caveats. (Fx1)    |
| New UI copy breaks unnoticed               | Medium | Add smoke coverage before copy changes and keep client verification explicit. (Fx3) |

## Technology Choices

| Component             | Technology / asset                             | Version  | Why                                                                                                      |
| --------------------- | ---------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| Brand                 | `IngestLens`                                   | N/A      | Clear product wedge; no obvious exact-match collision found.                                             |
| Verification commands | Root + client `pnpm` scripts                   | Existing | Repo already defines exact audit/build/test commands; blueprint now references them directly. (Fx1)      |
| UI smoke coverage     | Client Vitest (`apps/client/vitest.config.ts`) | Existing | Test harness exists even though committed test files do not yet; add minimal smoke coverage first. (Fx3) |
| Demo guide path       | `docs/guides/public-dataset-demo.md`           | New      | Shared path owned by the public-dataset blueprint for README linkage and demo extension. (Fx2, Fx5)      |
| Docs rules            | Existing markdown/frontmatter checks           | Existing | Minimal, reviewable rebrand that still respects repo audits.                                             |

## Refinement Summary

**Date:** 2026-04-25

### What is already done (partially completed since blueprint was authored 2026-04-23)

- **Client smoke test files exist:** `apps/client/src/components/brandingShell.test.tsx`, `apps/client/src/pages/landingDashboardCopy.test.tsx`, and `apps/client/src/pages/deliveryRailsCopy.test.tsx` are all committed. Task 1.3 (Fx3) and Tasks 2.2/2.3 test scaffolding are in place. Additional test files found: `metricsBrandingCopy.test.tsx`, `Intake.test.tsx`, `AdminIntake.test.tsx`, `ServerMetrics.test.tsx`, `useDataLoading.test.tsx`, `App.test.tsx` — the "no committed client tests" finding in F3 is now stale.
- **`docs/guides/public-dataset-demo.md` exists:** The F2 finding ("false") is resolved — the file is present. Task 2.1's framing as "future link placeholder" may be fully or largely done.
- **ADR README exists:** `docs/adrs/README.md` confirmed present, along with a new ADR `0004-ingestlens-ai-intake-architecture.md` that already uses IngestLens naming.
- **`docs/research/product/VISION.md` exists:** confirmed present.
- **All target files for Task 1.1 exist:** `README.md`, `docs/architecture.md`, `docs/delivery-guarantees.md`, `docs/scale-considerations.md` all present.
- **All target files for Task 1.4 exist:** `docs/project/ROADMAP.md`, `AGENTS.md`, `docker-compose.yml`, `.env.example` all present.
- **Client `vitest.config.ts` confirmed:** exists at `apps/client/vitest.config.ts`.
- **Client pages and components confirmed:** `NavBar.tsx`, `Sidebar.tsx`, `Index.tsx`, `Dashboard.tsx`, `Queues.tsx`, `Topics.tsx` all present at the paths specified in Tasks 1.3, 2.2, 2.3.

### What remains

- **Worker name in `wrangler.toml` was `node-pubsub`:** Renamed to `ingest-lens` (completed). The deployed worker names are now `ingest-lens-dev` and `ingest-lens-prd`.
- **`.new` files are only in worktrees, not in the main tree:** All `*.new` files found live under `.worktrees/client-route-code-splitting/` and `.worktrees/showcase-hardening-100/`, not in the main working tree. Task 1.4's delete list targets main-tree paths (`AGENTS.md.new`, `.agent/.../*.new`, etc.). These do not currently exist in the main tree — Task 1.4 should skip those deletes or confirm the files are already gone.
- **README/docs rebrand copy (Task 1.1):** Cannot confirm content state without reading files; assumed outstanding pending `showcase-hardening-100` gate.
- **`docs/adrs/README.md` brand language (Task 1.2):** Needs review for stale `node-pubsub` references.
- **`docs/research/product/VISION.md` brand language (Task 1.2):** Needs review.
- **Client page copy (Tasks 2.2, 2.3):** Test files exist but whether the implementation copy passes those tests is unverified.

### Stale / corrected tasks

- **F3 finding is stale:** Client tests now exist. Remove the "no committed client tests" caveat from Fx3 language. Tasks 1.3, 2.2, 2.3 should verify the existing test files pass rather than create them from scratch — the `Create:` entries in those tasks are already satisfied.
- **F2 finding is stale:** `docs/guides/public-dataset-demo.md` now exists. Task 2.1's "label as planned until guide exists" instruction is outdated; the guide is present and Task 2.1 only needs to verify the README link is correct.
- **Task 1.4 `.new` file deletes:** All `.new` files listed are in worktree paths, not the main tree. Executor should confirm absence before attempting delete; no destructive action needed if files are already absent.
- **`docs/adrs/README.md` — confirm it does not still reference `docs/adrs/` as an ADR index vs decisions directory:** The repo uses both `docs/adrs/` and `docs/decisions/`; Task 1.2 should note this dual structure.

### Blueprint compliant: Yes
