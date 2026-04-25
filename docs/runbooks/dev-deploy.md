---
type: runbook
last_updated: "2026-04-25"
---

# Dev Deploy Runbook

Full deploy of the API Worker (`api.dev.ozby.dev`) and client SPA Worker (`dev.ozby.dev`) to the `dev` Cloudflare environment.

## Prerequisites

- Doppler CLI installed and authenticated (`doppler login`)
- Cloudflare API token in Doppler project `ozby-shell / dev` with `Workers Scripts:Edit` + `DNS:Edit` scopes
- Pulumi CLI installed (`pulumi login` with ozby account)
- pnpm installed; all deps installed (`pnpm install` from repo root)
- Postgres running locally (or skipped via Doppler — Hyperdrive handles prod connections)

## Full Deploy (API + Client)

Run from the repo root (`ingest-lens/`):

```bash
bun ./infra/src/deploy/deploy.ts dev
```

This executes four phases in sequence:

1. **Phase 1** — `pulumi up --yes --stack dev` provisions Hyperdrive, KV, R2 if changed
2. **Phase 2** — `sync-wrangler-ids.ts dev` patches `apps/workers/wrangler.toml` with real IDs from Pulumi outputs
3. **Phase 3** — `wrangler deploy --env dev` (in `apps/workers/`) deploys the API Worker at `api.dev.ozby.dev`
4. **Phase 4** — `build:dev` (Vite, bakes `VITE_API_BASE_URL=https://api.dev.ozby.dev`) then `wrangler deploy --env dev` (in `apps/client/`) deploys the SPA Worker at `dev.ozby.dev`

Expected output tail:

```
✅  Deployed api.dev.ozby.dev
✅  Deployed dev.ozby.dev
```

## Smoke Check After Deploy

```bash
# SPA index returned
curl -s -o /dev/null -w "%{http_code}" https://dev.ozby.dev/
# expected: 200

# Deep link falls back to index.html (SPA mode — not 404)
curl -s -o /dev/null -w "%{http_code}" https://dev.ozby.dev/queues/nonexistent
# expected: 200

# API health check
curl -s https://api.dev.ozby.dev/health
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
npx wrangler delete --env dev --name node-pubsub-client-dev
```

This removes the Worker, route, and DNS record atomically.
