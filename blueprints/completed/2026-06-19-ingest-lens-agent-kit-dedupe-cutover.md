---
type: blueprint
title: "Ingest Lens: agent-kit dedupe cutover"
owner: ozby
status: completed
completed_at: "2026-06-19"
complexity: M
created: "2026-06-19"
last_updated: "2026-06-19"
progress: "100% (local act/helper surfaces removed; setup/install simplified; repo-owned workflow setup drift removed; stale local setup action deleted; reusable workflow callers now use the shared capability-aware contract)"
depends_on: []
cross_repo_depends_on:
  - repo: webpresso/agent-kit
    slug: 2026-06-19-agent-kit-wp-shared-e2e-secrets-act-supervisor
    require_status: completed
  - repo: webpresso/github-actions
    slug: 2026-06-19-github-actions-shared-setup-oidc-cache-pin-hardening
    require_status: in-progress
tags:
  - ingest-lens
  - e2e
  - wp
  - secrets
  - ci
---

# Ingest Lens: agent-kit dedupe cutover

**Goal:** Remove local `act` / secret / setup duplication from Ingest Lens and adopt the shared Agent Kit + GitHub Actions contract while preserving app-specific e2e/runtime behavior.

## Known deletion targets

- local `act-with-webpresso` helper ✅
- local `act-secret-profile` helper ✅
- copied setup action drift ◐

## Tasks

1. Point workflows/scripts to `wp ci act` and shared setup.
2. Keep `.webpresso/secrets.config.json` as repo-owned profile declaration only.
3. Delete duplicate orchestration that is superseded by shared ownership.
4. Re-run affected e2e/runtime contract tests.

#### [cutover] Task 3.1: Remove local helper/setup duplicates and adopt shared capability-aware workflow callers

**Status:** done

**Depends:** None

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"wp test","exit_code":0,"kind":"integration","result":"pass","target_files":["package.json",".github/workflows/deploy-preview.yml",".github/workflows/deploy-production.yml",".github/workflows/release.yml","test/ci-workflow-contract.test.ts","test/reusable-deploy-workflows.test.ts"],"ts":"2026-06-19T15:20:00Z"},{"agent":"codex","audit_kind":"secret-provider-quarantine","kind":"audit","passed":true,"result":"pass","ts":"2026-06-19T15:20:00Z"}]
```

## Verification

- `wp check`
- `wp ci act`
- affected e2e suite(s)

## Current completion evidence

- Deleted:
  - `scripts/act-with-webpresso.ts`
  - `scripts/act-secret-profile.ts`
  - `scripts/act-with-webpresso.test.ts`
  - `scripts/resolve-webpresso-cli-versions.js`
  - `.github/actions/setup-webpresso/action.yml`
- Root package `act:*` scripts now call `wp ci act` directly.
- `.github/actions/setup-monorepo/action.yml` now installs the global `wp`
  CLI directly through `vp install -g @webpresso/agent-kit` instead of the
  retired local version-resolution helper.
- Deploy/release workflow `install_command` blocks now install global
  `vite-plus` + `@webpresso/agent-kit` directly and no longer depend on the
  retired local helper script.
- Local workflow/test references to the deleted act wrapper test were removed.
- Repo-owned workflow cleanup:
  - `.github/workflows/e2e.yml` no longer depends on `CI_SECRET_PROVIDER_TOKEN`
    or `dopplerhq/cli-action`
  - `.github/workflows/cleanup-stale-neon-e2e-branches.yml` no longer has a
    `CI_SECRET_PROVIDER_TOKEN` / Doppler fallback lane and now uses direct Neon
    credentials only when configured
- Reusable workflow caller cleanup:
  - `.github/workflows/deploy-preview.yml` no longer passes
    `skip_when_ci_secret_missing` and now passes only the shared
    `ci_secret_provider_token` plus repo-owned `secret_profile`
  - `.github/workflows/deploy-production.yml` no longer passes
    legacy fallback inputs and now passes only the shared
    `ci_secret_provider_token` plus repo-owned `secret_profile`
  - `.github/workflows/release.yml` deploy handoff no longer passes
    legacy fallback inputs and now passes only the shared
    `ci_secret_provider_token` plus repo-owned `secret_profile`
- Repo-owned workflow setup cleanup:
  - `.github/workflows/ci.yml`, `.github/workflows/e2e.yml`,
    `.github/workflows/e2e-act.yml`,
    `.github/workflows/security-scan.yml`, and
    `.github/workflows/cleanup-stale-neon-e2e-branches.yml`
    no longer invoke the local `setup-monorepo` action
  - the now-unused `.github/actions/setup-monorepo/action.yml` file was deleted
- The stale unused `.github/actions/setup-webpresso/action.yml` file was
  deleted after the repo-local helper it referenced had already been removed.
