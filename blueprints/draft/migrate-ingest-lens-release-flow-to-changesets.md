---
type: blueprint
title: "Migrate ingest-lens release flow to Changesets"
status: draft
complexity: S
owner: ""
created: 2026-06-17
last_updated: 2026-06-17
---

## Product wedge anchor

- **Stage outcome:** All consumer repos (CLAUDE.md workspace open-sourcing roadmap) use identical Changesets-on-branch-push release mechanics — enabling automated Version PRs and deploy gating for ingest-lens production releases.
- **Consuming surface:** `gh pr merge` on the Changesets "Version Packages" PR triggers the automated deploy pipeline.
- **New user-visible capability:** Production deploys of ingest-lens are gated on a Version PR merge rather than a manual `git tag v*` push.

## Summary

Replace the tag-triggered `release.yml` (SBOM + provenance) with the Changesets-on-branch-push pattern used by `ozby/edge-matte`: `changesets-release.yml` + `cloudflare-production.yml` reusable workflows from `webpresso/github-actions`, bridged by a thin `gate` job. Add `@changesets/cli`, changeset scripts, sync/publish scripts, `.changeset/config.json`, and a regression test matching edge-matte's `test/reusable-deploy-workflows.test.ts`.

## Tasks

#### Task 1.1: Create changeset infrastructure files

**Status:** todo
**Wave:** 0
**Files:**

- `scripts/release-publish.ts` (copy verbatim from edge-matte)
- `scripts/sync-release-metadata-version.ts` (copy verbatim from edge-matte)
- `.changeset/config.json`
- `.changeset/changeset-release-alignment.md`

**Acceptance:**

- [ ] Scripts are `.ts` (no `.mjs`)
- [ ] `.changeset/config.json` has `privatePackages` and `baseBranch: "main"`
- [ ] Initial changeset targets `"ingest-lens": patch`

#### Task 1.2: Update `pnpm-workspace.yaml` and `package.json`

**Status:** todo
**Wave:** 0
**Files:**

- `pnpm-workspace.yaml` (add `"."` as first packages entry)
- `package.json` (version `0.0.0` → `0.1.0`; add changeset scripts; add `@changesets/cli`)

**Acceptance:**

- [ ] `pnpm-workspace.yaml` has `"."` as first entry
- [ ] `package.json` version is `"0.1.0"` (matches `infra/release-metadata.production.json`)
- [ ] Scripts `changeset`, `changeset:status`, `version`, `release:publish` present
- [ ] `@changesets/cli: "^2.29.5"` in devDependencies

#### Task 1.3: Replace `release.yml`

**Status:** todo
**Wave:** 0
**Files:**

- `.github/workflows/release.yml`

**Acceptance:**

- [ ] Triggers on `push: branches: [main]` (not `push: tags`)
- [ ] Three jobs: `release` → `gate` → `deploy`
- [ ] `release` uses `changesets-release.yml@3f0136f88a488bc0894ab81ab3c8544b2e8dabf2`
- [ ] `deploy` uses `cloudflare-production.yml@5bbbe43e6f152b802bcce655a8dadeb661f908b5`
- [ ] Permissions: `contents: write`, `pull-requests: write`, `packages: read`
- [ ] `install_command` mirrors `deploy-production.yml` GitHub Packages auth pattern

#### Task 1.4: Add regression test

**Status:** todo
**Wave:** 1 (after 1.1–1.3)
**Files:**

- `test/reusable-deploy-workflows.test.ts`

**Acceptance:**

- [ ] Asserts `release.yml` uses both reusable workflow SHAs
- [ ] Asserts `release.yml` has gate job + permissions block
- [ ] Asserts `package.json` version is `"0.1.0"` and has all changeset scripts
- [ ] Asserts `deploy-production.yml` stays `workflow_dispatch` (no `tags:`)
- [ ] Test passes: `node --import @webpresso/agent-kit/vitest/node ./node_modules/.bin/vitest run test/reusable-deploy-workflows.test.ts`
