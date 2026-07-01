---
type: blueprint
owner: webpresso
title: "Runtime env local adapter upstream migration"
status: completed
complexity: M
created: "2026-07-01"
last_updated: "2026-07-01"
completed_at: "2026-07-01"
progress_pct: 100
progress: "Completed: replaced local runtime-env adapter with published @webpresso/runtime-env@0.3.0, deleted the workspace package, and verified affected gates."
depends_on:
  - "@webpresso/runtime-env@0.3.0"
---

# Runtime env local adapter upstream migration

## Status

Completed — 2026-07-01

## Context

`@webpresso/runtime-env@0.3.0` now publishes the generic secret-selection, schema-v1 secrets config, secret-manager adapters and secrets-backed runtime resolver APIs that were duplicated in `packages/runtime-env-local`.

## Scope

- Replace `@repo/runtime-env-local` imports with `@webpresso/runtime-env`.
- Configure the upstream secrets runtime with Ingest Lens required CI secret keys.
- Delete `packages/runtime-env-local` and its workspace dependencies.
- Update docs/agent instructions that describe the former local adapter.

## Tasks

#### Task 1.1: Update runtime-env dependency surface

**Status:** done

**Depends:** None

Updated package manifests, catalog, and lockfile to consume `@webpresso/runtime-env@0.3.0` from the published package surface.

**Files:**

- `package.json`
- `infra/package.json`
- `apps/e2e/package.json`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`

**Acceptance:**

- [x] `@repo/runtime-env-local` is removed from live package manifests.
- [x] `@webpresso/runtime-env` resolves through the catalog at `0.3.0`.

#### Task 1.2: Replace local adapter imports

**Status:** done

**Depends:** Task 1.1

Replaced runtime-env-local imports in deploy and e2e secret loading code with `createSecretsRuntimeEnv`, keeping Ingest Lens required-secret keys as local configuration.

**Files:**

- `infra/src/deploy/runtime-env.ts`
- `apps/e2e/scripts/e2e-with-neon.ts`

**Acceptance:**

- [x] Deploy secret loading uses the published runtime-env resolver.
- [x] E2E Neon secret loading uses the published runtime-env resolver.
- [x] Required CI secret short-circuit keys remain explicit and local.

#### Task 1.3: Delete local workspace package

**Status:** done

**Depends:** Task 1.2

Deleted `packages/runtime-env-local` after its generic behavior moved upstream.

**Files:**

- `packages/runtime-env-local/**`

**Acceptance:**

- [x] The local runtime-env adapter workspace package is removed.
- [x] No live tracked source imports or package manifests reference the deleted package.

#### Task 1.4: Update contracts and verification gates

**Status:** done

**Depends:** Task 1.3

Updated docs, the agent package map, CI targeted tests, and the stale hook-contract test, then verified affected quality gates.

**Files:**

- `README.md`
- `CLAUDE.md`
- `AGENTS.md`
- `.github/workflows/ci.yml`
- `apps/e2e/src/global-wp-contract.test.ts`
- `apps/e2e/journeys/client-surfaces.spec.ts`
- `infra/package.json`

**Acceptance:**

- [x] Docs describe direct published runtime-env consumption.
- [x] CI no longer invokes the deleted package test.
- [x] Hook-contract tests assert managed/user-owned commit-msg sections rather than removed commit-message enforcement.
- [x] Typecheck, lint, test, TPH, and guardrail checks pass.

## Non-goals

- No secret material changes.
- No changes to deploy profile names beyond preserving existing behavior.

## Acceptance criteria

- No tracked source imports or package manifests reference `@repo/runtime-env-local`.
- `@webpresso/runtime-env` catalog resolves to `0.3.0` or newer.
- Typecheck, lint, and tests pass for affected workspace packages.

## Verification evidence

- PASS — `vp install` resolved `@webpresso/runtime-env@0.3.0` and removed the local workspace package from the lockfile.
- PASS — `vp run --filter @repo/infra check-types`.
- PASS — `vp run --filter @repo/e2e check-types`.
- PASS — `vp run --filter @repo/infra test`.
- PASS — `vp run --filter @repo/e2e test`.
- PASS — `vp fmt --check`.
- PASS — `vp run lint`.
- PASS — `vp run test`.
- PASS — `vp run typecheck`.
- PASS — `wp audit tph`.
- PASS — `wp audit guardrails --affected` skipped because no affected files matched the guardrail set.

## Notes

The migration also added the missing `"type": "module"` marker to `infra/package.json` so its ESM-only shared Vitest config loads under Vite/Vitest, and updated the stale e2e global hook contract test to assert the managed/user-owned commit-msg hook contract instead of removed Lore commit enforcement.
