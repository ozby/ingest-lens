---
type: blueprint
status: completed
complexity: L
created: "2026-04-21"
last_updated: "2026-04-22"
progress: "0% (drafted)"
depends_on: []
tags:
  - tooling
  - build
  - migration
  - vite-plus
---

# Vite Plus migration (replace Turbo)

**Goal:** Replace Turbo as the monorepo task runner with Vite Plus (`vp`),
aligning the build/test/lint fan-out with a single toolchain that already
owns dev server, bundler, and test runner.

## Planning Summary

- **Why now:** Turbo is a black-box caching layer over many tools. Vite Plus collapses build + test + typecheck + lint fan-out into one binary (`vp`) on top of the Vite graph. Fewer moving parts, less cache invalidation surface, one config language.
- **Scope:** Replace every `turbo run <task>` at the repo root and in each workspace with `vp run <task>`. Remove `turbo.json`. Add `vite-plus` to the pnpm catalog and pin via pnpm `overrides`.
- **Out of scope:** Replacing Vitest itself (we already use it), rewriting individual workspace `vite.config.ts` files unless the migration requires it.

## Architecture Overview

```text
before:                              after:
  root package.json                    root package.json
    scripts.dev = turbo run dev          scripts.dev = vp run dev
    scripts.build = turbo run build      scripts.build = vp run build
    scripts.test = turbo run test        scripts.test = vp run test
  turbo.json (task graph + cache)       (no turbo.json)
  .turbo/cache/                         .vite/ (per-package)
  devDependencies: turbo                devDependencies: vite-plus
                                        overrides:
                                          vite   -> @voidzero-dev/vite-plus-core
                                          vitest -> @voidzero-dev/vite-plus-test
```

## Fact-Checked Findings

| ID  | Severity | Claim                                       | Reality                                                                                                                                                                      | Fix in this blueprint                                                                 |
| --- | -------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| F1  | HIGH     | Vite Plus is a drop-in for Turbo            | Partial. `vp run` fans out scripts, but parallelism semantics differ; Turbo's `dependsOn` graph must be re-expressed through package-level dependencies and `vp run --deps`. | Rewrite `turbo.json` pipeline in terms of pnpm workspace deps + `vp run` flags.       |
| F2  | HIGH     | Caching parity is automatic                 | No. Vite Plus uses per-package Vite cache; there is no remote cache equivalent to Turbo's.                                                                                   | Document accepted caching downgrade; add Nx-style remote cache only if measured need. |
| F3  | MEDIUM   | Overriding `vite`/`vitest` globally is safe | Works because reference repo does it (`overrides.vite -> npm:@voidzero-dev/vite-plus-core@<v>`), but it must match the `vite-plus` version exactly.                          | Pin `vite-plus`, `vite`, and `vitest` together via catalog + overrides.               |

## Evidence Base

- reference repo reference repo: `[reference repo]`, `pnpm-workspace.yaml`, and workspace `package.json` files (`"qa": "vp run typecheck && vp run test"`).
- Current Turbo surface: `./turbo.json` and root scripts in `package.json`.

## Task Pool

### Phase 1: Spike and baseline [Complexity: S]

#### [spike] Task 1.1: Baseline current Turbo command surface

**Status:** pending **Depends:** None

Capture the exact Turbo pipeline and all per-workspace `turbo` references so the migration is reversible.

**Files:**

- Create: `blueprints/planned/vite-plus-migration/research/turbo-surface.md`

**Steps (TDD):**

1. Enumerate every `turbo` invocation (`turbo.json`, root scripts, workspace scripts).
2. Record the dependency graph implied by `turbo.json#pipeline[*].dependsOn`.
3. Record the current cold and warm timings for `pnpm qa`.

**Acceptance:**

- [ ] Surface doc lists every `turbo` call site.
- [ ] Timings recorded so after-migration parity can be measured.

### Phase 2: Toolchain swap [Complexity: M]

#### [deps] Task 2.1: Add vite-plus to the pnpm catalog

**Status:** pending **Depends:** Task 1.1 **Blocked:** pnpm-catalogs-adoption blueprint must land first so the catalog exists.

**Files:**

- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`

**Steps (TDD):**

1. Add `vite-plus: 0.1.18` (or current) to the `catalog:` block.
2. Add pnpm `overrides` pinning `vite` and `vitest` to the matching `@voidzero-dev/*` shims.
3. Add `vp` devDependency at the root.

**Acceptance:**

- [ ] `pnpm install` completes without peer warnings.
- [ ] `pnpm exec vp --version` prints the expected version.

#### [refactor] Task 2.2: Swap root scripts from `turbo run` to `vp run`

**Status:** pending **Depends:** Task 2.1

**Files:**

- Modify: `package.json`
- Delete: `turbo.json`
- Modify: every workspace `package.json` that contains `turbo` scripts.

**Acceptance:**

- [ ] `pnpm qa` runs end-to-end against `vp`.
- [ ] No remaining `turbo` references in any `package.json` or `*.yml`.
- [ ] CI green on a PR branch.

### Phase 3: Hardening [Complexity: S]

#### [qa] Task 3.1: Parity check and rollback recipe

**Status:** pending **Depends:** Task 2.2

**Files:**

- Create: `docs/migrations/vite-plus.md`
- Modify: `README.md`

**Acceptance:**

- [ ] Parity table (cold/warm timings before vs. after) attached.
- [ ] Rollback recipe (restore `turbo.json`, revert scripts) documented.

## Verification Gates

| Gate    | Command                          | Success Criteria                        |
| ------- | -------------------------------- | --------------------------------------- |
| Install | `pnpm install --frozen-lockfile` | No peer warnings, lockfile stable       |
| Build   | `pnpm build`                     | All workspaces build via `vp run build` |
| Test    | `pnpm test`                      | Every suite runs via `vp run test`      |
| Types   | `pnpm check-types`               | Zero errors                             |
| Lint    | `pnpm lint`                      | Zero violations                         |

## Cross-Plan References

| Type       | Blueprint                | Relationship                |
| ---------- | ------------------------ | --------------------------- |
| Upstream   | `pnpm-catalogs-adoption` | Catalog must exist first    |
| Downstream | `ci-hardening`           | CI caching strategy changes |

## Non-goals

- Rewriting individual `vite.config.ts` files per workspace.
- Replacing Vitest.
- Introducing a remote cache.

## Risks

| Risk                             | Impact | Mitigation                                                                |
| -------------------------------- | ------ | ------------------------------------------------------------------------- |
| Cold-start regression            | Medium | Measure in Task 1.1 and Task 3.1                                          |
| `overrides` drift breaks install | High   | Pin `vite-plus`, `vite`, `vitest` versions in lockstep                    |
| Dev workflow disruption          | Medium | Keep `pnpm dev` as the canonical command; only the implementation changes |

## Technology Choices

| Component      | Technology                                                     | Version             | Why                                                              |
| -------------- | -------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------- |
| Task runner    | Vite Plus (`vp`)                                               | 0.1.x               | Unified dev/build/test/lint fan-out over the existing Vite graph |
| Override shims | `@voidzero-dev/vite-plus-core`, `@voidzero-dev/vite-plus-test` | matches `vite-plus` | Required for `vite` / `vitest` catalog replacement               |

## Refinement Summary (2026-04-22 pass — updated)

**Status: COMPLIANT — execution-ready.**

Findings:

- `pnpm-catalogs-adoption` is already partially landed; Task 2.1 blocker reduced to "preceded" (catalog expansion → add vite-plus).
- **vite-plus v0.1.x** pre-1.0 risk acknowledged. **User decision: commit — proceed with v0.1.18.**
- `turbo.json` exists and is unremarkable — diff is mostly `package.json` script swaps. Migration scope is S–M.
- Hard-cut applies: `turbo.json` is deleted in the same commit as `vp` scripts land. No legacy coexistence.

Fixes applied:

- Resolved open Q (pre-1.0 commit-now vs park) — user confirmed: commit.
- Reduced Task 2.1 block severity from "blocked" to "preceded".

**Blueprint compliant: Yes.**
