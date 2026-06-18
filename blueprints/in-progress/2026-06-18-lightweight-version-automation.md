---
type: blueprint
owner: ozby
title: "Lightweight version automation"
status: in-progress
complexity: S
created: "2026-06-18"
last_updated: "2026-06-18"
progress: "80% (workflow contract changes implemented locally; PR verification running)"
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

#### [ci] Task 1.1: Lighten version automation workflow lanes

**Status:** in progress

**Depends:** None

- prove heavy feature-validation lanes already exist on feature branches
- skip duplicate release-automation PR checks
- keep release/deploy callers on the current shared reusable workflow surface

## Verification

- Workflow contract tests cover the skip rules and shared reusable workflow pins.
- `wp audit blueprint-lifecycle`
- `wp audit architecture-drift --root .`
