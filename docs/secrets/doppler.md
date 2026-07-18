---
type: runbook
last_updated: "2026-06-17"
---

# Secret Provider Management Runbook

This runbook documents the **consumer-facing** secret contract for `ingest-lens`. The repo now uses the existing **ozby** Doppler project `ozby-dev`.
Provider implementation details are intentionally kept behind Webpresso surfaces.

## Current repo contract

Use only these surfaces:

- configure the repo secret selection through `wp secrets doctor --profile <profile> --json ...`
- run secret-scoped commands through `wp secrets run --sink <sink> --profile <profile> -- <cmd>`
- pass CI through the shared reusable workflow contract using profile-specific Doppler config tokens
- never persist `.env*` / `.dev.vars*` files

## What lives where

- committed metadata only: `.webpresso/secrets.config.json`
- local runtime selection only: `.git/webpresso/secrets.json`
- secret values: the configured secret provider / platform secret stores
- reusable workflow caller inputs: repo-owned `secret_profile` plus mapped GitHub secret `ci_secret_provider_token`

## Local bootstrap

From the repo root:

```bash
vp install --frozen-lockfile
wp secrets doctor --profile <profile> --json show
```

If no local runtime selection exists yet, choose one with the canonical Webpresso surface:

```bash
wp secrets doctor --profile <profile> --json --help
```

Then run secret-aware commands only through the wrapper:

```bash
wp secrets run --sink pulumi --profile preview -- wp run --filter @repo/infra preview
wp secrets run --sink pulumi --profile production -- wp run --filter @repo/infra up:prd
wp secrets run --sink deploy-wrangler --profile preview -- bun infra/src/deploy/deploy.ts dev
```

## CI bootstrap

GitHub Actions uses the shared reusable workflow contract from
`webpresso/github-actions`:

- preview and production callers pass `secret_profile: preview|production` and map
  `ci_secret_provider_token: ${{ secrets.CI_SECRET_PROVIDER_TOKEN_PREVIEW }} (preview) or ${{ secrets.CI_SECRET_PROVIDER_TOKEN_PRODUCTION }} (production)`
- the shared workflow validates the committed profile name, then uses the
  mapped Doppler config token to inject runtime secrets for that config

Do **not** inline raw `DOPPLER_TOKEN` / `DOPPLER_SERVICE_TOKEN` environment
exports inside workflow steps; keep the token on the reusable-workflow secret boundary.

## Required runtime values

The concrete values depend on the active lane and environment, but the deploy,
preview, and e2e flows expect these names to be available once the secret
provider has injected them:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_ZONE_ID`
- `PULUMI_ACCESS_TOKEN`
- `NEON_API_KEY`
- `NEON_PROJECT_ID`
- `NEON_PARENT_BRANCH_ID`
- any application/database vars required by the active lane

## Verification

```bash
wp run verify:secrets
wp audit absolute-path-policy --root .
wp audit secret-provider-quarantine
```

## Notes

- Historical blueprints may still mention older provider-branded examples.
  Treat this runbook and the repo scripts/workflows as the current source of truth.
- The repo intentionally documents the **contract**, not the underlying vendor.
