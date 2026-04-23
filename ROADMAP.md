# Execution Roadmap

Current as of: 2026-04-23

## Completed

| Blueprint                          | Goal                                            |
| ---------------------------------- | ----------------------------------------------- |
| pnpm-catalogs-adoption             | Standardise deps via pnpm catalogs              |
| vite-plus-migration                | Replace Turbo with Vite Plus                    |
| commit-hooks-guardrails            | Husky + lint-staged + commitlint + secretlint   |
| doppler-secrets                    | Config inheritance via Doppler                  |
| ci-hardening                       | GitHub Actions gates + setup action             |
| cloudflare-pulumi-infra            | Pulumi IaC for CF infrastructure                |
| workers-hono-port                  | Hard-cut Express → Hono/Workers + Drizzle       |
| stryker-mutation-guardrails        | Per-package mutation testing + CI gate          |
| adr-lore-commit-protocol           | ADR system + lore commit trailers               |
| integration-payload-mapper-dataset | Dataset + eval harness for payload mapper       |
| agents-md-principal-rewrite        | CLAUDE.md principal-level rewrite               |
| cf-rate-limiting                   | Rate limiter middleware for Workers             |
| analytics-engine-telemetry         | Delivery-attempt telemetry via Analytics Engine |
| durable-objects-fan-out            | TopicRoom DO for WebSocket fan-out              |
| message-replay-cursor              | Postgres seq + DO cursor replay                 |

## Wave 1 — Engineering rigor first

| Blueprint                                                                                    | Goal                                                                            | Why first                                                                   |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`showcase-hardening-100`](blueprints/planned/showcase-hardening-100/_overview.md)           | Close security, contract, typecheck, CI, dependency, test, and metrics blockers | AI/branding polish over broken fundamentals would hurt the interview signal |
| [`client-route-code-splitting`](blueprints/planned/client-route-code-splitting/_overview.md) | Remove the Vite large-chunk warning and add a bundle budget gate                | Can run in parallel with hardening if file conflicts are managed            |

## Wave 2 — Public identity

| Blueprint                                                                  | Goal                                                   | Depends on               |
| -------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------ |
| [`rebrand-ingestlens`](blueprints/planned/rebrand-ingestlens/_overview.md) | Rebrand public surfaces from node-pubsub to IngestLens | `showcase-hardening-100` |

## Wave 3 — integration platform-relevant AI showcase

| Blueprint                                                                                        | Goal                                                                                                | Depends on                                     |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| [`ai-payload-intake-mapper`](blueprints/planned/ai-payload-intake-mapper/_overview.md)           | Add Workers AI suggestion-only payload mapping with validation and approval                         | `showcase-hardening-100`, `rebrand-ingestlens` |
| [`public-dataset-demo-ingestion`](blueprints/planned/public-dataset-demo-ingestion/_overview.md) | Package the demo around public `open-apply-jobs` ATS fixtures and optional allowlisted live fetches | `ai-payload-intake-mapper`                     |

## Key constraints

- Use pinned public fixtures by default; optional live public ATS fetches must be allowlisted, cached, and disabled by default.
- No paid SaaS dependency and no full connector marketplace.
- Roll out the generated `messages.seq` migration before enabling reconnect replay broadly on the WebSocket path in production.
- Treat `docs/research/2026-04-23-ingestlens-ai-integration-showcase.md` as the source for product/research rationale.
