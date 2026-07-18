# IngestLens

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/ozby/ingest-lens/ci.yml?branch=main&label=CI)](https://github.com/ozby/ingest-lens/actions/workflows/ci.yml)

## Deployment lanes

- `main` deploys the shared preview lane: `https://preview-main.ingest-lens.ozby.dev` (API: `https://api.preview-main.ingest-lens.ozby.dev`).
- PRs deploy ephemeral `preview-pr-<n>` lanes and clean up on PR close.
- Production (`https://ingest-lens.ozby.dev`) is release-gated: use the production deploy workflow with matching `version_pr` metadata and a semantic `releaseVersion`; ordinary `main` pushes do not deploy production.
- Architecture source: [`docs/architecture.md`](docs/architecture.md) and machine contract [`docs/architecture.contract.json`](docs/architecture.contract.json).

## What it is

IngestLens is an integration-observability application that validates incoming third-party payloads, AI-repairs broken field mappings, delivers events through queues with retries/DLQ, and lets operators replay and debug delivery — running on Cloudflare Workers.

## Why use it

- **Deterministic safety over AI vibes** — AI mapping proposals are contract-checked, confidence-gated, and routed to human review before promotion.
- **Failure-path honesty** — delivery guarantees, retries, DLQ, and replay semantics are modeled as first-class product constraints, each backed by an E2E proof.
- **Measurement over hand-waving** — a Consistency Lab compares delivery paths on correctness, latency, and operational cost rather than asserting them.

## Quick start

This repo uses [vite-plus](https://github.com/webpresso) (`vp`) as its workspace runner and `wp secrets run` (secret-provider-wrapped) for secret injection. There are **no `.env` files**.

Bootstrap through the repo itself:

```bash
vp install
```

Success signal: dependencies install and `postinstall` runs `wp setup` to bootstrap agent hooks/links, completing with no error. This repo uses the shared global `wp` runtime contract, so repair/doctor flows should keep invoking `wp ...` directly instead of reintroducing a project-local Agent Kit wrapper. Doppler CI for this repo now uses the existing ozby workplace project `ozby-dev`, with preview and production config tokens mapped from GitHub secrets into the shared reusable workflow caller.

```bash
wp secrets run --sink dev-server --profile preview -- wp run dev
```

Success signal: secrets are injected and the vite-plus dev server / Cloudflare Worker dev process starts and stays running.

Run the dev server without secret injection:

```bash
wp run dev                :offline
```

Success signal: the dev server starts without secret injection.

## Features

| Feature                                                                                                                                                 | Proof                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adaptive intake repair — detect payload drift, AI-propose mapping fixes, validate deterministically, route low-confidence to human review               | [`apps/e2e/journeys/intake-mapping-flow.e2e.ts`](apps/e2e/journeys/intake-mapping-flow.e2e.ts), [`apps/e2e/journeys/intake-heal-ui.spec.ts`](apps/e2e/journeys/intake-heal-ui.spec.ts)                                                                                                                                                                                                                     |
| Delivery primitives — queues, topic fan-out, push retries/DLQ, replay-aware operator workflows                                                          | [`apps/e2e/journeys/queue-message-flow.e2e.ts`](apps/e2e/journeys/queue-message-flow.e2e.ts), [`apps/e2e/journeys/topic-publish-flow.e2e.ts`](apps/e2e/journeys/topic-publish-flow.e2e.ts)                                                                                                                                                                                                                 |
| Ownership/security hardening on delivery paths                                                                                                          | [`apps/e2e/journeys/ownership-hardening.e2e.ts`](apps/e2e/journeys/ownership-hardening.e2e.ts)                                                                                                                                                                                                                                                                                                             |
| Consistency Lab — compares delivery paths for correctness, latency, operational cost                                                                    | [`apps/lab/scenarios/s1a-correctness/test/e2e/full-run.test.ts`](apps/lab/scenarios/s1a-correctness/test/e2e/full-run.test.ts), [`apps/lab/scenarios/s1b-latency/test/e2e/full-run.test.ts`](apps/lab/scenarios/s1b-latency/test/e2e/full-run.test.ts)                                                                                                                                                     |
| Cloudflare Worker API + React Router/React SPA, Postgres via Hyperdrive, DELIVERY_QUEUE, Realtime Durable Objects, Workers AI mapping                   | [`apps/workers`](apps/workers), [`apps/client`](apps/client), [`docs/system-architecture.md`](docs/system-architecture.md)                                                                                                                                                                                                                                                                                 |
| Canonical PR check contract — `check`, `e2e`, `architecture-drift`, `deploy-verify` — plus local GitHub Actions via `act` and Neon E2E branch lifecycle | [`.github/workflows/ci.yml`](.github/workflows/ci.yml), [`.github/workflows/e2e.yml`](.github/workflows/e2e.yml), [`.github/workflows/architecture-drift.yml`](.github/workflows/architecture-drift.yml), [`.github/workflows/deploy-preview.yml`](.github/workflows/deploy-preview.yml), [`.github/workflows/cleanup-stale-neon-e2e-branches.yml`](.github/workflows/cleanup-stale-neon-e2e-branches.yml) |
| Agent-kit governance — bundle-budget, catalog-drift, docs-frontmatter, blueprint-lifecycle, Lore commit trailers                                        | [`package.json`](package.json) scripts, [`.github/workflows/ci.yml`](.github/workflows/ci.yml)                                                                                                                                                                                                                                                                                                             |

## Architecture

```mermaid
flowchart LR
    UI[Browser / SPA] --> API[Cloudflare Worker API]
    OPER[Operator or API client] --> API
    SRC[Third-party payload source] --> API
    API --> DB[(Postgres via Hyperdrive)]
    API --> Q[(DELIVERY_QUEUE)]
    Q --> API
    API --> RT[Realtime Durable Objects]
    RT --> UI
    API --> AI[Workers AI mapping suggestions]
```

The Consistency Lab is a separate Worker used to measure delivery-path behavior; it is not part of the primary production request path. See [`docs/system-architecture.md`](docs/system-architecture.md).

Runtime helper ownership:

- provider-neutral runtime profile / env loading is extracted into the public
  `@webpresso/runtime/env` subpath
- `ingest-lens` consumes that core directly through published
  `@webpresso/runtime/env`, with only repo-specific required-secret keys kept local
- Neon branch lifecycle helpers remain repo-local to `ingest-lens`
- `agent-kit` stays the tooling / verification surface (`wp`, `wp_*`, config
  subpaths), not the runtime/provider helper owner

## Verify

Fast contributor check (no secrets required):

```bash
wp run lint          # oxlint + per-package lint
wp run check-types   # tsc, no type errors
wp run test          # vitest suites
```

Full maintainer check (mirrors CI; some steps need secrets / a Neon E2E branch — **maintainer-only**):

```bash
vp check                          # aggregate lint + types + format
wp run build                      # all packages build; client/worker bundles emitted
wp audit docs-frontmatter
wp audit blueprint-lifecycle
wp run e2e --suite foundation     # maintainer-only: E2E suite against a Neon E2E branch (or --suite full)
```

PRs are gated by the canonical four checks:

- `check`
- `e2e`
- `architecture-drift`
- `deploy-verify`

## Contribute / Security / License

- Contributing guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security policy: [SECURITY.md](SECURITY.md)
- Code of conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- License: [MIT](LICENSE)
- Vision: [VISION.md](VISION.md)

## Docs

- [System architecture](docs/system-architecture.md)
- [Architecture](docs/architecture.md)
- [Delivery guarantees](docs/delivery-guarantees.md)
- [Claim ↔ E2E traceability](docs/guides/claim-e2e-traceability.md)
- [Reviewer guide](docs/project/REVIEWER-GUIDE.md)
- [ADR index](docs/adrs/README.md)
- [Blueprints](blueprints/README.md)
- [Project records](docs/project/README.md)
