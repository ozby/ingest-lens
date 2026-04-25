---
type: blueprint
status: completed
complexity: M
created: "2026-04-25"
last_updated: "2026-04-25"
progress: "100% — merged to main on 2026-04-25"
depends_on: []
tags:
  - workers
  - testing
  - webpresso
  - refactor
  - deduplication
---

# Adopt `@webpresso/workers-test-kit` — replace hand-rolled test mocks

**Goal:** Replace the 158-line `apps/workers/src/tests/helpers.ts` mock layer
(and duplicated equivalents in `apps/lab/`) with `@webpresso/workers-test-kit`,
which provides production-grade `BaseWorkerEnv`, `createMockEnv<T>`,
`createMockExecutionContext`, `createMockHyperdrive`, `createMockDurableObjectNamespace`,
`createAuthenticatedRequest`, and `setupWorkerTest<T>` as a shared library.
Eliminates ~200 lines of custom mock code that drifts silently when CF bindings evolve.

## Planning Summary

- **Why now:** `@webpresso/workers-test-kit` is newly published in `webpresso/`.
  ingest-lens already has the exact same pattern — hand-rolled `createMockEnv`,
  `createMockExecutionContext`, `mockHyperdrive` — spread across
  `apps/workers/src/tests/helpers.ts` (158 lines, 25 mock call-sites) and
  `apps/lab/src/routes/*.test.ts`. Centralising removes maintenance burden and
  ensures CF type upgrades propagate automatically.
- **Scope:**
  1. Add `@webpresso/workers-test-kit` to the catalog and relevant packages.
  2. Refactor `apps/workers/src/tests/helpers.ts`: extend `BaseWorkerEnv`
     with the `Env` type from `db/client.ts`; replace inline `createMockHyperdrive`
     / `createMockDurableObjectNamespace` / `createMockEnv` with the kit's generics.
     Keep ingest-lens-specific builders (`buildSelectChain`, `buildUpdateChain`,
     `createAuthRequest`, etc.) — those are not in scope for removal.
  3. Do the same for `apps/lab/src/` test env factories if they duplicate CF mocks.
  4. Delete dead code (inline mock factories that the kit now covers).
- **What stays:** All chain builders (`buildSelectChain`, `buildUpdateChain`,
  `buildUnboundedSelectChain`), auth helpers (`bypassAuth`, `createAuthRequest`),
  and `deepFreeze` (already in `@repo/test-utils`). These are ingest-lens-specific
  and have no equivalent in the kit.
- **Primary success metric:** `pnpm --filter @repo/workers test` stays green,
  `pnpm --filter @repo/lab test` stays green, and `apps/workers/src/tests/helpers.ts`
  no longer defines its own Hyperdrive/DO/ExecutionContext mock factories.

## Architecture Overview

```text
Before                          After
──────────────────────────────  ──────────────────────────────────────────────
apps/workers/src/tests/         apps/workers/src/tests/
  helpers.ts                      helpers.ts  ← keeps chain builders + auth helpers
    createMockEnv()      ─ rm      (no inline CF mock factories)
    createMockHyperdrive ─ rm
    createMockDO()       ─ rm
    buildSelectChain()   ─ keep ─▶ still in helpers.ts

@webpresso/workers-test-kit (shared)
  createMockEnv<T>()      ◀── imported by helpers.ts
  createMockHyperdrive()  ◀── imported by helpers.ts
  createMockDurableObjectNamespace() ◀──
  createMockExecutionContext() ◀──
  createAuthenticatedRequest() ◀──
```

## Key Decisions

1. **Extend `BaseWorkerEnv` rather than replace `Env`** — `workers-test-kit`'s
   `createMockEnv<T>` is a generic that accepts any type extending `BaseWorkerEnv`.
   The ingest-lens `Env` type adds `JWT_SECRET`, `DELIVERY_QUEUE`, `RATE_LIMITER`,
   `AUTH_RATE_LIMITER`, `TOPIC_ROOMS`, `KV`, `AI`, `ANALYTICS`. These override the
   test env via `createMockEnv<IngestLensEnv>({ JWT_SECRET: "test-secret", ... })`.
   The `Env` type in `db/client.ts` does NOT need to extend `BaseWorkerEnv` — that
   is test-only infrastructure.

2. **Keep `deepFreeze` in `@repo/test-utils`** — already extracted in the
   consistency-lab lanes. Do not move to workers-test-kit.

3. **Lab tests** — `apps/lab/src/routes/*.test.ts` define inline env objects with
   `null as unknown as Queue` casts. Replace with `createMockEnv<LabEnv>()` from
   the kit + lab-specific overrides. This is a secondary pass (Phase 2) after the
   workers helpers are refactored.

## Quick Reference (Execution Waves)

| Wave              | Tasks                 | Dependencies | Parallelizable | Effort |
| ----------------- | --------------------- | ------------ | -------------- | ------ |
| **Wave 0**        | 1.1                   | None         | 1 agent        | XS     |
| **Wave 1**        | 1.2                   | 1.1          | 1 agent        | S      |
| **Wave 2**        | 1.3, 1.4              | 1.2          | 2 agents       | S      |
| **Wave 3**        | 1.5                   | 1.3, 1.4     | 1 agent        | XS     |
| **Critical path** | 1.1 → 1.2 → 1.3 → 1.5 | 4 waves      | —              | M      |

**Worktree:** `.worktrees/adopt-workers-test-kit/` on branch `pll/adopt-workers-test-kit`.

### Phase 1: Workers helpers refactor [Complexity: S]

#### [infra] Task 1.1: Add `@webpresso/workers-test-kit` to workspace

**Status:** pending

**Depends:** None

Add to the `catalog:` in `pnpm-workspace.yaml`:

```yaml
"@webpresso/workers-test-kit": "github:webpresso/workers-test-kit#main"
```

Add to `apps/workers/package.json` `devDependencies`:

```json
"@webpresso/workers-test-kit": "catalog:"
```

Run `pnpm install`. Verify `pnpm --filter @repo/workers check-types` passes.

**Files:**

- Edit: `pnpm-workspace.yaml`
- Edit: `apps/workers/package.json`

**Acceptance:**

- [ ] `pnpm --filter @repo/workers check-types` passes after install
- [ ] `import { createMockEnv } from "@webpresso/workers-test-kit"` resolves

---

#### [workers] Task 1.2: Refactor `apps/workers/src/tests/helpers.ts`

**Status:** pending

**Depends:** 1.1

Replace inline CF mock factories with imports from `@webpresso/workers-test-kit`.
Define `type WorkerTestEnv = Env` and update `createMockEnv` to call
`kitCreateMockEnv<WorkerTestEnv>({ JWT_SECRET: "test-secret", DELIVERY_QUEUE: ..., ... })`.

Remove:

- Local `createMockExecutionContext` — use kit's
- Local Hyperdrive mock — use kit's `createMockHyperdrive`
- Local DO namespace mock — use kit's `createMockDurableObjectNamespace`

Keep:

- `buildSelectChain`, `buildUpdateChain`, `buildUnboundedSelectChain`
- `bypassAuth`, `createAuthRequest`, `createRequest`, `get`, `post`, `put`, `del`
- `deepFreeze` (re-exported from `@repo/test-utils`)

**Files:**

- Edit: `apps/workers/src/tests/helpers.ts`

**Steps (TDD):**

1. Run `pnpm --filter @repo/workers test` — all green (baseline)
2. Replace factories, re-run — must stay green
3. Confirm zero `null as any` env construction remains

**Acceptance:**

- [ ] No inline `mockResolvedValue` Hyperdrive chains remain in helpers.ts
- [ ] `createMockEnv` calls the kit's generic; does not define its own mock factories
- [ ] All 217 `@repo/workers` tests still pass

---

#### [workers] Task 1.3: Update all workers test files

**Status:** pending

**Depends:** 1.2

Any test file importing helpers that now have changed signatures may need minor
updates. Run type check and fix any breakage. No logic changes expected — only
import path or signature updates if the kit's API differs slightly.

**Files:**

- Edit: `apps/workers/src/tests/*.test.ts` (as needed)

**Acceptance:**

- [ ] 217/217 `@repo/workers` tests pass
- [ ] 0 type errors

---

#### [lab] Task 1.4: Refactor `apps/lab` env factories

**Status:** pending

**Depends:** 1.1

`apps/lab/src/routes/run.test.ts` and `stream.test.ts` define inline env objects
with `{} as unknown as Queue` casts. Replace with
`createMockEnv<LabEnv>({ LAB_SESSION_SECRET: "...", LAB_RUN_TOKEN: "...", ... })`
from the kit.

Add `@webpresso/workers-test-kit` to `apps/lab/package.json` devDependencies.

**Files:**

- Edit: `apps/lab/package.json`
- Edit: `apps/lab/src/routes/run.test.ts`
- Edit: `apps/lab/src/routes/stream.test.ts`
- Edit: `apps/lab/src/middleware/kill-switch.test.ts` (if applicable)

**Acceptance:**

- [ ] No `null as unknown as` env casts remain in lab test files
- [ ] 75/75 `@repo/lab` tests pass

---

#### [cleanup] Task 1.5: Delete dead code

**Status:** pending

**Depends:** 1.3, 1.4

Remove any functions in `helpers.ts` that are now fully replaced by the kit and
have zero remaining call sites. Run `pnpm --filter @repo/workers lint` and
`pnpm --filter @repo/lab lint` to confirm no unused exports.

**Acceptance:**

- [ ] `ak audit catalog-drift` passes
- [ ] 0 unused exports in `helpers.ts` (verified via oxlint)

## Verification Gates

```bash
pnpm --filter @repo/workers check-types  # 0 errors
pnpm --filter @repo/workers lint         # 0 errors
pnpm --filter @repo/workers test         # 217 pass
pnpm --filter @repo/lab check-types      # 0 errors
pnpm --filter @repo/lab test             # 75 pass
pnpm catalog:check                       # no drift
```

## Cross-Plan References

| Type    | Blueprint            | Relationship                     |
| ------- | -------------------- | -------------------------------- |
| Sibling | `adopt-db-branching` | Independent; can run in parallel |
| Sibling | `bump-agent-kit`     | Independent; can run in parallel |

## Non-goals

- Replacing chain builders or auth helpers — those are ingest-lens domain logic
- Changing test patterns (TDD, deepFreeze conventions) — stays the same
- Updating `packages/lab-core` tests — those use different test patterns (Vitest + DO miniflare)

## Risks

| Risk                                                                                                           | Mitigation                                                                                      |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `workers-test-kit` is not yet published to npm — only installable via GitHub                                   | Use `github:webpresso/workers-test-kit#main` in catalog; if it moves to npm, update the pointer |
| Kit's `BaseWorkerEnv` has different defaults than ingest-lens (e.g. `ENVIRONMENT: "test"` vs no `ENVIRONMENT`) | Only matters in type surface; `createMockEnv<IngestLensEnv>` fully overrides defaults           |

## Technology Choices

- `@webpresso/workers-test-kit` via GitHub dependency (not yet on npm registry)
- All kit mocks are `vi.fn()`-based — compatible with existing vitest setup
