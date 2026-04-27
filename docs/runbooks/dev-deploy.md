---
type: runbook
last_updated: "2026-04-27"
---

# Dev Deploy Runbook

Full deploy of the API Worker (`api.dev.ingest-lens.ozby.dev`) and client SPA Worker (`dev.ingest-lens.ozby.dev`) to the `dev` Cloudflare environment.

## Prerequisites

- Doppler CLI installed and authenticated (`doppler login`)
- Cloudflare API token in Doppler project `ozby-shell / dev` with `Workers Scripts:Edit` + `DNS:Edit` scopes
- Pulumi CLI installed (`pulumi login` with ozby account)
- pnpm installed; all deps installed (`pnpm install` from repo root)
- `NEON_API_KEY`, `NEON_PROJECT_ID`, `NEON_PARENT_BRANCH_ID` in Doppler (for branch provisioning)
- `NEON_ROLE_PASSWORD`, `NEON_ROLE_NAME`, `NEON_DATABASE_NAME` in Doppler (for connection string construction)

## Full Deploy (API + Client)

Run from the repo root (`ingest-lens/`):

```bash
bun ./infra/src/deploy/deploy.ts dev
```

This executes five phases in sequence:

1. **Phase 0** — Neon branch provisioning: creates a branch named `dev` from the parent branch if it doesn't already exist, then sets the connection string as Pulumi config. Skipped for `prd` (uses the existing production branch).
2. **Phase 1** — `pulumi up --yes --stack dev` provisions Hyperdrive, KV, R2, Queues with IDs from the Neon connection string.
3. **Phase 2** — `sync-wrangler-ids.ts dev` patches `apps/workers/wrangler.toml` with real IDs from Pulumi outputs.
4. **Phase 3** — `wrangler deploy --env dev` (in `apps/workers/`) deploys the API Worker at `api.dev.ingest-lens.ozby.dev`.
5. **Phase 4** — `build:dev` (Vite, bakes `VITE_API_BASE_URL=https://api.dev.ingest-lens.ozby.dev`) then `wrangler deploy --env dev` (in `apps/client/`) deploys the SPA Worker at `dev.ingest-lens.ozby.dev`.

Expected output tail:

```
✅  Deployed api.dev.ingest-lens.ozby.dev
✅  Deployed dev.ingest-lens.ozby.dev
```

## E2E Testing (with Neon branch)

Run e2e tests with automatic Neon branch provisioning and cleanup:

```bash
bun apps/e2e/scripts/e2e-with-neon.ts --suite <suite>
```

Available suites: `foundation`, `auth`, `messaging`, `intake`, `healing`, `full`.

The script:

1. Creates a Neon branch with 1h TTL
2. Runs all DB migrations
3. Starts `wrangler dev` on port 8787
4. Runs the specified e2e suite against `http://127.0.0.1:8787`
5. Deletes the Neon branch (guaranteed on exit, even on failure)

Requires `NEON_API_KEY`, `NEON_PROJECT_ID`, `NEON_PARENT_BRANCH_ID` set in the environment.

## Smoke Check After Deploy

```bash
# SPA index returned
curl -s -o /dev/null -w "%{http_code}" https://dev.ingest-lens.ozby.dev/
# expected: 200

# Deep link falls back to index.html (SPA mode — not 404)
curl -s -o /dev/null -w "%{http_code}" https://dev.ingest-lens.ozby.dev/queues/nonexistent
# expected: 200

# API health check
curl -s https://api.dev.ingest-lens.ozby.dev/health
# expected: {"status":"ok"}
```

## Custom Domain / Cert Delay

`custom_domain = true` in `wrangler.toml` triggers atomic cert + DNS provisioning. On the very first deploy, cert propagation may take 1-5 minutes. Use `wrangler tail --env dev` (in `apps/client/`) to confirm the Worker is live before the cert propagates.

## Deploy Client Only (no Pulumi / API changes)

```bash
cd apps/client
pnpm deploy:dev
```

This runs `build:dev` + `wrangler deploy --env dev` in one step.

## Teardown (remove the SPA Worker)

```bash
cd apps/client
npx wrangler delete --env dev --name ingest-lens-client-dev
```

This removes the Worker, route, and DNS record atomically.
