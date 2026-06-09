---
type: blueprint
title: "IngestLens: shared reusable deploy workflow adoption"
owner: ozby
status: planned
complexity: M
created: "2026-06-09"
last_updated: "2026-06-09"
progress: "0% (planned)"
depends_on:
  - 2026-06-02-ingest-lens-preview-production-lanes
  - 2026-06-02-ingest-lens-wp-deploy-adapter-toolchain-isolation
tags:
  - ingest-lens
  - agent-kit
  - github-actions
  - cloudflare
  - deploy
---

# IngestLens: shared reusable deploy workflow adoption

**Goal:** Replace duplicated preview/production GitHub workflow shell logic with thin callers to the shared `agent-kit` reusable deploy harness while preserving IngestLens’s custom-domain preview lanes, PR preview cleanup, release-version production gate, and local Pulumi/Neon/Cloudflare orchestration.

## Planning Summary

- Current repo already has the desired lane semantics and local deploy adapter.
- The duplicated shell should move to `agent-kit`.
- The repo-specific verification and orchestration payload should remain local.

## Key Decisions

| Decision          | Choice                                           | Rationale                                                                                               |
| ----------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Lane semantics    | preserve existing preview/prod lane contract     | Already completed and documented as repo truth.                                                         |
| Production policy | preserve release-version gate                    | Existing production contract is load-bearing.                                                           |
| Secret model      | preserve provider-config-driven secret bootstrap | The repo already documents `wp config secrets` + `with-secrets -- <cmd>` as the authoritative contract. |

## Quick Reference (Execution Waves)

| Wave              | Tasks     | Dependencies | Parallelizable |
| ----------------- | --------- | ------------ | -------------- |
| **Wave 0**        | 1.1       | None         | 1 agent        |
| **Wave 1**        | 2.1       | Wave 0       | 1 agent        |
| **Critical path** | 1.1 → 2.1 | --           | 2 waves        |

### Phase 1: Thin caller migration [Complexity: M]

#### [infra] Task 1.1: Replace workflow shell with shared callers

**Status:** todo

**Depends:** None

Convert `deploy-preview.yml` and `deploy-production.yml` into thin callers to
the shared `agent-kit` reusable workflows by pinned SHA. Remove stale floating
action-version drift during the migration.

**Acceptance:**

- [ ] Preview caller still handles main push, PR deploy, manual lane, and PR close destroy
- [ ] Production caller still enforces release-version validation
- [ ] Shared workflow shell replaces duplicated setup/secret plumbing
- [ ] Deploy-workflow action pinning is normalized to immutable SHAs

### Phase 2: Preserve local orchestration and release contract [Complexity: M]

#### [qa] Task 2.1: Re-verify lane contract and production orchestration

**Status:** todo

**Depends:** Task 1.1

**Acceptance:**

- [ ] Existing deploy lane contract tests remain green
- [ ] Preview deploy/destroy behavior remains unchanged
- [ ] Production release gate and orchestration remain unchanged
- [ ] Shared harness uses caller repo `packageManager` metadata for pnpm bootstrap

## Verification Gates

| Gate            | Command                               | Success Criteria |
| --------------- | ------------------------------------- | ---------------- |
| Type safety     | `wp typecheck`                        | Zero errors      |
| Lint            | `wp lint`                             | Zero violations  |
| Tests           | `wp test --file vitest.config.ts`     | All pass         |
| Deploy contract | `wp audit cloudflare-deploy-contract` | Passes           |
| Lane proof      | existing deploy lane contract tests   | Pass             |

## Cross-Plan References

| Type     | Blueprint                                                      | Relationship                                      |
| -------- | -------------------------------------------------------------- | ------------------------------------------------- |
| Upstream | `agent-kit: reusable Cloudflare deploy workflows`              | Shared workflow shell owner                       |
| Upstream | `2026-06-02-ingest-lens-preview-production-lanes`              | Repo-local preview/prod semantics source of truth |
| Upstream | `2026-06-02-ingest-lens-wp-deploy-adapter-toolchain-isolation` | Existing adapter-backed deploy baseline           |

## Non-goals

- Changing preview/prod lane semantics
- Moving Pulumi/Neon/Cloudflare provider logic into `agent-kit`
- Replacing local deploy scripts with a universal deploy script
