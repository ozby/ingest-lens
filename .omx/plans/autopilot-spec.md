# Autopilot Spec — Hard-cut detach from Webpresso Agent Kit

## Task

Detach this repo from Webpresso Agent Kit and related Webpresso-owned config/tooling with zero backward compatibility.

## Desired outcome

- No live runtime/tooling/config dependence on `@webpresso/*`
- No `ak` command surface in package scripts, hooks, workflows, or active docs
- Repo-owned replacements only where behavior is still needed
- No shape-preserving shims, aliases, or local rebrands of the old package structure

## Constraints

- Repo is not live yet; prefer philosophy-aligned deletion over migration comfort
- No new external dependencies unless strictly necessary
- Keep historical research artifacts only if clearly excluded from live-convention residue gates

## Core decisions

- One atomic hard cut
- Keep Lore commit-message validation, but make it repo-owned
- Keep catalog-drift validation, but make it repo-owned
- Keep mutation testing only where already justified, but make config repo-owned

## Must-delete surfaces

- `agent-kit.config.ts`
- `apps/e2e/src/agent-kit-host-adapter.ts`
- `apps/e2e/src/agent-kit-host-adapter.test.ts`
- `packages/test-utils/src/tests/agent-kit-surface.test.ts`
- `.agent-kit-packs/*`
- all `@webpresso/*` manifest entries
- all `ak` references in active package scripts/hooks/workflows/docs/specs
- `scripts/probes/consistency-lab/p15-repo-ak-cli.ts`

## Must-replace surfaces

- preload-error recovery helper in client bootstrap
- bundle-budget validator
- docs frontmatter validator
- blueprint lifecycle validator
- Lore commit-message validator
- catalog-drift validator
- direct repo-owned E2E command surface
- repo-owned TS/Vitest/Stryker config

## Verification end-state

- zero-residue grep clean for active surfaces
- `pnpm why @webpresso/agent-kit` and sibling packages fail
- lint/typecheck/test/build green
- direct E2E invocation green
