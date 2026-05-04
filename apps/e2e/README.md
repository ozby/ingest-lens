# `@repo/e2e`

Repo-owned end-to-end surface for IngestLens. Zero manual env vars — secrets and database connections are injected automatically.

## Running

```bash
pnpm e2e --suite full                        # from repo root — auto-provisions Neon branch
pnpm exec ak e2e --suite foundation           # against an already-running worker
pnpm --filter @repo/e2e run auth:dev-bench   # against deployed dev.ingest-lens.ozby.dev
```

The root `pnpm e2e` script (`apps/e2e/scripts/e2e-with-neon.ts`):

1. Loads secrets from Doppler
2. Creates an ephemeral Neon branch (1h TTL)
3. Runs migrations
4. Starts `wrangler dev`
5. Runs the specified suite
6. Cleans up the branch

## Suites

Defined in `src/e2e-suite-manifest.ts`:

- `foundation` — worker health smoke
- `auth` — register/login/session recovery
- `messaging` — queue send/receive/ack + topic publish fanout
- `hardening` — ownership and authorization hardening
- `intake` — AI intake mapping suggestion + review flow
- `demo` — public fixture demo ingestion
- `client` — client route code-splitting and bundle budgets
- `branding` — IngestLens UI branding surfaces
- `full` — runs all suites

## Deployed dev auth bench

`pnpm --filter @repo/e2e run auth:dev-bench` exercises the deployed Webpresso auth
flow end to end against:

- `https://dev.ingest-lens.ozby.dev`
- `https://api.dev.ingest-lens.ozby.dev`

It verifies sign-up, sign-in, organization membership, one authenticated queue
CRUD round-trip, cross-subdomain cookie issuance, sign-out session clearing,
and protected-route redirect back to the auth landing page.

## Neon branch helpers

All require Doppler-injected secrets:

```bash
with-secrets --doppler ozby-shell:dev -- pnpm --dir apps/e2e db:branch:create
with-secrets --doppler ozby-shell:dev -- pnpm --dir apps/e2e db:branch:list
with-secrets --doppler ozby-shell:dev -- pnpm --dir apps/e2e db:branch:delete
with-secrets --doppler ozby-shell:dev -- pnpm --dir apps/e2e db:branch:cleanup
```
