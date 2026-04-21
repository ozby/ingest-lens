# node-pubsub

An event-delivery platform built as a principal-engineer showcase: typed
end-to-end, CI-gated, secrets managed via Doppler, and structured for
progressive migration to Cloudflare Workers.

## Stack

| Layer           | Technology                                      |
| --------------- | ----------------------------------------------- |
| Runtime         | Node.js 22 / Bun (scripts)                      |
| API framework   | Express → Hono (migration: `workers-hono-port`) |
| Package manager | pnpm 9 + workspace catalogs                     |
| Build           | Turborepo                                       |
| Type checking   | tsgo (`@typescript/native-preview`)             |
| Linting         | oxlint + prettier                               |
| Testing         | Vitest (unit) + Supertest (integration)         |
| Secrets         | Doppler — no `.env` files ever                  |
| Infra           | Cloudflare Workers + Pulumi (planned)           |

## Prerequisites

Install every tool with one command:

```sh
brew bundle
```

This installs: `node`, `bun`, `pnpm`, `doppler`, `gh`, `act`, `oxlint`.
See [`Brewfile`](./Brewfile) for the full list with rationale.

Node version is pinned in `.nvmrc`. Activate it with `fnm` or `nvm`:

```sh
fnm use   # or: nvm use
```

## Secrets setup (Doppler)

This repo uses **Doppler** for all secret injection. There are no `.env` files.

```sh
# 1. Authenticate
doppler login

# 2. Link this directory to the project
doppler setup
# → select project: node-pubsub
# → select config: dev (local development)
```

Available configs:

| Config       | When to use                    |
| ------------ | ------------------------------ |
| `dev`        | Local development              |
| `test`       | Running the test suite locally |
| `preview`    | PR preview environments (CI)   |
| `production` | Production deploy (CI only)    |

## Install dependencies

```sh
pnpm install
```

## Development

```sh
# Start all apps (secrets injected by Doppler)
doppler run --config dev -- pnpm dev

# Or scope to one workspace
doppler run --config dev -- pnpm --filter api-server dev
```

## Common commands

```sh
pnpm build          # build all workspaces via Turborepo
pnpm test           # run all test suites
pnpm check-types    # type-check with tsgo (fast native checker)
pnpm lint           # oxlint across all workspaces
pnpm format         # prettier --write
pnpm catalog:check  # detect dependencies that should use catalog: refs
```

## Workspace structure

```
apps/
  api-server/          Express API — topic/queue management, auth, metrics
  notification-server/ MongoDB change-stream fan-out → subscriber delivery
  client/              Vite + React dashboard UI

packages/
  @repo/logger         Shared structured logger (Winston)
  @repo/types          Shared TypeScript types
  @repo/ui             Shared React component library
  @repo/config-eslint  Shared ESLint config
  @repo/config-typescript  Shared tsconfig bases
  @repo/jest-presets   Shared Jest/Vitest presets
```

## Commit conventions

All commits follow [Conventional Commits](https://www.conventionalcommits.org/).
The `commit-msg` hook validates format and rejects non-conforming subjects.
`lint-staged` runs oxlint + prettier on staged files at pre-commit.

```
feat(api-server): add HMAC-signed delivery receipts
fix(db): scope idempotency key to tenant
docs(adrs): record auth strategy decision
```

## Adding dependencies

Always add shared dependencies to the pnpm catalog rather than pinning
versions per-workspace:

```sh
# Add to catalog first (pnpm-workspace.yaml), then reference:
pnpm --filter api-server add some-package   # adds catalog: ref automatically
pnpm catalog:check                          # verify no drift
```

## Architecture decisions

Key decisions are recorded as ADRs in [`docs/adrs/`](./docs/adrs/):

- [ADR 0001](./docs/adrs/0001-event-delivery-signing-model.md) — HMAC signing for delivery receipts
- [ADR 0002](./docs/adrs/0002-pubsub-in-process-vs-durable.md) — In-process fan-out vs. durable queue
- [ADR 0003](./docs/adrs/0003-auth-story.md) — API key auth for v1

## Roadmap (blueprints)

Planned work lives in [`blueprints/planned/`](./blueprints/planned/).
Each blueprint is a self-contained execution spec with verification gates.

| Blueprint                     | Goal                                     | Status  |
| ----------------------------- | ---------------------------------------- | ------- |
| `workers-hono-port`           | Hard-cut Express → Hono on CF Workers    | planned |
| `cloudflare-pulumi-infra`     | CF + Pulumi infra, preview-per-PR        | planned |
| `doppler-secrets`             | Full Doppler config hierarchy            | planned |
| `ci-hardening`                | Production-grade GitHub Actions pipeline | planned |
| `stryker-mutation-guardrails` | Mutation score gates in CI               | planned |
| `vite-plus-migration`         | Turbo → Vite Plus build system           | planned |

## License

MIT
