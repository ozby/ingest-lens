---
type: runbook
last_updated: "2026-06-17"
---

# Secret Provider Management Runbook

This runbook documents the **consumer-facing** secret contract for `ingest-lens`.
Provider implementation details are intentionally kept behind Webpresso surfaces.

## Current repo contract

Use only these surfaces:

- configure the repo secret selection through `wp config secrets ...`
- run secret-scoped commands through `with-secrets -- <cmd>`
- pass CI bootstrap through `CI_SECRET_PROVIDER_TOKEN`
- never persist `.env*` / `.dev.vars*` files

## What lives where

- committed metadata only: `.webpresso/secrets.config.json`
- local runtime selection only: `.git/webpresso/secrets.json`
- secret values: the configured secret provider / platform secret stores
- CI bootstrap token: GitHub Actions secret `CI_SECRET_PROVIDER_TOKEN`

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

GitHub Actions must store only a single bootstrap secret:

- `CI_SECRET_PROVIDER_TOKEN`

That token is consumed by the repo’s CI secret-provider bridge, which injects the
required runtime env vars for deploy/e2e jobs without exposing provider-specific
CLI details in the consumer workflow contract.

Do **not** add raw deploy secrets such as `CLOUDFLARE_API_TOKEN` as ordinary
repository secrets when the secret-provider bridge is available.

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
