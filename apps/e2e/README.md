# `@repo/e2e`

Repo-owned end-to-end surface for `node-pubsub`.

## Entry points

- `pnpm exec ak e2e --suite foundation`
- `pnpm exec ak e2e --suite full`
- `pnpm --filter @repo/e2e test:journeys`
- `pnpm --filter @repo/e2e run e2e:run -- --suite full`
- `pnpm act:e2e` (local GitHub Actions harness via `.github/workflows/testing-e2e-act.yml`)

The hosted and local workflow harnesses both use `actions/setup-node@v6` plus
Corepack-activated pnpm, so the E2E surface matches the repo's Node 24-native
GitHub Actions setup.

## Current suites

Suites are defined in `apps/e2e/src/e2e-suite-manifest.ts`.

- `foundation`
  - `journeys/worker-health.e2e.ts`
  - validates the live worker runtime responds on `/health`
- `auth`
  - `journeys/auth-session.e2e.ts`
  - validates register/login/session recovery and rejects invalid credentials
- `messaging`
  - `journeys/queue-message-flow.e2e.ts`
  - `journeys/topic-publish-flow.e2e.ts`
  - validates queue send/receive/ack plus topic publish fanout to subscribed queues
- `hardening`
  - `journeys/ownership-hardening.e2e.ts`
  - validates ownership and authorization edges across queue/topic surfaces
- `intake`
  - `journeys/intake-mapping-flow.e2e.ts`
  - validates the AI intake mapping suggestion + review flow end to end
- `demo`
  - `journeys/public-fixture-demo-flow.e2e.ts`
  - validates the public fixture demo ingestion path
- `client`
  - `journeys/client-route-code-splitting.e2e.ts`
  - validates client route code-splitting and bundle-budget gates
- `branding`
  - `journeys/ingestlens-branding.e2e.ts`
  - validates IngestLens public UI branding surfaces
- `full`
  - runs every live HTTP journey above in one invocation

All suites read `E2E_BASE_URL` from the environment (no fallback default).

The runner lives at `apps/e2e/src/cli/run-e2e.ts` and resolves suites from the
local manifest in `apps/e2e/src/e2e-suite-manifest.ts`. Both `pnpm exec ak e2e`
and `pnpm --filter @repo/e2e run e2e:run` route through the same manifest.

## Local worker prerequisites for `auth`, `messaging`, and `full`

The non-smoke suites need the worker to have both a JWT secret and a migrated local Postgres schema:

```bash
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pubsub
psql "$DATABASE_URL" -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto;'
psql "$DATABASE_URL" -f apps/workers/src/db/migrations/0000_initial_workers_schema.sql
psql "$DATABASE_URL" -f apps/workers/src/db/migrations/0001_add_message_seq.sql || true
JWT_SECRET=e2e-test-secret pnpm --filter @repo/workers dev -- --port 8787
```

Then run:

```bash
E2E_BASE_URL=http://127.0.0.1:8787 pnpm exec ak e2e --suite full
pnpm act:e2e
```

## Neon helpers

The branch scripts under `scripts/` call the local `@repo/neon` package and are designed
for the future ephemeral-branch flow:

- `db:branch:create`
- `db:branch:list`
- `db:branch:delete`
- `db:branch:cleanup`
