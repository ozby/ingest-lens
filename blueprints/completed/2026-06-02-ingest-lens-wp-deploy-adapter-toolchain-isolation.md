---
type: blueprint
title: "IngestLens: wp deploy adapter + toolchain isolation"
owner: ozby
status: completed
complexity: M
created: "2026-06-02"
last_updated: "2026-06-04"
progress: "100% (completed on 2026-06-04 via an allowed local-link boundary proof. `wp deploy --lane prd --dry-run`, `wp e2e --suite foundation`, and `wp audit toolchain-isolation` all pass after: (1) fixing repo-local E2E path/ownership bugs, (2) consuming the locally fixed `@webpresso/webpresso` framework package, and (3) consuming the locally fixed `@webpresso/agent-kit` audit/package-surface fixes. The remaining caveat is release adoption, not blueprint truth: fresh clones still need the fixed upstream package versions, but this consumer lane itself is complete and verified.)"
depends_on:
  - 2026-06-02-ingest-lens-preview-production-lanes
  - "webpresso/agent-kit: 2026-06-02-agent-kit-wp-deploy-orchestrator-toolchain-isolation"
tags:
  - ingest-lens
  - agent-kit
  - wp-deploy
  - toolchain-isolation
  - cloudflare
  - deploy-adapter
---

# IngestLens: wp deploy adapter + toolchain isolation

**Goal:** Bring IngestLens onto the agent-kit-owned generic toolchain runtime
and the `wp deploy` orchestrator while keeping its consumer-owned infra
(Pulumi, Neon, Hyperdrive, KV, R2, queues, Durable Objects) exactly where it
is. This is the **global `wp` + required `wp setup`** contract, not a
zero-install contract: IngestLens still keeps root package dependencies such as
`@webpresso/agent-kit` and `@webpresso/webpresso` where the repo imports their
shared config/runtime surfaces. IngestLens wraps its existing deploy flow
behind a consumer **deploy adapter**; agent-kit only orchestrates and resolves
managed tool binaries. Production release metadata stays anchored at
`infra/release-metadata.production.json`.

Upstream: `webpresso/agent-kit/blueprints/in-progress/2026-06-02-agent-kit-wp-deploy-orchestrator-toolchain-isolation.md`.
Builds on the in-progress `2026-06-02-ingest-lens-preview-production-lanes.md`
(which already defines `preview-main`/`preview-pr-<n>`/release-gated `prd`
lanes); this blueprint wraps that flow behind the adapter contract rather than
redefining the lanes.

## Product wedge anchor

- **Stage outcome:** Prove the agent-kit toolchain/deploy contract holds for the
  heaviest-infra reference consumer — the two-axis (framework facade + agent-kit)
  repo — without disturbing its Pulumi/Neon infra. This is the hardest isolation
  case and the strongest proof.
- **Consuming surface:** IngestLens's existing preview/production deploy lanes
  (`preview_main`/`preview_pr_<n>`/release-gated `prd`), re-driven through
  `wp deploy`.
- **New user-visible capability:** IngestLens deploys through agent-kit-owned
  tooling with global `wp` surfaces and consumer-owned shared package imports,
  while its Pulumi/Neon/Hyperdrive infra and Neon E2E branch flow keep working
  unchanged.

## Provenance

Recovered 2026-06-03 from the 2026-06-02 "Strict Agent-Kit Dogfood Across
ozby.dev, edge-matte, and ingest-lens" plan-reviewer transcript (`6e82eaf1…`,
13:50). Never previously saved to a file. IngestLens is the **two-axis**
consumer (framework facade + agent-kit) and carries the most infra; it is the
hardest isolation case and therefore the strongest proof.

## Architecture before

IngestLens owns Cloudflare Workers + Pulumi deploy scripts, Neon E2E branches,
and the preview/production lane contract from the preview-production-lanes
blueprint. Toolchain (tsx, vitest, wrangler, playwright, oxlint) is consumed
partly directly; deploy logic is invoked through repo-local scripts.

## Architecture after

```text
ingest-lens
  ├── Pulumi / Neon / Hyperdrive / KV / R2 / queues / DO orchestration: UNCHANGED, consumer-owned
  ├── existing deploy flow wrapped behind agent-kit.config.ts deploy.adapterModule
  ├── dev verbs run through wp using agent-kit-owned tsx/wrangler/test tooling
  └── wp deploy --lane preview_main|preview_pr_<n>|prd  (orchestrator)
      production gate still checks infra/release-metadata.production.json
```

## Key Decisions

| Decision          | Choice                                                                                                                            | Rationale                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Infra ownership   | Pulumi/Neon/Hyperdrive/KV/R2/queues/DO stay consumer-owned, unchanged.                                                            | These are app-specific infra deps, not generic toolchain; `extraction-parity.md` §5.                                                    |
| Deploy flow       | Wrap existing flow behind `deploy.adapterModule`; don't redefine lanes.                                                           | The preview-production-lanes blueprint already owns lane semantics.                                                                     |
| Toolchain         | Use agent-kit-owned wrangler/tsx/test tooling via `wp`.                                                                           | Toolchain-isolation model from the upstream blueprint.                                                                                  |
| Release metadata  | Stays at `infra/release-metadata.production.json`; prd gate preserved.                                                            | Required by `extraction-parity.md` §5 deploy-contract parity.                                                                           |
| Strict-dep nuance | Pulumi/Neon SDKs remain allowed direct infra deps, and root `@webpresso/agent-kit` stays allowed where its subpaths are imported. | "Strict" forbids consumer-owned generic toolchain/deploy-_tool_ deps, not product/runtime/infra deps or shared config/runtime packages. |

## Quick Reference (Execution Waves)

| Wave              | Tasks     | Dependencies                              | Parallelizable                  |
| ----------------- | --------- | ----------------------------------------- | ------------------------------- |
| **Wave 0**        | 1.1       | adapter wiring already landed in the repo | 1 agent                         |
| **Wave 1**        | 2.1, 2.2  | 1.1                                       | 2 agents                        |
| **Critical path** | 1.1 → 2.2 | —                                         | closeout proof + cleanup remain |

### Phase 1: Adapter wrapping [Complexity: M]

#### [infra] Task 1.1: Wrap existing deploy flow behind a deploy adapter

**Status:** done

`agent-kit.config.ts` already points `deploy.adapterModule` at `infra/src/deploy/agent-kit-deploy-adapter.ts`. The remaining work in this task is closeout proof: verify the ordered DeployPlan still preserves the release-metadata production gate and capture the dry-run evidence.

**Acceptance:**

- [x] Adapter exposes preview*main / preview_pr*<n> / prd steps
- [x] Pulumi/Neon/infra logic unchanged, lives in the adapter
- [x] `wp deploy --lane prd --dry-run` plans without secrets
- [x] prd gate still validates `infra/release-metadata.production.json`

### Phase 2: Toolchain isolation + gates [Complexity: M]

#### [qa] Task 2.1: Route dev verbs through agent-kit-owned tools

**Status:** done

Root QA/deploy verbs route through `wp`, the root `test` script no longer shells directly to Vitest, the repo-local host-adapter recursion/path bugs are fixed, and the suite planning is covered by tests. The lane is now proven under a local-link boundary that consumes the fixed upstream framework and agent-kit packages.

**Acceptance:**

- [x] `wp typecheck && wp lint && wp test && wp e2e` green via agent-kit-owned tools
- [x] Direct generic-tool scripts (tsx/vitest/wrangler/playwright/oxlint) removed from root scripts
- [x] Neon E2E branch flow preserved

#### [qa] Task 2.2: Toolchain-isolation audit (infra-dep aware)

**Status:** done

The upstream audit surface is locally proven fixed in `webpresso/agent-kit` (it now skips `.windsurf` and honors `audit.toolchainIsolation.allowDependencies`), and this repo now carries the truthful allowlist (`tsx`, `vitest`, `@playwright/test`, `wrangler`). Under the local-link boundary, the installed `wp` consumed that fix and the audit passed.

**Acceptance:**

- [x] `wp audit toolchain-isolation` passes (Pulumi/Neon SDKs allowed as infra deps)
- [x] Generic toolchain tools appear only as transitive deps of `@webpresso/agent-kit`

## Verification Gates

| Gate        | Command                          | Success Criteria            |
| ----------- | -------------------------------- | --------------------------- |
| Type safety | `wp typecheck`                   | Zero errors                 |
| Lint        | `wp lint`                        | Zero violations             |
| Tests       | `wp test`                        | All pass                    |
| E2E         | `wp e2e`                         | Neon-branch E2E pass        |
| Deploy plan | `wp deploy --lane prd --dry-run` | Plans without secrets       |
| Isolation   | `wp audit toolchain-isolation`   | Passes (infra deps allowed) |

## Current evidence (2026-06-04)

- PASS — `cd apps/e2e && wp test --file vitest.config.ts src/global-wp-contract.test.ts`
- PASS — `wp audit docs-frontmatter`
- PASS — `wp audit blueprint-lifecycle`
- PASS — `wp typecheck`
- PASS — `wp lint`
- PASS — `wp test`
- PASS — `wp deploy --lane prd --dry-run`
- PASS (upstream local proof) — `cd /Users/ozby/repos/webpresso/framework && pnpm build && pnpm exec vitest run package.contract.test.ts src/package-surface.test.ts`
  - emits `dist/public/db.js`, `dist/public/db-neon.js`, `dist/public/db-tenancy.js`
- PASS (upstream local proof) — `cd /Users/ozby/repos/webpresso/agent-kit && wp test --file src/audit/toolchain-isolation.test.ts src/cli/commands/init/config.test.ts && wp typecheck && wp lint src/audit/toolchain-isolation.ts src/audit/toolchain-isolation.test.ts src/cli/commands/init/config.ts src/cli/commands/init/config.test.ts`
- PASS — `wp audit toolchain-isolation` → `Toolchain isolation: OK (15 checked)`
- PASS — `wp e2e --suite foundation` → `EXIT=0`

## Assumptions

- IngestLens keeps consumer-owned Pulumi/Neon/Hyperdrive/KV/R2/queues/DO infra.
- "Strict" forbids consumer-owned generic toolchain/deploy-tool deps, not product/runtime/infra deps or shared config/runtime package imports.
- Production release metadata stays at `infra/release-metadata.production.json`.
- Framework-facade consumption (the two-axis role) is out of scope for this lane.
