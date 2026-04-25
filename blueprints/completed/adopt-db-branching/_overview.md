---
type: blueprint
status: completed
complexity: S
created: "2026-04-25"
last_updated: "2026-04-25"
progress: "100% — merged to main on 2026-04-25"
depends_on: []
tags:
  - neon
  - e2e
  - testing
  - webpresso
  - refactor
  - deduplication
---

# Adopt `@webpresso/db-branching` — standardise Neon E2E branch interface

**Goal:** Wrap `packages/neon/src/branches.ts` behind the vendor-agnostic
`BranchProvider` interface from `@webpresso/db-branching`, so E2E scripts and
future CI tooling talk to a stable contract rather than a Neon-specific API.
Eliminates the `EphemeralBranch` type (renamed to `Branch` upstream) and aligns
with the cross-repo standard that Webpresso has established for
the branch-per-test-run pattern.

## Planning Summary

- **Why now:** `@webpresso/db-branching` was just extracted from the Webpresso
  monorepo as a standalone public package. It defines `BranchProvider`,
  `Branch` (was `EphemeralBranch`), `BranchConfig`, and a clear
  `createBranch / deleteBranch / resetBranch / getConnectionUri` interface.
  ingest-lens's `packages/neon` already implements exactly this contract under
  different names (`createEphemeralBranch`, `deleteEphemeralBranch`, etc.).
  Adopting the standard interface means future CLI tooling, CI helpers, and
  cross-project scripts can treat the provider as a black box.
- **Scope:**
  1. Add `@webpresso/db-branching` to the workspace catalog.
  2. Create `NeonBranchProvider implements BranchProvider` in `packages/neon/src/`
     by wrapping the existing `createEphemeralBranch`, `deleteEphemeralBranch`,
     and `getNeonConfig` implementations.
  3. Update `packages/neon/src/index.ts` to export `NeonBranchProvider` alongside
     the existing exports (backwards-compatible for now).
  4. Update E2E scripts (`apps/e2e/scripts/db-branch-*.ts`) to use
     `NeonBranchProvider` and the `Branch` type.
  5. Rename `NeonBranch` → `Branch` (re-export the upstream type); keep
     `NeonBranch` as a deprecated alias until the next clean-up cycle.
- **What is NOT changed:** The underlying Neon API calls in `branches.ts` are
  untouched — this is a wrapper/interface layer, not a rewrite. `getNeonConfig`,
  `isNeonAvailable`, `generateBranchName` stay as-is.
- **Primary success metric:** E2E CI workflow passes unchanged; `db-branch-create.ts`
  and `db-branch-delete.ts` use `NeonBranchProvider.createBranch()` and
  `deleteBranch()` respectively; `NeonBranch` type is gone from call sites.

## Architecture Overview

```text
Before                                After
──────────────────────────────────    ──────────────────────────────────────────────
apps/e2e/scripts/                     apps/e2e/scripts/
  db-branch-create.ts                   db-branch-create.ts
    createEphemeralBranch(config) ─▶     provider.createBranch(config)
    type: NeonBranch              ─▶     type: Branch (from @webpresso/db-branching)

packages/neon/src/
  branches.ts  (unchanged internals)
  provider.ts  (NEW)
    class NeonBranchProvider implements BranchProvider {
      createBranch()  → createEphemeralBranch()
      deleteBranch()  → deleteEphemeralBranch()
      resetBranch()   → (no-op; Neon reset is destructive by default)
      getConnectionUri() → branch.connectionUri
    }
  index.ts  (adds NeonBranchProvider export)

@webpresso/db-branching (shared interface, no Neon specifics)
  BranchProvider
  Branch
  BranchConfig
```

## Key Decisions

1. **Thin wrapper, not rewrite** — `NeonBranchProvider` delegates 100% to existing
   `branches.ts` internals. Zero risk of changing Neon API behaviour.

2. **Keep old exports for one cycle** — `createEphemeralBranch`,
   `deleteEphemeralBranch`, `NeonBranch` stay exported from `packages/neon/src/index.ts`
   until a follow-up clean-up blueprint removes them. No hard cut here because the
   E2E scripts are the only consumers and they will be updated in this blueprint.

3. **`resetBranch` is a no-op** — Neon's reset is destructive (drops and recreates).
   The ingest-lens branch-per-test pattern never resets; branches are created and
   deleted. `resetBranch` should throw `Error("not implemented")` to avoid silent
   data loss if called accidentally.

## Quick Reference (Execution Waves)

| Wave              | Tasks           | Dependencies | Parallelizable | Effort |
| ----------------- | --------------- | ------------ | -------------- | ------ |
| **Wave 0**        | 2.1             | None         | 1 agent        | XS     |
| **Wave 1**        | 2.2             | 2.1          | 1 agent        | S      |
| **Wave 2**        | 2.3, 2.4        | 2.2          | 2 agents       | XS     |
| **Critical path** | 2.1 → 2.2 → 2.3 | 3 waves      | —              | S      |

**Worktree:** `.worktrees/adopt-db-branching/` on branch `pll/adopt-db-branching`.

### Phase 1: Interface layer [Complexity: S]

#### [infra] Task 2.1: Add `@webpresso/db-branching` to workspace

**Status:** pending

**Depends:** None

Add to `pnpm-workspace.yaml` catalog:

```yaml
"@webpresso/db-branching": "github:webpresso/db-branching#main"
```

Add to `packages/neon/package.json` dependencies:

```json
"@webpresso/db-branching": "catalog:"
```

Run `pnpm install`. Verify `pnpm --filter @repo/neon check-types` passes.

**Files:**

- Edit: `pnpm-workspace.yaml`
- Edit: `packages/neon/package.json`

**Acceptance:**

- [ ] `import type { BranchProvider, Branch } from "@webpresso/db-branching"` resolves

---

#### [neon] Task 2.2: Create `NeonBranchProvider`

**Status:** pending

**Depends:** 2.1

Create `packages/neon/src/provider.ts`:

```typescript
import type { Branch, BranchConfig, BranchProvider } from "@webpresso/db-branching";
import { createEphemeralBranch, deleteEphemeralBranch } from "./branches.ts";
import type { NeonConfig } from "./config.ts";

export class NeonBranchProvider implements BranchProvider {
  constructor(private readonly config: NeonConfig) {}

  async createBranch(config?: BranchConfig): Promise<Branch> {
    const branch = await createEphemeralBranch(this.config, {
      name: config?.name,
      parentBranchId: config?.parentBranchId,
    });
    return { id: branch.id, connectionUri: branch.connectionUri };
  }

  async deleteBranch(branchId: string): Promise<void> {
    await deleteEphemeralBranch(this.config, branchId);
  }

  resetBranch(_branchId: string): Promise<void> {
    throw new Error("NeonBranchProvider.resetBranch: not implemented — Neon reset is destructive");
  }

  async getConnectionUri(branchId?: string): Promise<string> {
    if (!branchId) throw new Error("NeonBranchProvider.getConnectionUri: branchId required");
    const branch = await createEphemeralBranch(this.config, { name: `get-uri-${branchId}` });
    return branch.connectionUri;
  }
}
```

Add `NeonBranchProvider` export to `packages/neon/src/index.ts`.

Write `packages/neon/src/provider.test.ts` with mocked `createEphemeralBranch` /
`deleteEphemeralBranch` calls, verifying the delegation contract.

**Files:**

- Create: `packages/neon/src/provider.ts`
- Create: `packages/neon/src/provider.test.ts`
- Edit: `packages/neon/src/index.ts`

**Acceptance:**

- [ ] `NeonBranchProvider` implements `BranchProvider` (TypeScript structural check)
- [ ] `resetBranch` throws with a clear error message
- [ ] Tests pass

---

#### [e2e] Task 2.3: Update E2E branch scripts

**Status:** pending

**Depends:** 2.2

Update `apps/e2e/scripts/db-branch-create.ts`, `db-branch-delete.ts`,
`db-branch-list.ts`, `db-branch-cleanup.ts` to construct a `NeonBranchProvider`
and call `provider.createBranch()` / `provider.deleteBranch()` etc.
Replace `NeonBranch` type with `Branch` from `@webpresso/db-branching`.

**Files:**

- Edit: `apps/e2e/scripts/db-branch-create.ts`
- Edit: `apps/e2e/scripts/db-branch-delete.ts`
- Edit: `apps/e2e/scripts/db-branch-list.ts`
- Edit: `apps/e2e/scripts/db-branch-cleanup.ts`

**Acceptance:**

- [ ] Scripts still produce same stdout JSON shape as before
- [ ] No direct `createEphemeralBranch` calls remain in `apps/e2e/`

---

#### [cleanup] Task 2.4: Deprecation markers

**Status:** pending

**Depends:** 2.2

Add `@deprecated — use NeonBranchProvider.createBranch()` JSDoc to
`createEphemeralBranch` and `deleteEphemeralBranch` in `branches.ts`.
Add `/** @deprecated use Branch from @webpresso/db-branching */` to the
`NeonBranch` type alias.

**Files:**

- Edit: `packages/neon/src/branches.ts`
- Edit: `packages/neon/src/types.ts` (or wherever `NeonBranch` is defined)

**Acceptance:**

- [ ] IDE shows deprecation warnings on old call sites
- [ ] `check-types` still passes

## Verification Gates

```bash
pnpm --filter @repo/neon check-types   # 0 errors
pnpm --filter @repo/neon test          # all pass
pnpm --filter @repo/e2e check-types    # 0 errors (if e2e has check-types)
pnpm catalog:check                     # no drift
```

## Cross-Plan References

| Type    | Blueprint                | Relationship                     |
| ------- | ------------------------ | -------------------------------- |
| Sibling | `adopt-workers-test-kit` | Independent; can run in parallel |
| Sibling | `bump-agent-kit`         | Independent; can run in parallel |

## Non-goals

- Rewriting `branches.ts` internals (Neon API calls)
- Removing `createEphemeralBranch` / `deleteEphemeralBranch` exports (deferred)
- Adding a different database branching provider (Planetscale, etc.)

## Risks

| Risk                                      | Mitigation                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------- |
| `@webpresso/db-branching` not yet on npm  | Install via `github:webpresso/db-branching#main`; update pointer if/when published     |
| `NeonBranch` shape diverges from `Branch` | `NeonBranch` only has `id` and `connectionUri` as required — exact match with `Branch` |

## Technology Choices

- `@webpresso/db-branching` — vendor-agnostic branch interface from webpresso
- `NeonBranchProvider` — thin wrapper; no new runtime dependencies
