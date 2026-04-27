---
type: runbook
last_updated: "2026-04-25"
---

# Deploy Rollback Runbook

Procedure for rolling back the API Worker and/or client SPA Worker after a bad deploy to the `dev` environment.

## Workers are independent — roll back each separately

The API Worker (`ingest-lens-dev`) and the client Worker (`ingest-lens-client-dev`) are separate CF Workers. Each can be rolled back independently.

## Roll back the Client SPA Worker

From `apps/client/`:

```bash
cd apps/client
npx wrangler rollback --env dev
```

Expected output:

```
Successfully rolled back to the previous version of ingest-lens-client-dev
```

Verify the rollback reverted the SPA:

```bash
curl -s -o /dev/null -w "%{http_code}" https://dev.ingest-lens.ozby.dev/
# expected: 200
```

## Roll back the API Worker

From `apps/workers/`:

```bash
cd apps/workers
npx wrangler rollback --env dev
```

Verify the API is serving again:

```bash
curl -s https://api.dev.ingest-lens.ozby.dev/health
# expected: {"status":"ok"}
```

## Scenario: SPA deploys OK but CORS env is wrong

Symptom: `https://dev.ingest-lens.ozby.dev` loads but authenticated API calls fail with a CORS error in the browser console.

Diagnosis:

```bash
curl -s -I -H "Origin: https://dev.ingest-lens.ozby.dev" https://api.dev.ingest-lens.ozby.dev/health | grep -i "access-control"
```

If `Access-Control-Allow-Origin` is absent or wrong, the API Worker has the wrong `ALLOWED_ORIGIN` var.

Fix (preferred — redeploy the API with the correct var):

1. Confirm `[env.dev.vars] ALLOWED_ORIGIN = "https://dev.ingest-lens.ozby.dev"` in `apps/workers/wrangler.toml`
2. Redeploy the API: `doppler run --project ozby-shell --config dev -- pnpm --filter @repo/workers exec wrangler deploy --env dev`

Rollback (if the above fails):

```bash
cd apps/workers
npx wrangler rollback --env dev
```

Then re-check CORS:

```bash
curl -s -I -H "Origin: https://dev.ingest-lens.ozby.dev" https://api.dev.ingest-lens.ozby.dev/health | grep -i "access-control"
# expected: Access-Control-Allow-Origin: https://dev.ingest-lens.ozby.dev
```

## Listing available versions (before rolling back)

```bash
# Client Worker versions
npx wrangler versions list --env dev  # run from apps/client/

# API Worker versions
npx wrangler versions list --env dev  # run from apps/workers/
```
