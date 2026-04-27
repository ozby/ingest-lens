# Autopilot Implementation Plan — Hard-cut detach from Webpresso Agent Kit

## Lane A — Dependency + command severance

- Remove all `@webpresso/*` deps from manifests
- Remove `.agent-kit-packs/*`
- Replace root/package `ak` scripts with repo-owned scripts
- Rewrite hooks/workflows to call repo-owned scripts

## Lane B — Runtime + E2E severance

- Delete Agent Kit config/host adapter/test surface
- Replace client `installChunkLoadRecovery` import with local helper
- Replace `ak e2e` with direct repo-owned command path

## Lane C — Config ownership hard cut

- Add repo-root TS/Vitest/Stryker shared config
- Rewrite workspace config consumers
- Avoid local package rebrands

## Lane D — Docs/specs/conventions rewrite

- Rewrite `AGENTS.md`, `README.md`, `apps/e2e/README.md`, lore protocol references, active blueprint/docs references, tool-derived surfaces that remain supported
- Remove or rewrite `.agent/` and `.gemini/` active convention references

## Verification

1. repo-owned validators green
2. package scripts/husky/workflows no longer invoke `ak`
3. `rg` zero-residue gate clean on active surfaces
4. `pnpm why` absence checks fail for all `@webpresso/*`
5. lint/typecheck/test/build green
6. direct E2E full suite green
