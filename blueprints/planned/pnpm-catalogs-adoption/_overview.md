---
type: blueprint
status: completed
complexity: M
created: "2026-04-21"
last_updated: "2026-04-22"
progress: "0% (drafted)"
depends_on: []
tags:
  - tooling
  - dependency-management
  - pnpm
---

# pnpm catalogs adoption — expand coverage

**Goal:** Expand catalog coverage so **every** dep used in more than one
workspace is catalog-pinned, and named catalogs exist for Cloudflare-Workers
and tooling-only surfaces.

## Planning Summary

- **Current state (2026-04):** `pnpm-workspace.yaml` already declares a partial `catalog:` (types, React, Hono, Drizzle, Vitest, Zod, Turbo, TypeScript, tsgo preview, etc.) plus `catalogMode: prefer`, `cleanupUnusedCatalogs: true`, and `minimumReleaseAge: 60`. So catalogs are adopted — coverage is incomplete.
- **Why expand:** Every dep outside the catalog is a drift vector. Expanding catalog coverage closes that gap, enables safe `vite`/`vitest` override (prerequisite for the Vite Plus migration), and makes `catalogMode: prefer` actually meaningful.
- **Scope:** Audit the drift surface, move shared production deps still declared literally (eslint configs, logging, testing utilities, Stryker when it lands) into the default `catalog:`. Add a `catalogs.workers` named catalog once Cloudflare Workers land (blocked on `cloudflare-pulumi-infra` blueprint). Raise `minimumReleaseAge` to `86400` (1 day) and document the raise-to-7-day path.

## Architecture Overview

```text
pnpm-workspace.yaml
  packages: [...]
  catalog:          # default catalog
    react: ^19.x
    typescript: ^5.9
    vitest: ^4.1
    zod: ^4.x
  catalogs:
    workers:        # Cloudflare-Workers-specific
      "@cloudflare/workers-types": 4.20260113.0
      "@cloudflare/vitest-pool-workers": ^0.14.x
  minimumReleaseAge: 360
  cleanupUnusedCatalogs: true

each workspace package.json:
  "dependencies": {
    "react": "catalog:",
    "zod":   "catalog:"
  }
```

## Fact-Checked Findings

| ID  | Severity | Claim                                                          | Reality                                                                                                                                                     | Fix                           |
| --- | -------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| F1  | HIGH     | All workspaces use identical dep versions today                | Partial. Catalog exists and is enforced by `catalogMode: prefer`, but coverage is incomplete — production deps still declared literally are a drift vector. | Task 1.1 audits the gap.      |
| F2  | HIGH     | `minimumReleaseAge` blocks day-of-release supply-chain attacks | Currently set to `60` (seconds). Higher values (1 day, ideally 7 days) are much safer.                                                                      | Raise to `86400` in Task 2.1. |
| F3  | MEDIUM   | Catalog protocol is compatible with Vite Plus overrides        | Verified in reference repo — `overrides.vite -> npm:@voidzero-dev/vite-plus-core@<v>` works alongside `vite: catalog:`.                                     | Use the same pattern.         |

## Evidence Base

- `[reference repo]` (`catalog:`, `catalogs.workers:`, `minimumReleaseAge: 360`, `cleanupUnusedCatalogs: true`).
- Current workspace manifests under `apps/*/package.json` and `packages/*/package.json`.

## Task Pool

### Phase 1: Audit [Complexity: S]

#### [research] Task 1.1: Enumerate dependency drift across workspaces

**Status:** pending **Depends:** None

**Files:**

- Create: `blueprints/planned/pnpm-catalogs-adoption/research/drift-report.md`

**Steps (TDD):**

1. Script a `node` one-off that reads every workspace `package.json` and emits `{name, dep, version}` rows.
2. Group by `{dep}` and flag any dep with more than one version across the workspace.
3. Save the flagged list as the drift report.

**Acceptance:**

- [ ] Drift report lists every dep with ≥2 versions.
- [ ] Top 10 worst offenders ranked by number of consumers.

### Phase 2: Seed catalog [Complexity: M]

#### [config] Task 2.1: Add baseline `catalog:` to `pnpm-workspace.yaml`

**Status:** pending **Depends:** Task 1.1

**Files:**

- Modify: `pnpm-workspace.yaml`

**Acceptance:**

- [ ] Top-10 deps from the drift report live in `catalog:`.
- [ ] `pnpm-workspace.yaml` sets `minimumReleaseAge: 86400` and `cleanupUnusedCatalogs: true`.

#### [refactor] Task 2.2: Rewrite workspaces to use `catalog:`

**Status:** pending **Depends:** Task 2.1

**Files:**

- Modify: every `apps/*/package.json` and `packages/*/package.json` that lists a catalog-tracked dep.

**Acceptance:**

- [ ] `pnpm install` succeeds; lockfile hashes update.
- [ ] No workspace still declares a literal version for a catalog-tracked dep.

### Phase 3: Hardening [Complexity: S]

#### [qa] Task 3.1: Add a catalog-drift check to CI

**Status:** pending **Depends:** Task 2.2

**Files:**

- Create: `scripts/check-catalog-drift.ts`
- Modify: `.github/workflows/ci.yml`

**Acceptance:**

- [ ] Script fails if any workspace declares a literal version for a dep also in `catalog:`.
- [ ] CI gate named `catalog-drift` blocks merges on violations.

## Verification Gates

| Gate    | Command                                | Success |
| ------- | -------------------------------------- | ------- |
| Install | `pnpm install --frozen-lockfile`       | Clean   |
| Drift   | `bun ./scripts/check-catalog-drift.ts` | Exit 0  |

## Cross-Plan References

| Type       | Blueprint             | Relationship                        |
| ---------- | --------------------- | ----------------------------------- |
| Downstream | `vite-plus-migration` | Requires `vite`/`vitest` in catalog |
| Downstream | `ci-hardening`        | Registers drift gate                |

## Non-goals

- Auto-bumping deps (that's a separate Renovate blueprint).
- Moving dev-only tooling (prettier/oxlint) into catalog v1.

## Risks

| Risk                                                       | Impact | Mitigation                                    |
| ---------------------------------------------------------- | ------ | --------------------------------------------- |
| Catalog typo breaks every install                          | High   | PR gate runs `pnpm install --frozen-lockfile` |
| Workspaces silently pin older versions via transitive deps | Medium | Enable `pnpm overrides` for hot spots         |

## Technology Choices

| Component       | Technology                 | Version | Why                                       |
| --------------- | -------------------------- | ------- | ----------------------------------------- |
| Package manager | pnpm                       | 10.x    | Catalog protocol, workspace stability     |
| Catalog layout  | single default + `workers` | n/a     | Matches reference repo's proven structure |

## Refinement Summary (2026-04-22 pass)

Findings:

- **Partial execution complete:** catalog already declared in `pnpm-workspace.yaml` with `catalogMode: prefer` + `cleanupUnusedCatalogs: true` + `minimumReleaseAge: 60`. Top deps (`@types/node`, React, Vitest, Vite, Zod, Hono, Drizzle, TypeScript, tsgo preview) are catalog-pinned.
- **Still open:** workspaces-only deps (eslint configs, express, helmet, testing-library, tailwind, radix-ui) are declared literally. Drift surface remains real.
- **minimumReleaseAge** is still `60` seconds. Bumping to `86400` (1 day) should be the first landing action.
- `packages/foundation/` path referenced in the architecture sketch doesn't exist in this repo; renamed to `packages/oxlint-plugin-repo/` in repo-restrictions.md. Blueprint task files are unaffected.

Fixes applied:

- Marked F1 severity as partial-true rather than unknown.
- Already reframed Goal to "expand coverage" in prior pass.

**Blueprint compliant: Yes.** Execution-ready. Recommend this blueprint land first — it unblocks vite-plus-migration.
