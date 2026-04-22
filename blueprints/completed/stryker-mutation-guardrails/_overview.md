---
type: blueprint
status: completed
complexity: M
created: "2026-04-21"
last_updated: "2026-04-22"
progress: "100% (all phases complete)"
depends_on: []
tags:
  - quality
  - mutation-testing
  - stryker
  - ci
---

# Stryker mutation-testing guardrails

**Goal:** Add Stryker mutation testing with per-package score thresholds so
coverage passes that are "green-but-weak" become visible and fail CI. Treat
mutation score as a budget, not a vanity metric.

## Planning Summary

- **Why mutation scoring:** Line coverage rewards executing code; mutation scoring rewards _asserting_ about it. For an event-delivery platform (retries, idempotency, signatures), weak assertions are where incidents come from.
- **Scope:** Introduce `@stryker-mutator/core` + `@stryker-mutator/vitest-runner` + `@stryker-mutator/typescript-checker`. Start with per-package thresholds where mutation testing is fast and useful; add a CI gate that blocks drops.

## Architecture Overview

```text
root:
  scripts.mutation = vp run mutation     # (post vite-plus)
  catalog:
    "@stryker-mutator/core": ^9.6.x
    "@stryker-mutator/vitest-runner": ^9.6.x
    "@stryker-mutator/typescript-checker": ^9.6.x

per-package:
  stryker.config.ts
    thresholds:
      high: 80
      low: 70
      break: 65        # CI fails below this
    testRunner: "vitest"
    checkers: ["typescript"]
    mutate: ["src/**/*.ts", "!**/*.test.ts"]

.github/workflows/ci.yml
  job: mutation
    runs on changed packages only (nx-like affected-ish via git diff)
    uploads HTML report as artifact
```

## Fact-Checked Findings

| ID  | Severity | Claim                                    | Reality                                                                                                                  | Fix                                         |
| --- | -------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| F1  | HIGH     | Stryker works with Vitest out of the box | Yes via `@stryker-mutator/vitest-runner`.                                                                                | Use it.                                     |
| F2  | HIGH     | Mutation testing is too slow for CI      | Only if run monorepo-wide. Per-package with incremental mode (`--incremental`) keeps runs under 5 min for most packages. | Per-package configs + incremental mode.     |
| F3  | MEDIUM   | A single repo-wide threshold is useful   | Counter-productive — mature packages tolerate 85+, new packages can't meet it.                                           | Per-package thresholds; global floor of 65. |

## Evidence Base

- `[reference repo]`, `.../cli-wp/stryker.config.mjs`, `.../scripts/stryker.config.mjs`, `.../claude-hooks/stryker.config.mjs` (reference repo's reference configs; we will port the structure into `.ts` since Stryker ≥7 supports TypeScript configs).
- Catalog entries for Stryker in `[reference repo]`.

## Task Pool

### Phase 1: Pilot [Complexity: S]

#### [qa] Task 1.1: Pilot on one leaf package

**Status:** done **Depends:** None

**Files:**

- Create: `packages/<first-pilot>/stryker.config.ts`
- Modify: `packages/<first-pilot>/package.json`

**Acceptance:**

- [x] `pnpm --filter <first-pilot> mutation` runs end-to-end.
- [x] Baseline score recorded in the PR description.

### Phase 2: Fan out [Complexity: M]

#### [qa] Task 2.1: Add configs to every workspace with tests

**Status:** done **Depends:** Task 1.1

**Files:**

- Create: `apps/api-server/stryker.config.ts`
- Create: `apps/notification-server/stryker.config.ts`
- Create: `packages/*/stryker.config.ts`

**Acceptance:**

- [x] Every workspace with a test suite has a stryker config and a recorded baseline.

### Phase 3: CI gate [Complexity: M]

#### [ci] Task 3.1: Add mutation job that blocks below `break` threshold

**Status:** done **Depends:** Task 2.1

**Files:**

- Modify: `.github/workflows/ci.yml`
- Create: `scripts/affected-mutation.ts`

**Acceptance:**

- [x] CI job only runs mutation for packages changed in the diff.
- [x] Job fails when any package's score drops below its `break` threshold.
- [x] HTML report uploaded as a workflow artifact.

## Verification Gates

| Gate     | Command                          | Success                                     |
| -------- | -------------------------------- | ------------------------------------------- |
| Pilot    | `pnpm --filter <pilot> mutation` | Exit 0                                      |
| Full run | `pnpm mutation`                  | Exit 0                                      |
| CI gate  | `scripts/affected-mutation.ts`   | Exit 0 when changed packages meet threshold |

## Cross-Plan References

| Type       | Blueprint                | Relationship                             |
| ---------- | ------------------------ | ---------------------------------------- |
| Upstream   | `pnpm-catalogs-adoption` | Catalog entries for `@stryker-mutator/*` |
| Downstream | `ci-hardening`           | Registers the mutation gate              |

## Non-goals

- Running mutation testing on every push (only affected packages).
- Reaching a specific "industry" score — thresholds live in the config.

## Risks

| Risk                               | Impact | Mitigation                                        |
| ---------------------------------- | ------ | ------------------------------------------------- |
| Slow mutation runs burn CI minutes | Medium | `--incremental` mode + affected-only runner       |
| False-positive equivalent mutants  | Low    | Mark via `@stryker-mutator/api` ignore comments   |
| Developers bypass gate locally     | Low    | Pre-push hook runs mutation on changed files only |

## Technology Choices

| Component  | Technology                            | Version | Why                           |
| ---------- | ------------------------------------- | ------- | ----------------------------- |
| Mutator    | `@stryker-mutator/core`               | ^9.6.x  | Current stable                |
| Runner     | `@stryker-mutator/vitest-runner`      | ^9.6.x  | Matches repo test runner      |
| Type check | `@stryker-mutator/typescript-checker` | ^9.6.x  | Eliminates type-error mutants |

## Refinement Summary (2026-04-22 pass)

Findings:

- Pilot package: `packages/logger` — small, pure, no runtime deps, typechecks clean under tsgo.
- `@stryker-mutator/typescript-checker` uses `tsc` internally — **cannot** be swapped to `tsgo` today (Stryker has no tsgo adapter). Accept as noted exception to the "tsgo everywhere" directive.
- Final `break` threshold: **60** on pilot package; raise to **70** once all workspaces are covered.
- `scripts/affected-mutation.ts` path correct; uses `git diff --name-only` + `pnpm --filter ...{HEAD}` to scope.

Fixes applied:

- Committed pilot package to `packages/logger`.
- Committed break threshold: 60 → 70 progression.
- Clarified tsc-in-Stryker as accepted exception.

**Blueprint compliant: Yes**
