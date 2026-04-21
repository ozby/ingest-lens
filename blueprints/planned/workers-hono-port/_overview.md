---
type: blueprint
status: planned
complexity: XL
created: "2026-04-22"
last_updated: "2026-04-22"
progress: "0% (drafted)"
depends_on:
  - doppler-secrets
  - pnpm-catalogs-adoption
tags:
  - runtime
  - migration
  - hono
  - cloudflare-workers
  - hard-cut
---

# Workers + Hono port (replace Express / Node runtime)

**Goal:** Hard-cut `apps/api-server` and `apps/notification-server` from
Express-on-Node to Hono-on-Cloudflare-Workers. Remove mongoose entirely.
Use Drizzle ORM with Cloudflare Hyperdrive for Postgres access. The
resulting runtime is a single `apps/workers/` workspace that deploys via
`wrangler deploy`.

## Planning Summary

- **Why now:** The `cloudflare-pulumi-infra` blueprint is unblocked only
  after the runtime target is confirmed as Workers. This blueprint IS that
  confirmation and its execution. Hono is the idiomatic Workers web framework
  (lightweight, Web-standard fetch handler, tree-shakable middleware).
- **Scope:** Migrate all HTTP routes and WebSocket/SSE push from Express to
  Hono. Replace mongoose with Drizzle (postgres-js driver + Hyperdrive
  binding). Delete `apps/api-server/` and `apps/notification-server/` once
  the Workers workspace is feature-equivalent. No backwards-compatibility
  shims.
- **Out of scope:** Pulumi stack provisioning (handled by
  `cloudflare-pulumi-infra`). Authentication provider swap. Adding new
  features beyond parity.

## Architecture Overview

```text
before:                                   after:
  apps/api-server/      (Express, mongoose)  apps/workers/
  apps/notification-server/ (Express, WS)      src/
                                               index.ts        # Hono app + wrangler fetch export
                                               routes/
                                                 api.ts        # all REST routes
                                                 events.ts     # SSE / WebSocket push
                                               db/
                                                 schema.ts     # Drizzle schema (replaces mongoose models)
                                                 client.ts     # Hyperdrive-aware postgres-js client
                                               platform/
                                                 eventPlatformService.ts  (ported)
                                                 deliveryDispatcher.ts    (ported)
                                               middleware/
                                                 auth.ts
                                                 signing.ts
                                             wrangler.toml
                                             package.json
                                             tsconfig.json
                                             vitest.config.ts
```

## Fact-Checked Findings

| ID  | Severity | Claim                                         | Reality                                                                                                                       | Fix in this blueprint                                                                        |
| --- | -------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| F1  | HIGH     | Hono runs on Cloudflare Workers               | Yes — first-class target; `hono` 4.x exports a `fetch` handler compatible with `wrangler`.                                    | Use `hono@^4` from pnpm catalog.                                                             |
| F2  | HIGH     | mongoose is incompatible with Workers         | Yes — uses Node `net`/`tls` which are absent in the CF runtime. Hard-cut required.                                            | Delete mongoose + `@types/mongoose` in the same commit.                                      |
| F3  | HIGH     | Drizzle + postgres-js works with Hyperdrive   | Yes — Hyperdrive exposes a standard Postgres connection string; `postgres-js` connects via it inside a Worker.                | Use `drizzle-orm@^0.33` + `postgres@^3`.                                                     |
| F4  | MEDIUM   | SSE / real-time push works in Workers         | Partial — Workers support `ReadableStream` for SSE; WebSocket upgrade via `CF-WebSocket` API. Native WS upgrade is supported. | Use Hono's `streamSSE` helper; for WS use `upgradeWebSocket` from `hono/cloudflare-workers`. |
| F5  | LOW      | Wrangler dev mode supports Hyperdrive locally | Yes via `wrangler dev --local` with a `.dev.vars` Postgres URL. No Doppler needed locally for DB URL.                         | Document in `apps/workers/.dev.vars.example`.                                                |

## Evidence Base

- `apps/api-server/src/platform/services/eventPlatformService.ts` — source for route + service logic.
- `apps/api-server/src/platform/services/deliveryDispatcher.ts` — delivery fan-out logic.
- `apps/api-server/package.json` — current deps including `mongoose`, `express`.
- Webpresso pattern: `~/repos/webpresso/apps/workers/` for Hono + Hyperdrive reference.

## Task Pool

### Phase 1: Scaffold new workspace [Complexity: M]

#### [scaffold] Task 1.1: Create `apps/workers/` workspace

**Status:** todo **Depends:** None

**Files:**

- Create: `apps/workers/package.json`
- Create: `apps/workers/tsconfig.json`
- Create: `apps/workers/wrangler.toml`
- Create: `apps/workers/vitest.config.ts`
- Create: `apps/workers/src/index.ts` (minimal Hono app — `app.get('/health', …)`)
- Modify: `pnpm-workspace.yaml` (add `- apps/workers`)

**Acceptance:**

- [ ] `pnpm --filter @repo/workers exec wrangler dev` starts without errors.
- [ ] `GET /health` returns `200 ok` in `wrangler dev` mode.

#### [deps] Task 1.2: Add Hono + Drizzle + postgres-js to catalog

**Status:** todo **Depends:** Task 1.1

**Files:**

- Modify: `pnpm-workspace.yaml` (catalog entries: `hono`, `drizzle-orm`, `drizzle-kit`, `postgres`)
- Modify: `apps/workers/package.json` (reference catalog entries)

**Acceptance:**

- [ ] `pnpm install --frozen-lockfile` completes without peer warnings.
- [ ] `import { Hono } from 'hono'` resolves in `apps/workers/src/index.ts`.

### Phase 2: Database layer [Complexity: M]

#### [db] Task 2.1: Drizzle schema + Hyperdrive client

**Status:** todo **Depends:** Task 1.2

Replace mongoose models (`Topic`, `Subscription`, `Event`, `Delivery`) with
Drizzle table definitions.

**Files:**

- Create: `apps/workers/src/db/schema.ts`
- Create: `apps/workers/src/db/client.ts`
- Create: `apps/workers/src/db/migrations/` (initial migration via `drizzle-kit generate`)

**Acceptance:**

- [ ] `pnpm --filter @repo/workers exec drizzle-kit generate` produces a migration file.
- [ ] `client.ts` accepts a Hyperdrive `connectionString` binding and returns a Drizzle instance.

### Phase 3: Route + service port [Complexity: L]

#### [port] Task 3.1: Port REST API routes

**Status:** todo **Depends:** Task 2.1

**Files:**

- Create: `apps/workers/src/routes/api.ts` (all routes from `apps/api-server/src/`)
- Create: `apps/workers/src/platform/eventPlatformService.ts` (ported — replace mongoose calls with Drizzle)
- Create: `apps/workers/src/platform/deliveryDispatcher.ts` (ported)
- Create: `apps/workers/src/middleware/auth.ts`
- Create: `apps/workers/src/middleware/signing.ts`

**Acceptance:**

- [ ] All existing integration test scenarios pass against the new Hono routes in `wrangler dev`.
- [ ] No mongoose import anywhere in `apps/workers/`.

#### [port] Task 3.2: Port SSE / real-time push

**Status:** todo **Depends:** Task 3.1

**Files:**

- Create: `apps/workers/src/routes/events.ts` (SSE stream via `streamSSE`, WS via `upgradeWebSocket`)

**Acceptance:**

- [ ] A connected SSE client receives events within 500 ms of publish in `wrangler dev`.

### Phase 4: Tests [Complexity: M]

#### [test] Task 4.1: Integration test suite for Workers workspace

**Status:** todo **Depends:** Task 3.1, Task 3.2

**Files:**

- Create: `apps/workers/src/tests/integration/eventPlatform.test.ts` (port from `apps/api-server`)
- Create: `apps/workers/src/tests/integration/helpers/setup.ts`

**Acceptance:**

- [ ] `pnpm --filter @repo/workers test` is green with ≥80% line coverage.

### Phase 5: Hard-cut legacy [Complexity: S]

#### [delete] Task 5.1: Remove `apps/api-server/` and `apps/notification-server/`

**Status:** todo **Depends:** Task 4.1

**Files:**

- Delete: `apps/api-server/` (entire directory)
- Delete: `apps/notification-server/` (entire directory)
- Modify: `pnpm-workspace.yaml` (remove old workspace entries)
- Modify: `turbo.json` or root `package.json` scripts (update references)
- Modify: `.github/workflows/ci.yml` (remove old workspace filters)

**Acceptance:**

- [ ] `pnpm install` completes after deletion.
- [ ] No reference to `apps/api-server` or `apps/notification-server` remains in any `package.json`, CI YAML, or config file.
- [ ] `pnpm qa` green after deletion.

## Verification Gates

| Gate           | Command                                                      | Success Criteria                     |
| -------------- | ------------------------------------------------------------ | ------------------------------------ |
| Install        | `pnpm install --frozen-lockfile`                             | No peer warnings, lockfile stable    |
| Build          | `pnpm --filter @repo/workers build`                          | Exit 0                               |
| Test           | `pnpm --filter @repo/workers test`                           | All suites green, ≥80% line coverage |
| Types          | `pnpm check-types`                                           | Zero errors via tsgo                 |
| Lint           | `pnpm lint`                                                  | Zero violations                      |
| Deploy smoke   | `pnpm --filter @repo/workers exec wrangler deploy --dry-run` | Exit 0                               |
| Legacy deleted | `ls apps/api-server apps/notification-server`                | `ls: no such file`                   |

## Cross-Plan References

| Type       | Blueprint                     | Relationship                                                       |
| ---------- | ----------------------------- | ------------------------------------------------------------------ |
| Upstream   | `doppler-secrets`             | Doppler provides runtime secrets for Workers                       |
| Upstream   | `pnpm-catalogs-adoption`      | Catalog must exist before adding Hono/Drizzle entries              |
| Downstream | `cloudflare-pulumi-infra`     | Pulumi provisions Hyperdrive + Worker routes after this lands      |
| Downstream | `stryker-mutation-guardrails` | Mutation gates move from api-server workspace to workers workspace |

## Non-goals

- Replacing Vitest with a different test runner.
- Adding new features (OAuth, multi-tenant, etc.) as part of this port.
- Migrating data out of any existing MongoDB instance (no prod data exists).
- Pulumi resource provisioning (handled by `cloudflare-pulumi-infra`).

## Risks

| Risk                                                               | Impact | Mitigation                                                                               |
| ------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------- |
| Hono WebSocket API differences from ws/socket.io                   | Medium | Port SSE first; WebSocket second; wrap in integration test before deleting legacy        |
| Drizzle migration tooling in Workers context (no Node.js)          | Medium | Run `drizzle-kit` locally only; migrations applied at deploy time via CI                 |
| Hyperdrive not available in local `wrangler dev` without paid plan | Low    | Use direct Postgres URL in `.dev.vars` for local dev; Hyperdrive only in deployed stacks |
| Phase 5 deletion racing with open PRs touching legacy code         | High   | Gate Phase 5 on branch CI being green; coordinate with any open PRs first                |

## Technology Choices

| Component     | Technology               | Version | Why                                                            |
| ------------- | ------------------------ | ------- | -------------------------------------------------------------- |
| Web framework | `hono`                   | ^4.x    | Lightweight, first-class Workers support, Web-standard handler |
| ORM           | `drizzle-orm`            | ^0.33   | Type-safe, zero-runtime overhead, postgres-js compatible       |
| DB driver     | `postgres` (postgres-js) | ^3      | Works with Hyperdrive connection strings inside Workers        |
| Runtime       | Cloudflare Workers       | —       | Confirmed runtime target (replaces Node/Express)               |
| Migrations    | `drizzle-kit`            | ^0.24   | Dev-time only; generates SQL migration files                   |

## Refinement Summary (2026-04-22 pass)

**Status: COMPLIANT — execution-ready.**

Findings:

- New blueprint; no stale references (no files to check against existing repo).
- F2 (mongoose incompatibility) is the critical forcing function — it must be resolved in
  Phase 5 not Phase 1; all intermediate phases must avoid introducing any new mongoose usage.
- F5 (local dev without paid Hyperdrive): `.dev.vars.example` mitigates this; documented in risks.
- Task ordering is correct: scaffold → catalog → db → routes → tests → delete.
- Same-wave conflict check: Tasks 3.1 and 3.2 write to different files; safe to parallelize.
- Phase 5 (Task 5.1) must serialize after Phase 4 (Task 4.1) — hard dependency.

| Metric                      | Value                                 |
| --------------------------- | ------------------------------------- |
| Findings total              | 5                                     |
| Critical / High / Med / Low | 0/3/1/1                               |
| Fixes applied in plan       | 5                                     |
| Cross-plan references       | 4                                     |
| Edge cases documented       | 3                                     |
| Risks documented            | 4                                     |
| Parallelization score       | Medium (3.1 ∥ 3.2 within Phase 3)     |
| Critical path (waves)       | 5 (1.1 → 1.2 → 2.1 → 3.x → 4.1 → 5.1) |
| Max parallel agents         | 2                                     |
| Total tasks                 | 7                                     |
| Blueprint compliant         | Yes                                   |
