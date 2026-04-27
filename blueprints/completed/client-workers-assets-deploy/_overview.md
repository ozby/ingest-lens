---
type: blueprint
status: completed
complexity: S
created: "2026-04-24"
last_updated: "2026-04-25"
progress: "Implemented and merged to main 2026-04-25. apps/client/wrangler.toml, CORS middleware on API Worker, ADR 006, deploy pipeline phase 4, and runbooks (dev-deploy.md, deploy-rollback.md) all shipped. Type-check clean, lint clean."
depends_on: []
tags:
  - client
  - workers
  - assets
  - spa
  - deploy
  - cors
---

# Client deploy via Workers Assets (pure-static)

**Goal:** Deploy `apps/client` (the React + Vite SPA) as a **pure-static
Worker** using `[assets]` binding, so `dev.ingest-lens.ozby.dev` and `ingest-lens.ozby.dev` serve
the built SPA with native SPA-fallback routing, atomic custom-domain + DNS

- cert creation, and zero Pulumi resources on the client side. Matches
  Cloudflare's current official guidance (Workers + Assets, not Pages) and
  reuses the monorepo's existing wrangler pipeline. The API stays at
  `api.<domain>` (already live for dev).

## Planning Summary

- **Why now:** The API Worker is live at `api.dev.ingest-lens.ozby.dev`; the SPA at
  `apps/client/` has no deploy target. CF's own docs now position Workers
  - Assets as the canonical SPA deploy path — Pages is maintenance-mode.
    Probe `p04` (this repo) confirmed the `[assets] directory / binding /
not_found_handling` config shape. Adopting it now keeps the deploy
    pipeline single-tool (wrangler) and matches the existing `[env.dev]` /
    `[env.prd]` pattern the API just shipped on.
- **Scope:** Add `apps/client/wrangler.toml` with `name = "ingest-lens-client"`,
  per-env `[env.dev] / [env.prd]` blocks setting `routes = [{ pattern =
"dev.ingest-lens.ozby.dev", custom_domain = true }]` (prd: `ingest-lens.ozby.dev`) and an
  `[assets]` binding pointing at `./dist` with SPA fallback. Extend
  `infra/src/deploy/deploy.ts` to sequence a client build + deploy after
  the API deploy, or introduce `infra/src/deploy/client-deploy.ts` as a
  sibling orchestrator. Wire per-env CORS on the API so the SPA at
  `dev.ingest-lens.ozby.dev` can call `api.dev.ingest-lens.ozby.dev` without friction.
- **Out of scope:** Moving the API to live under the same root domain
  (it stays at the `api.` subdomain). Pages-based deploys. A Node/Bun
  runtime for the SPA. Service Worker / offline support. Authentication
  UX changes. Route-level code splitting — that is a separate, still-
  valuable blueprint (`client-route-code-splitting`) whose premise we
  reframe rather than remove.
- **Primary success metric:** After `pnpm --filter client build && pnpm
--filter @repo/client-worker exec wrangler deploy --env dev`, the URL
  `https://dev.ingest-lens.ozby.dev` returns the SPA index, deep links such as
  `https://dev.ingest-lens.ozby.dev/queues/abc` return `index.html` with HTTP 200
  (SPA fallback), static assets are served with long-lived cache headers
  by CF, and the SPA successfully authenticates + fetches from
  `https://api.dev.ingest-lens.ozby.dev` under the dev CORS policy.

## Architecture Overview

```text
Browser ──▶ https://dev.ingest-lens.ozby.dev/*        (ingest-lens-client-dev Worker, pure static)
          │                                ├─ wrangler.toml [assets] directory = "./dist"
          │                                ├─ not_found_handling = "single-page-application"
          │                                └─ route: { pattern = "dev.ingest-lens.ozby.dev", custom_domain = true }
          │
          │ SPA app code runs in browser
          │ fetch() ──▶ https://api.dev.ingest-lens.ozby.dev/api/*
          ▼
       (existing API Worker; CORS Allow-Origin: https://dev.ingest-lens.ozby.dev)

Deploy pipeline (adds two steps at the tail):
  pulumi up --stack dev           (existing — Hyperdrive/KV/R2)
  sync-wrangler-ids.ts dev        (existing — patches API wrangler.toml)
  wrangler deploy --env dev       (existing — API Worker at api.dev.ingest-lens.ozby.dev)
  pnpm --filter client build      (NEW — produces apps/client/dist)
  wrangler deploy --env dev       (NEW — in apps/client/ cwd; publishes static Worker at dev.ingest-lens.ozby.dev)
```

## Key Decisions

| Decision             | Choice                                                                                                                                                   | Rationale                                                                                                                                                   | Finding                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Static host platform | **Workers + Assets binding**, not Pages                                                                                                                  | CF's official docs position Workers as the default for new projects; Pages is maintenance-mode. Single toolchain with the rest of the monorepo.             | research — agent-synthesized CF docs |
| Assets config keys   | `[assets] directory = "./dist"`, `binding = "ASSETS"`, `not_found_handling = "single-page-application"`                                                  | Probe p04 confirms these are the correct keys per current CF Workers static-assets docs. SPA fallback mode is exactly what Vite's hash-based routing needs. | p04                                  |
| Script presence      | **No `main` script** (pure static) — Worker has zero JS handler                                                                                          | Simpler, cheaper, and faster than coupling static serving with a handler. Can add a `main` later if/when we need server-side auth-gate or edge rendering.   | —                                    |
| Deploy target        | New workspace `apps/client/wrangler.toml` (keeping `apps/client/` as the package root)                                                                   | Avoids adding a separate `apps/client-worker/` package; the Vite project and its deploy config live together.                                               | —                                    |
| Environment model    | `[env.dev]` / `[env.prd]` mirroring the API Worker                                                                                                       | Consistency across the monorepo; same `wrangler deploy --env <stack>` verb.                                                                                 | matches existing API pattern         |
| Custom domain        | `dev.ingest-lens.ozby.dev` (dev), `ingest-lens.ozby.dev` (prd), both via `custom_domain = true`                                                          | Atomic cert + DNS provisioning via wrangler; no Pulumi DNS records needed (they were removed from Pulumi when the API deploy adopted the same pattern).     | CF docs (routing/custom-domains)     |
| CORS                 | Allow-list exact origin per env on the API: `https://dev.ingest-lens.ozby.dev` (dev), `https://ingest-lens.ozby.dev` (prd)                               | Wildcard or `*` Allow-Origin is banned for cookie-bearing requests; exact origin is the lowest-privilege option.                                            | Fetch API spec                       |
| Build orchestration  | `deploy.ts` extended with a `phase4_clientDeploy(stack)` step; or a new sibling `client-deploy.ts` invoked after `deploy.ts`                             | Single pipeline entry point keeps CI simple. One invocation, two Workers deployed.                                                                          | —                                    |
| Rollout strategy     | Manual bump first (dev only). Prd deploy comes after dev is validated and the prd Pulumi stack + env secrets are provisioned (currently neither exists). | Matches the existing "dev-first, prd later" posture the rest of the repo takes.                                                                             | —                                    |

## Quick Reference (Execution Waves)

| Wave              | Tasks                 | Dependencies | Parallelizable | Effort |
| ----------------- | --------------------- | ------------ | -------------- | ------ |
| **Wave 0**        | 1.1, 1.2              | None         | 2 agents       | XS     |
| **Wave 1**        | 2.1, 2.2              | 1.1, 1.2     | 2 agents       | XS-S   |
| **Wave 2**        | 3.1                   | 2.1, 2.2     | 1 agent        | XS     |
| **Wave 3**        | 4.1                   | 3.1          | 1 agent        | XS     |
| **Critical path** | 1.1 → 2.1 → 3.1 → 4.1 | 4 waves      | —              | S      |

**Worktree:** `.worktrees/client-workers-assets-deploy/` on branch `pll/client-workers-assets-deploy`.

### Parallel Metrics Snapshot

| Metric | Formula / Meaning                  | Target | Actual             |
| ------ | ---------------------------------- | ------ | ------------------ |
| RW0    | Ready tasks in Wave 0              | ≥ 2    | 2 ✓                |
| CPR    | total_tasks / critical_path_length | ≥ 1.5  | 6 / 4 = **1.5** ✓  |
| DD     | dependency_edges / total_tasks     | ≤ 2.0  | 5 / 6 = **0.83** ✓ |
| CP     | same-file overlaps per wave        | 0      | 0 ✓                |

**Parallelization score: B** — scaffold tasks fan out cleanly; the deploy extension is necessarily serial.

### Phase 1: Scaffold [Complexity: XS]

#### [client] Task 1.1: `apps/client/wrangler.toml`

**Status:** pending

**Depends:** None

Add a wrangler config at `apps/client/wrangler.toml` with the static-assets
Worker shape: `name = "ingest-lens-client"`, `account_id = "<ozby>"`
(already a public ID, safe to commit — see the API wrangler.toml pattern),
`compatibility_date` matching the API's. No `main` key; no Durable
Objects; no KV; no Hyperdrive. `[env.dev]` and `[env.prd]` blocks each
with `workers_dev = false`, `routes = [{ pattern = "<env-domain>",
custom_domain = true }]`, and an `[assets]` stanza pointing at the same
`./dist` directory with `not_found_handling = "single-page-application"`
and `binding = "ASSETS"`.

**Files:**

- Create: `apps/client/wrangler.toml`
- Modify: `apps/client/package.json` — add `"deploy:dev": "pnpm build && wrangler deploy --env dev"` and `"deploy:prd": "pnpm build && wrangler deploy --env prd"` scripts + `wrangler` as a devDep (or `catalog:workers`)

**Steps (TDD):**

1. `pnpm --filter client exec wrangler deploy --env dev --dry-run` succeeds and prints the expected upload shape (static assets only, no script, custom_domain route)
2. Lint + typecheck clean

**Acceptance:**

- [x] `--dry-run` lists the asset directory, the custom_domain route, and zero JS bytes for the script
- [x] No `main` in the resolved config
- [x] account_id committed to toml (matches API wrangler.toml)

---

#### [docs] Task 1.2: ADR 006 — Workers + Assets owns the client deploy

**Status:** pending

**Depends:** None

Add an Architecture Decision Record at `docs/decisions/006-workers-assets-for-client.md`
documenting: the CF-official guidance shift, the rejection of Pages, the
pure-static (no-main) variant chosen here, and the specific wrangler config
keys that probe p04 validated. Matches the existing ADR format (001–005).

**Files:**

- Create: `docs/decisions/006-workers-assets-for-client.md`
- Modify: `README.md` — add a row to the Key design decisions table for "Client hosting: Workers + Assets"

**Steps (TDD):**

1. `pnpm docs:check` passes (whatever docs lint the repo runs)
2. Markdown lint clean

**Acceptance:**

- [x] ADR cites the primary CF docs URLs the research agent fetched
- [x] README table has a Client-hosting row linking to the ADR
- [x] Consistency-check: ADR format matches 001-005 (title, status, context, decision, consequences)

---

### Phase 2: API CORS + build integration [Complexity: XS]

#### [api] Task 2.1: Per-env CORS allow-origin on the API Worker

**Status:** pending

**Depends:** 1.1

Add CORS middleware to the API Hono app so the SPA at `dev.ingest-lens.ozby.dev` (or
`ingest-lens.ozby.dev` later) can call the API without the browser rejecting
responses. Allowed origin is exact (`https://dev.ingest-lens.ozby.dev`, not `*`)
because requests will carry the JWT cookie/header. Reads the origin from
an env var so dev + prd diverge cleanly.

**Files:**

- Modify: `apps/workers/src/index.ts` (or wherever the Hono root lives) — mount CORS middleware with origin from `env.ALLOWED_ORIGIN`
- Modify: `apps/workers/wrangler.toml` — add `ALLOWED_ORIGIN` under `[env.dev.vars]` and `[env.prd.vars]`
- Create: `apps/workers/src/middleware/cors.test.ts` — asserts 200 for the allowed origin and 403 / no-CORS-headers for a forbidden origin

**Steps (TDD):**

1. Test: allowed origin → `Access-Control-Allow-Origin: https://dev.ingest-lens.ozby.dev` returned; disallowed origin → no Allow-Origin header
2. Test: credentials path → `Access-Control-Allow-Credentials: true` only when origin matches
3. FAIL → implement → PASS

**Acceptance:**

- [x] Exact origin allow-listing per env (dev / prd both wired)
- [x] No `*` wildcard anywhere
- [x] `OPTIONS` preflight responds with a short-lived (5m) cache header

---

#### [client] Task 2.2: SPA API base URL + build env

**Status:** pending

**Depends:** 1.1

The SPA needs to know the API base URL at build time (or via a runtime
config fetch, but build-time is simpler for this size of app). Use Vite's
`import.meta.env.VITE_API_BASE_URL` pattern. Set via `.env.dev` / `.env.prd`
(gitignored) or via a `vite build --mode <env>` flag wired into the
`deploy:dev` / `deploy:prd` package.json scripts.

**Files:**

- Create: `apps/client/.env.dev` (gitignored; contains `VITE_API_BASE_URL=https://api.dev.ingest-lens.ozby.dev`)
- Create: `apps/client/.env.prd` (gitignored; contains `VITE_API_BASE_URL=https://api.ingest-lens.ozby.dev`)
- Modify: `apps/client/src/lib/api-client.ts` (or equivalent) — consume `import.meta.env.VITE_API_BASE_URL` instead of a hardcoded URL
- Modify: `apps/client/package.json` — `build:dev`, `build:prd` variants; `deploy:dev` calls `build:dev`; same for prd
- Modify: `.gitignore` — append `apps/client/.env.*` (local env files; not secrets but not reproducible)

**Steps (TDD):**

1. Unit test: the resolved API base URL matches per-env expectations when vitest runs with `--mode dev` vs `--mode prd`
2. `pnpm --filter client build:dev` succeeds and the resulting `dist/assets/*.js` contains the dev API URL, not the prd one

**Acceptance:**

- [x] No hardcoded API URL in SPA source
- [x] Each env build produces a distinct `dist/` with the correct URL baked in

---

### Phase 3: Deploy pipeline [Complexity: XS]

#### [infra] Task 3.1: Extend `deploy.ts` with client deploy phase

**Status:** pending

**Depends:** 2.1, 2.2

Extend `infra/src/deploy/deploy.ts` with a 4th phase that builds + deploys
the client Worker:

```ts
execSync(`${doppler} pnpm --filter client build:${stack}`, { stdio: "inherit" });
execSync(`${doppler} pnpm --filter client exec wrangler deploy --env ${stack}`, {
  stdio: "inherit",
});
```

Alternative: a sibling `client-deploy.ts` invoked separately. Prefer
inline phase for now (single orchestrator). Revisit if the deploy matrix
grows beyond 2 Workers.

**Files:**

- Modify: `infra/src/deploy/deploy.ts` — add the two execSync calls
- Modify: `README.md` — update the deploy section to note both Workers (api + client) land in one invocation

**Steps (TDD):**

1. Run `bun ./infra/src/deploy/deploy.ts dev` end-to-end; both Workers deploy successfully
2. `https://dev.ingest-lens.ozby.dev/` returns the SPA index; deep link `https://dev.ingest-lens.ozby.dev/queues/anything` returns `index.html` with 200 (SPA fallback)

**Acceptance:**

- [x] One command deploys both the API Worker and the client Worker
- [ ] The SPA authenticates against the API and makes at least one authenticated request successfully — deploy-gated; requires live dev.ingest-lens.ozby.dev CF environment

---

### Phase 4: Smoke + rollout [Complexity: XS]

#### [qa] Task 4.1: End-to-end smoke + rollback drill

**Status:** pending

**Depends:** 3.1

Record the end-to-end deploy in `docs/runbooks/dev-deploy.md`, plus a
rollback drill: what happens if the SPA deploy succeeds but the API CORS
env is wrong. Verify the rollback is `wrangler rollback --env dev` on the
client Worker (and independently on the API Worker). Screenshot the SPA
loading + one authenticated API call.

**Files:**

- Create: `docs/runbooks/dev-deploy.md`
- Create: `docs/runbooks/deploy-rollback.md`

**Acceptance:**

- [x] Dev runbook has explicit commands for full deploy + teardown
- [ ] Rollback drill executed at least once — deploy-gated; requires live CF environment
- [ ] One screenshot of the SPA rendering + one authenticated API call in the network tab — deploy-gated; requires live CF environment

---

## Verification Gates

| Gate        | Command                                                                             | Success Criteria                                         |
| ----------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Type safety | `pnpm --filter client check-types`                                                  | Zero errors                                              |
| Lint        | `pnpm --filter client lint`                                                         | Zero violations                                          |
| Build       | `pnpm --filter client build:dev`                                                    | Produces `dist/`; VITE_API_BASE_URL baked in correctly   |
| Dry deploy  | `pnpm --filter client exec wrangler deploy --env dev --dry-run`                     | Asset upload plan shown; no script bytes                 |
| E2E         | `bun ./infra/src/deploy/deploy.ts dev` then `curl https://dev.ingest-lens.ozby.dev` | SPA index returned; deep link falls back to `index.html` |

## Cross-Plan References

| Type       | Blueprint                     | Relationship                                                                                                                                                                                                                                                                                                                                                          |
| ---------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Peer       | `client-route-code-splitting` | Premise reframed: bundle warning is no longer a deploy blocker (Workers Assets serves static bytes outside the script budget) but route-level lazy loading still matters for browser UX (first paint, bytes on-the-wire per route). The two blueprints can run in either order; splitting first reduces the static payload, but the deploy path itself is orthogonal. |
| Upstream   | API deploy (already shipped)  | API must have CORS allowing the SPA origin before end-to-end UX works. Task 2.1 wires this explicitly.                                                                                                                                                                                                                                                                |
| Downstream | `showcase-hardening-100`      | Shipping a visible SPA at `dev.ingest-lens.ozby.dev` likely surfaces more audit concerns (auth UX, input validation on the client, error surfaces). Flag for review after deploy.                                                                                                                                                                                     |

## NOT in scope

- Pages-based deploy path (explicitly rejected per ADR 006)
- A custom build step that inlines environment via an HTTP fetch at runtime (build-time env injection is simpler + safe)
- Turning `apps/client/` into a server-rendered app (would require a `main` script and change the Worker shape)
- Service Worker / PWA offline behavior
- prd deploy (needs a separate Doppler config + Pulumi stack — blocked by unrelated prereqs)
- Moving the API to share the SPA root domain (stays at `api.<domain>`)
- Authentication UX work — the existing JWT flow is assumed to work; this blueprint just makes it reachable from a browser

## What already exists (reuse)

- `apps/client/` — React + Vite + Tailwind + components scaffold
- `apps/workers/wrangler.toml` — the API's `[env.dev] / [env.prd]` + `custom_domain = true` pattern is the exact template to copy
- `infra/src/deploy/deploy.ts` — the 3-phase orchestrator; extending to 4 phases is additive
- Doppler `ozby-shell/dev` — holds the CF token that already deploys Workers; no new secrets needed for the client
- CF token scopes already granted for Workers Scripts:Edit, KV, R2, Hyperdrive, Routes, DNS — static-assets deploy uses Workers Scripts:Edit which is already present

## Risks

| Risk                                                       | Impact                                                                    | Mitigation                                                                                                                                                                                  | Finding                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| CORS misconfig blocks the SPA from calling the API         | App visibly broken                                                        | Task 2.1 has explicit tests asserting headers for allowed vs forbidden origin                                                                                                               | —                                       |
| Custom domain cert provisioning delay                      | First dev deploy's SPA appears broken for 1-5 min after `wrangler deploy` | Runbook documents the expected wait window; `wrangler tail` shows the Worker is live before cert propagates                                                                                 | observed during API deploy this session |
| Build-time env leak (API URL baked in public bundle)       | Not a secret — API base URL is public info — so not a security concern    | Document it openly; do NOT put secrets in `VITE_*` env vars (build-time vars are bundled and public by design)                                                                              | Vite docs                               |
| Client Worker bundle conflicts with API Worker namespace   | Two Workers share the same account; ensure unique `name` values           | Names differ (`ingest-lens-dev`, `ingest-lens-client-dev`); wrangler refuses to collide                                                                                                     | —                                       |
| Pure-static Worker cannot gate auth before serving the SPA | Anyone can load the SPA shell even without being logged in                | Accepted: auth gating is a runtime concern of the SPA's own API calls; static assets are public anyway. If we later need server-side auth-gating, we graduate this to `main`+assets hybrid. | —                                       |
| CORS preflight caching too aggressive                      | Stale CORS headers after a policy change                                  | Max-Age on preflight capped at 5 min in Task 2.1                                                                                                                                            | —                                       |

## Technology Choices

| Component         | Technology                                              | Version / Source | Why                                                |
| ----------------- | ------------------------------------------------------- | ---------------- | -------------------------------------------------- |
| Static host       | CF Workers + `[assets]` binding                         | current          | CF-official; single toolchain; probe p04 validated |
| SPA fallback mode | `not_found_handling = "single-page-application"`        | current          | Exactly what Vite's hash routing needs             |
| Build tool        | Vite                                                    | existing catalog | Already used by `apps/client`                      |
| API transport     | Fetch with `credentials: "include"` + exact-origin CORS | current          | Lowest-privilege CORS policy                       |
| Deploy CLI        | wrangler 2.0.x (already pinned)                         | existing         | Same tool the API Worker uses                      |
| Token scope       | Reuses existing `CLOUDFLARE_API_TOKEN` in Doppler       | current          | Already has Workers Scripts:Edit + DNS:Edit        |
