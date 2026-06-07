---
type: blueprint
title: "IngestLens: public runtime-env npm adoption"
owner: ozby
status: in-progress
complexity: S
created: "2026-06-07"
last_updated: "2026-06-07"
progress: "90% (public package cutover verified; blueprint lifecycle audit blocked by local hook-surface diagnostic)"
depends_on:
  - "webpresso/framework: codex/framework-db-public-facades"
tags:
  - ingest-lens
  - runtime-env
  - npm
  - no-link-protocol
---

# IngestLens: public runtime-env npm adoption

**Goal:** Replace the temporary local-link boundary for the shared runtime-env
core with the published `@webpresso/runtime-env@0.1.0` package, then prove
IngestLens can install and verify from public npm without `link:` dependency
metadata.

## Architecture governance

Architecture docs:

- [`docs/architecture.md`](../../docs/architecture.md)
- [`docs/architecture.contract.json`](../../docs/architecture.contract.json)

## Architecture before

IngestLens carried a local `@repo/runtime-env-local` package for
consumer-specific secret-manager integration and consumed the framework
`@webpresso/runtime-env` core through a temporary local-link boundary while the
framework package was being prepared for public npm. The repo also pinned
`@webpresso/agent-kit` to the older `0.28.0` tarball, which did not satisfy the
current wrapper/typecheck subpath contract.

## Architecture after

```text
IngestLens
  ├── @repo/runtime-env-local           # consumer-owned secret manager layer
  ├── @webpresso/runtime-env@0.1.0      # public npm core package
  └── @webpresso/agent-kit@0.29.1       # public npm wrapper/config package
```

The local package remains the IngestLens-owned adapter for Doppler/Infisical
selection, while the provider-neutral runtime context/profile core resolves
from the public Webpresso npm package.

## Key Decisions

| Decision                    | Choice                                                                            | Rationale                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Core runtime package source | `@webpresso/runtime-env@0.1.0` from npm                                           | Remote CI can install it without local framework links.                                                |
| Local adapter boundary      | Keep `@repo/runtime-env-local` as `workspace:*`                                   | It is consumer-owned behavior and intentionally remains in this repo.                                  |
| Wrapper package floor       | Bump `@webpresso/agent-kit` catalog to the published `0.29.1` tarball             | Current wrapper/typecheck gates require the published subpath export fixes from the agent-kit release. |
| Lockfile proof              | Keep `pnpm-lock.yaml` resolving public Webpresso packages with registry integrity | Ensures fresh clones do not require local framework or agent-kit checkouts.                            |

## Quick Reference (Execution Waves)

| Wave   | Tasks    | Dependencies           | Parallelizable |
| ------ | -------- | ---------------------- | -------------- |
| Wave 0 | 1.1      | Published npm packages | 1 agent        |
| Wave 1 | 2.1, 2.2 | 1.1                    | 1 agent        |

### Phase 1: Dependency source cutover [Complexity: S]

#### [deps] Task 1.1: Verify public package resolution

**Status:** done

**Depends:** `@webpresso/runtime-env@0.1.0` and `@webpresso/agent-kit@0.29.1` are visible on npm.

Confirm that root catalog metadata and lockfile entries resolve the shared
Webpresso packages to public npm versions, not local `link:` or `file:`
specifiers.

**Files:**

- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`
- Inspect: `package.json`
- Inspect: `infra/package.json`
- Inspect: `apps/e2e/package.json`
- Inspect: `packages/runtime-env-local/package.json`

**Acceptance:**

- [x] `@webpresso/runtime-env` catalog entry is `0.1.0`.
- [x] `@webpresso/agent-kit` catalog entry uses the published `0.29.1` tarball.
- [x] Public npm pack probe for `@webpresso/runtime-env@0.1.0` succeeds.
- [x] No package manifest uses `link:` or `file:` for `@webpresso/runtime-env`.

### Phase 2: Consumer verification [Complexity: S]

#### [qa] Task 2.1: Run focused install and package checks

**Status:** done

**Depends:** Task 1.1

Run the narrow checks that prove a fresh dependency graph can consume the
published packages without framework or agent-kit local checkouts.

**Acceptance:**

- [x] Public npm pack/install probe for `@webpresso/runtime-env@0.1.0` succeeds.
- [x] Repo install command completes without rewriting the runtime-env source back to a local link.
- [x] Lockfile resolves `@webpresso/agent-kit@0.29.1` and `@webpresso/runtime-env@0.1.0` from public npm.

#### [qa] Task 2.2: Run no-link and focused runtime-env verification

**Status:** done

**Depends:** Task 2.1

Use repo-owned wrappers to verify that the published dependency works for the
local runtime-env adapter and that dependency metadata does not contain
forbidden local protocols.

**Acceptance:**

- [x] No-link protocol audit passes.
- [x] Focused runtime-env test exits 0.
- [x] Typecheck passes.
- [x] Lint passes.

## Verification Gates

| Gate                  | Command / proof                                                      | Success criteria                       |
| --------------------- | -------------------------------------------------------------------- | -------------------------------------- |
| npm package           | `npm pack @webpresso/runtime-env@0.1.0`                              | Tarball downloads from npmjs.          |
| Install graph         | repo install command                                                 | Lockfile remains on registry versions. |
| No local protocols    | `wp audit no-link-protocol`                                          | Zero dependency metadata violations.   |
| Runtime adapter tests | `wp test --file src/index.test.ts` from `packages/runtime-env-local` | Exits 0.                               |
| Type safety           | `wp typecheck`                                                       | Zero errors.                           |
| Lint                  | `wp lint`                                                            | Zero errors.                           |

## Current evidence (2026-06-07)

- PASS — `npm pack @webpresso/runtime-env@0.1.0 --registry=https://registry.npmjs.org --@webpresso:registry=https://registry.npmjs.org`
- PASS — `PNPM_IGNORE_SCRIPTS=true vp install` preserved public package catalog/lockfile sources
- PASS — `wp audit no-link-protocol --json` → `checked: 15`, `violations: []`
- PASS — `wp typecheck`
- PASS — `wp lint`
- PASS — `cd packages/runtime-env-local && wp test --file src/index.test.ts` exited `0`; Vite emitted an upstream sourcemap warning for `@webpresso/agent-kit` but the focused test passed.

## Cross-Plan References

| Type       | Blueprint                                                 | Relationship                                                           |
| ---------- | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| Upstream   | `webpresso/framework` `codex/framework-db-public-facades` | Publishes the provider-neutral runtime-env core.                       |
| Upstream   | `webpresso/agent-kit@0.29.1`                              | Supplies the public wrapper/config subpath exports used by IngestLens. |
| Downstream | IngestLens CI                                             | Fresh remote CI installs from npm instead of local framework links.    |

## Non-goals

- Replacing the IngestLens-owned `@repo/runtime-env-local` adapter.
- Changing secret-manager selection semantics.
- Changing deploy lanes or Cloudflare/Pulumi infrastructure.

## Risks

| Risk                                       | Impact                                                  | Mitigation                                                                                           |
| ------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| npm visibility lag                         | Install checks fail despite publish completing          | Verify `npm pack @webpresso/runtime-env@0.1.0` before pushing.                                       |
| Local workspace links misread as forbidden | False-positive cleanup of intentional monorepo packages | Only forbid local protocols for external published package metadata; keep `@repo/*` workspace links. |
| Upstream sourcemap omission                | Noisy test output from agent-kit config setup           | Record as upstream package warning; rely on command exit status for focused test proof.              |

## Open closeout note

- BLOCKED — `wp audit blueprint-lifecycle --json` is currently stopped by the local pretool diagnostic `wp-pretool-guard is unavailable` before the audit executes, even after `wp setup --yes` refreshed global `@webpresso/agent-kit@0.29.1` and exposed `wp-pretool-guard` on PATH. Do not bypass; rerun once the hook surface is healthy.
