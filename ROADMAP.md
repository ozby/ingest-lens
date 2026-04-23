# Execution Roadmap

Current as of: 2026-04-22

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

## Wave 1 — Ready to execute (no blockers)

_No planned blueprints remain in the current wave._

## Key constraint

Roll out the generated `messages.seq` migration before enabling reconnect replay broadly on the WebSocket path in production.
