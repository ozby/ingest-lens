# Execution Roadmap

Current as of: 2026-04-22

## Completed

| Blueprint                          | Goal                                          |
| ---------------------------------- | --------------------------------------------- |
| pnpm-catalogs-adoption             | Standardise deps via pnpm catalogs            |
| vite-plus-migration                | Replace Turbo with Vite Plus                  |
| commit-hooks-guardrails            | Husky + lint-staged + commitlint + secretlint |
| doppler-secrets                    | Config inheritance via Doppler                |
| ci-hardening                       | GitHub Actions gates + setup action           |
| cloudflare-pulumi-infra            | Pulumi IaC for CF infrastructure              |
| workers-hono-port                  | Hard-cut Express → Hono/Workers + Drizzle     |
| stryker-mutation-guardrails        | Per-package mutation testing + CI gate        |
| adr-lore-commit-protocol           | ADR system + lore commit trailers             |
| integration-payload-mapper-dataset | Dataset + eval harness for payload mapper     |
| agents-md-principal-rewrite        | CLAUDE.md principal-level rewrite             |

## Wave 1 — Ready to execute (no blockers)

| Blueprint          | Goal                                                  | Blocks                                              |
| ------------------ | ----------------------------------------------------- | --------------------------------------------------- |
| cf-queues-delivery | Replace fire-and-forget delivery with CF Queues + DLQ | durable-objects-fan-out, analytics-engine-telemetry |
| cf-rate-limiting   | Rate limiter middleware for Workers                   | —                                                   |

## Wave 2 — Blocked on Wave 1

| Blueprint                  | Goal                                            | Blocked by         |
| -------------------------- | ----------------------------------------------- | ------------------ |
| durable-objects-fan-out    | TopicRoom DO for WebSocket fan-out              | cf-queues-delivery |
| analytics-engine-telemetry | Delivery attempt telemetry via Analytics Engine | cf-queues-delivery |

## Wave 3 — Blocked on Wave 2

| Blueprint             | Goal                            | Blocked by              |
| --------------------- | ------------------------------- | ----------------------- |
| message-replay-cursor | Postgres seq + DO cursor replay | durable-objects-fan-out |

## Key constraint

`cf-queues-delivery` requires Cloudflare Queue resources provisioned in `infra/`
(via Pulumi) before the Worker queue binding is active in production.
