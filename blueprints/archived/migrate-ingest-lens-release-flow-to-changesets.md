---
type: blueprint
title: "Migrate ingest-lens release flow to Changesets"
status: archived
complexity: S
owner: ozby
created: 2026-06-17
last_updated: 2026-07-02
progress: "Superseded: fresh origin/main already runs a Changesets-gated release/deploy contract, and this draft's version/SHA/file-copy expectations are stale."
---

# Migrate ingest-lens release flow to Changesets

This draft is archived because the underlying release migration is already true
on fresh `origin/main`, but the draft itself no longer matches that truth.

## Archive note

The repo already ships the intended Changesets-only production release flow via:

- `.github/workflows/release.yml`
- `infra/release-metadata.production.json`
- `test/reusable-deploy-workflows.test.ts`
- `blueprints/completed/2026-06-18-lightweight-version-automation.md`

What went stale in this draft:

- it still targets the initial `0.1.0` cutover state, while `origin/main` is at
  `0.1.1`;
- it names older reusable-workflow SHAs that have since been refreshed;
- it assumes the migration still needs to be implemented, when the current repo
  contract already proves the migration landed.

Archiving preserves the historical plan while recording that the truthful active
state now lives in the completed lightweight-version automation blueprint and
current release contract tests.

## Verification evidence

- `sed -n '1,220p' .github/workflows/release.yml`
- `sed -n '1,120p' infra/release-metadata.production.json`
- `node --test test/reusable-deploy-workflows.test.ts`
- `wp audit blueprint-lifecycle`
