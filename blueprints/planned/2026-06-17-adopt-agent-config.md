---
type: blueprint
title: "Adopt @webpresso/agent-config (migrate config specifiers)"
owner: ozby
status: planned
complexity: M
created: '2026-06-17'
last_updated: '2026-06-17'
progress: '0% (planned — BLOCKED on agent-kit major publish)'
depends_on: []
cross_repo_depends_on:
  - 'webpresso/agent-kit: 2026-06-17-extract-agent-config-package'
tags:
  - dependencies
  - config
  - agent-kit
  - migration
max_parallel_agents: 1
---

# Adopt `@webpresso/agent-config` (migrate config specifiers)

**Goal:** Switch every `@webpresso/agent-kit/<config>` specifier this repo imports
to `@webpresso/agent-config/<config>` after the binary-free config package is
extracted and a new agent-kit major is published. Keep `@webpresso/agent-kit` as a
dependency (still needed for the `wp` CLI and `@webpresso/agent-kit/local`).

> **BLOCKED:** depends on `webpresso/agent-kit` publishing `@webpresso/agent-config`
> + the agent-kit major that removes the moved exports. Do not merge until both are
> on GitHub Packages and the catalog can resolve them.

## Product wedge anchor

- **Stage outcome:** open-sourcing roadmap — ingest-lens is the two-axis reference
  consumer (framework facade + agent-kit). Proving the config-package adoption here
  is the integration test for "the extraction works for a 3rd party."
- **Consuming surface:** `tsconfig*.json` `extends`, `vitest.config.ts`,
  `stryker.config.ts` across the workspace.
- **New user-visible capability:** the repo's config imports name the config package,
  not the CLI package.

## Migration surface (verified 2026-06-17, ~34 references)

Rewrite `@webpresso/agent-kit/<g>` → `@webpresso/agent-config/<g>` for the moved
groups only:
- `tsconfig*.json` `"extends"` (~15): root `tsconfig.json`, `infra/tsconfig.json`,
  `scripts/tsconfig.json`, `packages/*/tsconfig.json`, `apps/*/tsconfig.json`
  (`tsconfig/base.json` and `tsconfig/cloudflare.json`).
- `vitest.config.ts` (~12): `vitest/node`, `vitest/react`, `vitest/workers`.
- `stryker.config.ts` (~6): `baseConfig`, `typescriptBaseConfig`, `typescriptWorkersBaseConfig`.

**Leave untouched:** `@webpresso/agent-kit/local` (`infra/src/deploy/runtime-env.ts:3`,
`apps/e2e/scripts/e2e-with-neon.ts:17`) and `agent-kit.config.ts` (CLI config file).

## Tasks

#### [deps] Task 1: Add `@webpresso/agent-config` to the catalog
**Status:** todo **Depends:** agent-kit major published
**Files:** `pnpm-workspace.yaml` (catalog entry, GitHub Packages), root `package.json`
(devDependency `catalog:`); bump `@webpresso/agent-kit` catalog pin to the new major.
**Acceptance:** [ ] both resolve from the registry [ ] `pnpm install` clean.

#### [config] Task 2: Rewrite specifiers (tsconfig / vitest / stryker)
**Status:** todo **Depends:** 1
Scripted `rg`+sed by category; verify each rewrite. Do NOT touch `/local` or
`agent-kit.config.ts`.
**Files:** the ~34 references listed above.
**Acceptance:** [ ] only the 4 moved groups rewritten [ ] `/local` unchanged [ ] `pnpm -r check-types && pnpm -r test` green [ ] `wp audit catalog-drift` clean [ ] full CI mirror green.

## Verification

Run inside this repo: `pnpm -r check-types && pnpm -r test`; full mirror
(`pnpm -r lint && pnpm lint:repo && pnpm -r check-types && pnpm -r test && pnpm docs:check && pnpm blueprints:check`).
Wait for full CI before admin-merge.
