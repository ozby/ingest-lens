# `@repo/e2e`

Repo-owned end-to-end surface for IngestLens. Zero manual env vars — secrets and database connections are injected automatically.

## Running

```bash
wp e2e --suite full                          # from repo root — auto-provisions Neon branch
wp e2e --suite foundation                    # host-adapter path against an already-running worker
wp run --filter @repo/e2e auth:dev-bench     # against deployed dev.ingest-lens.ozby.dev
```

The root `wp e2e` script (`apps/e2e/scripts/e2e-with-neon.ts`):

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
- `healing` — adaptive intake auto-heal + rollback semantics
- `demo` — public fixture demo ingestion
- `client` — client route code-splitting plus browser proof for dashboard, queues, topics, metrics, and detail surfaces
- `branding` — IngestLens UI branding surfaces
- `intake-ui` — browser proof for intake submission + admin review
- `full` — runs all Vitest journeys plus both Playwright browser suites

Reviewer-facing claim mapping lives in
[`../../docs/guides/claim-e2e-traceability.md`](../../docs/guides/claim-e2e-traceability.md).

## Deployed dev auth bench

`wp run --filter @repo/e2e auth:dev-bench` exercises the deployed Webpresso auth
flow end to end against:

- `https://dev.ingest-lens.ozby.dev`
- `https://api.dev.ingest-lens.ozby.dev`

It verifies sign-up, sign-in, organization membership, one authenticated queue
CRUD round-trip, cross-subdomain cookie issuance, sign-out session clearing,
and protected-route redirect back to the auth landing page.

## Neon branch helpers

All require the repo-selected secret manager:

```bash
wp secrets run --sink db-branch --profile preview -- wp run --filter @repo/e2e db:branch:create
wp secrets run --sink db-branch --profile preview -- wp run --filter @repo/e2e db:branch:list
wp secrets run --sink db-branch --profile preview -- wp run --filter @repo/e2e db:branch:delete
wp secrets run --sink db-branch --profile preview -- wp run --filter @repo/e2e db:branch:cleanup
```
