---
type: blueprint
title: "IngestLens: shared reusable deploy workflow alignment cleanup"
owner: ozby
status: completed
complexity: S
created: "2026-06-09"
last_updated: "2026-06-11"
progress: "100% (completed 2026-06-11)"
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

# IngestLens: shared reusable deploy workflow alignment cleanup

**Goal:** Clean up the remaining truth-state drift after shared reusable deploy
workflow adoption already landed: bootstrap docs, blueprint lifecycle wording,
and the now-unused unscoped `webpresso` dev dependency.

## Completion summary

- Updated README / CONTRIBUTING bootstrap guidance to the current repo-local
  `vp install` + `pnpm exec wp ...` contract.
- Removed the unused root `webpresso` dev dependency while keeping the live
  `@webpresso/agent-kit` surface.
- Reconciled the blueprint record with the already-live thin caller workflows.
- Refreshed `blueprints/README.md` so the current-state summary is truthful.

## Acceptance

- [x] Bootstrap/operator docs describe current truth.
- [x] Root package keeps only load-bearing shared dependencies.
- [x] No blueprint still claims future first-time workflow adoption.
- [x] README blueprint summary matches the actual lifecycle state.

## Verification

- `wp lint`
- `wp typecheck`
- `wp test --file vitest.config.ts`
- `wp audit blueprint-lifecycle`
- `wp audit cloudflare-deploy-contract`
