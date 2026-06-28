---
type: blueprint
owner: ozby
title: "Lightweight version automation"
status: completed
completed_at: "2026-06-28"
complexity: S
created: "2026-06-18"
last_updated: "2026-06-28"
progress_pct: 100
progress: "100% (release-lane skip rules, shared workflow SHA refresh, and workflow contract assertions aligned on the branch)"
depends_on: []
---

# Lightweight version automation

## Goal

- Keep `Version Packages` automation green without re-running heavy PR-only validation that feature branches already proved.

## Architecture governance

- [`docs/architecture.md`](../../docs/architecture.md)
- [`docs/architecture.contract.json`](../../docs/architecture.contract.json)

## Architecture before

- `changeset-release/main` PRs still executed heavy preview/e2e/security lanes.
- generated `Version Packages` merges on `main` could rerun mutation/e2e work and still pointed part of the deploy surface at older reusable workflow callers.

## Architecture after

- generated release automation keeps lightweight integrity checks on the PR.
- heavy product-validation lanes stay with feature branches, and production/preview deploy callers share the current `webpresso/github-actions` surface.

## Tasks

- Skip heavy PR workflows for `changeset-release/main`.
- Skip heavy main-push mutation/e2e jobs for generated `Version Packages` merges.
- Align preview/production reusable workflow callers to `webpresso/github-actions`.
- Refresh shared reusable workflow SHAs to the Node-24-safe release proven in ozby.dev.

#### [ci] Task 1.1: Lighten version automation workflow lanes

**Status:** done

**Depends:** None

- prove heavy feature-validation lanes already exist on feature branches
- skip duplicate release-automation PR checks
- keep release/deploy callers on the current shared reusable workflow surface
- bump shared preview/production/release reusable workflow pins to the validated Node-24-safe SHA

## Verification

- Workflow contract tests cover the skip rules and shared reusable workflow pins.
- `wp audit blueprint-lifecycle`
- `wp audit architecture-drift --root .`
- Targeted workflow caller verification passes after the shared SHA refresh.

## Current completion evidence

- Previously landed workflow changes already present on current `main`/this branch:
  - `.github/workflows/e2e.yml` skips generated `Version Packages` pushes and `changeset-release/main` PRs
  - `.github/workflows/deploy-preview.yml` and `.github/workflows/security-scan.yml` skip generated release PR lanes
  - `.github/workflows/release.yml` already uses the Node-24-safe shared reusable workflow SHA
- Final delta completed by this branch:
  - `.github/workflows/ci.yml` now aligns its PR preview caller to the same Node-24-safe shared SHA `ba439b2d66ece6f16d3e7fee34bdee3ac5c987c0`
  - `test/ci-workflow-contract.test.ts` and `test/reusable-deploy-workflows.test.ts` now assert the current workflow shape instead of the stale caller assumptions
- Contract verification passed locally on 2026-06-28:
  - `node --test test/ci-workflow-contract.test.ts test/reusable-deploy-workflows.test.ts`
  - `vp run --filter @repo/e2e test -- --run src/e2e-runner-contract.test.ts src/e2e-suite-manifest.test.ts`
  - `vp run --filter client test -- --run src/App.test.tsx`
  - `wp typecheck`
