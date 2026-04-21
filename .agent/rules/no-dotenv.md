---
type: rule
paths: ["**/*"]
last_updated: "2026-04-21"
---

# No dotenv — Doppler only for secrets

`dotenv` is forbidden in this repo. All environment configuration —
secrets, service URLs, feature flags, per-stack overrides — flows through
**Doppler**. Local `.env` files are a drift vector and a secret-leak
vector; they are not used.

## What to do instead

- **Local dev** — `doppler run --config dev -- <command>`. The `pnpm dev` wrapper (see the `doppler-secrets` blueprint) injects this automatically once that blueprint lands.
- **Per-PR preview** — `doppler run --config preview_pr_<n> -- <command>`, managed by the `preview-deploy.yml` workflow.
- **Main CI / production** — `doppler run --config preview_main | prd -- <command>`.
- **Tests that need a known-good fixture env** — define the env inline inside the test (`vi.stubEnv(...)` / `process.env.X = '...'` in `beforeEach`), not via a checked-in `.env`.

## Forbidden

- `import "dotenv/config"`
- `import dotenv from "dotenv"; dotenv.config(...)`
- `"dotenv": ...` as a dependency anywhere in the monorepo
- Committing `.env`, `.env.local`, `.env.production`, or any variant
- `require('dotenv')` in CommonJS

## Allowed

- `.env.example` as **documentation only** — lists variable names with empty or placeholder values, never real secrets.
- Node.js built-in `--env-file=<path>` for a one-off local script where Doppler access would be friction and the variables are non-secret. Prefer Doppler in all steady-state cases.

## If you find a dotenv usage

1. Replace the config file with direct `process.env.X` reads (Doppler has already injected them).
2. Delete the `dotenv` dependency from the enclosing `package.json`.
3. If a `.env` file is committed, remove it and regenerate equivalent secrets in the matching Doppler config.

## Enforcement

- Pre-commit hook will gain a grep-style check for `dotenv` imports (tracked in `commit-hooks-guardrails`).
- `pnpm blueprint:validate` will fail if any blueprint lists `dotenv` as a new dep.
