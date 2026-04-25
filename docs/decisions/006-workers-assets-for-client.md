---
type: adr
last_updated: "2026-04-25"
---

# ADR 006: Cloudflare Workers + Assets for client hosting

**Status:** Accepted

## Context

The SPA (`apps/client/`) needed a hosting strategy. The two Cloudflare-native
candidates were:

1. **Cloudflare Pages** — legacy static hosting tied to Git branch deployments;
   a separate product surface with its own CI pipeline primitives.
2. **Cloudflare Workers + Assets** — the CF-recommended replacement for Pages
   (workers.cloudflare.com/built-in-primitives/#workers-assets-for-static-sites).
   Declares a `[assets]` block in `wrangler.toml`, sets `directory = "./dist"`,
   and configures `not_found_handling = "single-page-application"` for
   HTML5-history deep-link fallback. No JavaScript Worker script is required —
   zero script bytes are deployed; only static assets.

The remaining architecture questions were:

- **Build-time vs. runtime API base URL** — this SPA is small enough that baking
  the URL at build time (via Vite's `VITE_` env prefix) is simpler than a
  runtime config fetch. One `build:dev` / `build:prd` script variant per
  environment suffices.
- **Separate wrangler.toml vs. shared** — the client and API Workers are
  separate programs with different binding sets. Co-locating their configs
  creates coupling and prevents independent deploys. Each app has its own
  `wrangler.toml`.

## Decision

Deploy the SPA as a pure-static Cloudflare Workers Assets Worker:

- `apps/client/wrangler.toml` declares `[assets] directory = "./dist"` with
  `not_found_handling = "single-page-application"` and no `main` key.
- Per-env `[env.dev]` and `[env.prd]` blocks each use `custom_domain = true`
  routing so wrangler atomically manages the Worker, route, DNS record, and TLS
  certificate.
- The API Worker (`apps/workers/`) gains per-env `ALLOWED_ORIGIN` vars and
  exact-origin CORS middleware so browser `fetch()` calls to
  `api.dev.ozby.dev` are permitted from `dev.ozby.dev`.
- `VITE_API_BASE_URL` is injected at build time via Vite mode-specific env
  files (`.env.dev` / `.env.prd`), consumed as
  `import.meta.env.VITE_API_BASE_URL` in the API service.
- `infra/src/deploy/deploy.ts` is extended with a Phase 4 that builds and
  deploys the client Worker immediately after the API Worker.

Cloudflare Pages is not used.

## Consequences

**Positive:**

- Single `wrangler.toml` convention across the entire repo — both Workers are
  configured, deployed, and rolled back with the same tooling (`wrangler deploy
--env <env>`).
- Pure-static mode (no `main`) means zero cold-start concern and zero Worker CPU
  cost for serving HTML/JS/CSS assets.
- `not_found_handling = "single-page-application"` provides native SPA fallback
  without a custom 404 Worker.
- `custom_domain = true` keeps DNS and TLS lifecycle inside wrangler; no manual
  Cloudflare dashboard configuration is required.
- Doppler already holds the CF token with `Workers Scripts:Edit` scope; no new
  secrets or token scopes are needed.
- One `bun ./infra/src/deploy/deploy.ts <stack>` command deploys both Workers
  atomically in the correct order.

**Negative:**

- Workers Assets is a newer feature than Pages. Any CF-side breakage in the
  Assets product affects the client deploy path.
- Build-time URL baking means a distinct `dist/` artifact per environment.
  Artifact promotion (build once, promote to prd) requires re-baking the URL,
  so that pattern is not supported.

## Alternatives considered

- **Cloudflare Pages** — rejected because CF is officially shifting new static
  hosting to Workers Assets, Pages lacks the `wrangler.toml`-native workflow,
  and adding a second deployment surface (Pages CI) would fragment the
  single-orchestrator deploy model in `deploy.ts`.
- **Runtime config fetch** — a `/config.json` endpoint returning
  `{"apiBaseUrl": "..."}` at runtime. Rejected as over-engineering for a
  fixed two-env setup; build-time baking is simpler and removes one network
  round-trip on startup.
