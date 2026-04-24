---
slug: e2e-neon
status: draft
owner: ozby
created: 2026-04-22
---

# E2E test suite on ephemeral Neon branches

## Goal

Stand up a real end-to-end suite that runs against an **ephemeral Neon branch**
provisioned for each run. Reuse Webpresso's delivered `@webpresso/agent-kit/e2e`
host-adapter seam, not a direct copy of `~/repos/webpresso/apps/e2e` internals.

Each run:

```
create Neon branch → migrate → seed → boot workers locally → exercise HTTP+WS →
assert delivery/queue/ws behavior → tear branch down
```

Branches that outlive the run are reaped by a scheduled cleanup workflow.

## Why

Current `vitest` suites under `apps/workers/src/tests` mock the DB and queue.
They catch unit-level regressions but cannot catch:

- schema drift vs. live Postgres
- Hyperdrive → Neon connection path regressions
- Queue consumer + DLQ behavior
- Durable Object WS flow end-to-end
- Rate-limit middleware under real traffic

## Scope

**In scope (MVP):**

- New app: `apps/e2e` — `@repo/e2e` package, bun-executed `.ts` scripts + vitest specs (no Playwright yet — backend-only)
- New root config: `agent-kit.config.ts` pointing `ak e2e` at a local
  `apps/e2e/src/agent-kit-host-adapter.ts` so repo-specific Neon/runtime
  orchestration stays local while the public command surface remains
  `@webpresso/agent-kit/e2e`
- New package: `packages/neon` — `@repo/neon` — thin wrapper around Neon REST API (`createEphemeralBranch`, `deleteEphemeralBranch`, `cleanupStaleE2EBranches`, `generateBranchName`) mirroring the webpresso surface
- New scripts under `apps/e2e/scripts/`: `db-branch-create.ts`, `db-branch-delete.ts`, `db-branch-cleanup.ts`, `db-branch-list.ts` — all `.ts` via `bun`, using `citty` for CLI ergonomics
- One first journey suite: **publish → deliver → ack** over HTTP and WS (`apps/e2e/journeys/pubsub-delivery.e2e.ts`)
- GitHub workflows:
  - `.github/workflows/testing-e2e.yml` — runs on push/PR, creates branch, runs suite, tears down, uploads logs
  - `.github/workflows/cleanup-stale-neon-e2e-branches.yml` — cron every 6h, `max-age=24h`
- Doppler wiring: `NEON_API_KEY`, `NEON_PROJECT_ID`, `NEON_PARENT_BRANCH_ID` added to `ozby-shell` project (consistent with existing Neon credentials there)

**Out of scope (follow-ups):**

- Playwright / UI journeys for `apps/client` (separate blueprint when client has real flows)
- Chaos / performance suites (mirror webpresso's `excellence/` later)
- Visual regression

## Architecture

```
apps/e2e/
  package.json                # @repo/e2e, test:journeys, db:branch:*
  journeys/
    pubsub-delivery.e2e.ts    # HTTP publish → consumer → WS receive
    global-setup.ts           # create branch, migrate, seed, start workers
    global-teardown.ts        # delete branch
  scripts/
    db-branch-create.ts       # bun CLI, citty
    db-branch-delete.ts
    db-branch-cleanup.ts
    db-branch-list.ts
  vitest.config.ts            # sequential, single-worker, global setup/teardown

packages/neon/
  src/
    index.ts                  # re-exports
    client.ts                 # neon REST client (fetch)
    branches.ts               # createEphemeral / delete / list / cleanup
    names.ts                  # generateBranchName → e2e/YYYYMMDDHHMMSS-<rand>
    config.ts                 # getNeonConfig from Doppler-injected env
  package.json
```

The architectural seam should mirror Webpresso's delivered split:

- `@webpresso/agent-kit/e2e` owns generic CLI flag parsing, suite/file routing,
  and command planning
- `agent-kit.config.ts` declares the local E2E host adapter
- `apps/e2e/src/agent-kit-host-adapter.ts` owns Neon branch lifecycle,
  worker boot, and any repo-specific setup/teardown behavior

### How the worker gets the branch URL

`wrangler.toml` already has a `HYPERDRIVE` binding with a `localConnectionString`. For e2e we run the worker via `wrangler dev --local` with an override so Hyperdrive resolves against the ephemeral branch:

```
WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=<branch-uri> \
  wrangler dev --port 8787
```

The worker code path is unchanged — it reads `env.HYPERDRIVE.connectionString` exactly as in prod.

### Hard cuts

Per `CLAUDE.md`:

- No `.env` files; everything via `doppler run`
- No `.mjs` scripts; all scripts `.ts` via `bun`
- No `tsc`; typecheck with `tsgo --noEmit`
- No backwards-compat: if an existing mocked test now has a real e2e equivalent covering the same production path, the mocked version is deleted in the same PR

## Resolved decisions

1. **Doppler source for Neon creds** — read from `ozby-shell` (matches existing infra creds). E2E workflows wrap commands in `doppler run --project ozby-shell --config preview -- ...`.
2. **`@repo/neon` implementation** — fork the narrow surface we need out of `~/repos/webpresso/packages/core/neon`. `@webpresso/neon` is `private: true` and transitively depends on two other workspace packages, so direct consumption (even via the tarball pattern used for `@webpresso/agent-kit`) is brittle. We own ~150 LOC: `createEphemeralBranch`, `deleteEphemeralBranch`, `cleanupStaleE2EBranches`, `listE2EBranches`, `generateBranchName`, `isNeonAvailable`, `getNeonConfig`. Use `@neondatabase/api-client` (same upstream webpresso uses). Keep public names identical so a future swap to a published `@webpresso/neon` is mechanical.
3. **Wrangler dev strategy** — single long-lived `wrangler dev --local` for the whole run. `vitest globalSetup` spawns it and waits on `/health`; `globalTeardown` kills the process. Per-suite cold-start would cost 3–8s × suites; state bleed is contained by per-test fixture IDs since the whole Neon branch is ephemeral.
4. **WS client** — `ws` (already a Node baseline, no new vendor).
5. **CI concurrency** — workflow sets `concurrency: group: ${{ workflow }}-${{ github.ref }}, cancel-in-progress: true` to bound branch creations; cleanup cron catches orphans.

## Foundation delivered so far

The repo-owned groundwork now lives under the exact paths this blueprint proposes:

- root `agent-kit.config.ts` wires `ak e2e` to `apps/e2e/src/agent-kit-host-adapter.ts`
- `apps/e2e` owns the local suite manifest, Vitest journey runner, and Neon branch scripts
- `packages/neon` owns the thin Neon branch API wrapper and cleanup helpers

Delivered live-worker journeys now cover:

- `journeys/worker-health.e2e.ts`
- `journeys/auth-session.e2e.ts`
- `journeys/queue-message-flow.e2e.ts`
- `journeys/topic-publish-flow.e2e.ts`

The current CI workflow runs `pnpm exec ak e2e --suite full` against local
Postgres + `wrangler dev`. The remaining gap in this blueprint is the
**ephemeral Neon branch provisioning/teardown path**, not the host-adapter seam
or live HTTP journey coverage itself.

## Proposed execution

Per repo convention: land via `/pll` in worktree `.worktrees/e2e-neon/` on branch `pll/e2e-neon`, single commit after `/verify` is green.

## Success criteria

- [ ] `pnpm --filter @repo/e2e test:journeys` passes locally with a real Neon branch
- [ ] `.github/workflows/testing-e2e.yml` green on a PR
- [ ] A branch created during a run is gone within 24h (cleanup workflow fires)
- [ ] Killing the worker mid-test fails the suite (no silent success)
- [ ] One mocked DB test is deleted because the new e2e journey covers its path
