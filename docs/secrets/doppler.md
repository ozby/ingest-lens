---
type: runbook
last_updated: "2026-06-17"
---

# Secret Provider Management Runbook

This runbook documents the **consumer-facing** secret contract for `ingest-lens`. The repo now uses the separate **ozby** Doppler workplace with the per-app project `ingest-lens`.
Provider implementation details are intentionally kept behind Webpresso surfaces.

## Current repo contract

Use only these surfaces:

- configure the repo secret selection through `wp config secrets ...`
- run secret-scoped commands through `with-secrets -- <cmd>`
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
wp config secrets show
```

If no local runtime selection exists yet, choose one with the canonical Webpresso surface:

```bash
wp config secrets --help
```

Then run secret-aware commands only through the wrapper:

```bash
with-secrets -- pnpm --filter @repo/infra preview
with-secrets -- pnpm --filter @repo/infra up:prd
with-secrets -- bun infra/src/deploy/deploy.ts dev
```

## CI bootstrap

GitHub Actions uses the shared reusable workflow contract from
`webpresso/github-actions`:

- preview and production callers pass `secret_profile: preview|deploy` and map
  `ci_secret_provider_token: ${{ secrets.CI_SECRET_PROVIDER_TOKEN }}`
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
vp run verify:secrets
wp audit absolute-path-policy --root .
wp audit secret-provider-quarantine
```

## Notes

- Historical blueprints may still mention older provider-branded examples.
  Treat this runbook and the repo scripts/workflows as the current source of truth.
- The repo intentionally documents the **contract**, not the underlying vendor.
