# Execution Roadmap

Current as of: 2026-04-25

Vision and public positioning live in [`docs/research/product/VISION.md`](docs/research/product/VISION.md);
this file is execution sequencing only. The system-level mermaid view of
what has shipped lives in
[`docs/system-architecture.md`](docs/system-architecture.md).

## Status

Wave 1 (engineering rigor), Wave 2 (public identity / IngestLens
rebrand), and Wave 3 (integration-platform AI showcase) have all
**shipped**. The repo currently has no in-progress or planned blueprints
— `blueprints/in-progress/` and `blueprints/planned/` are empty.

## Completed

| Blueprint                          | Goal                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| pnpm-catalogs-adoption             | Standardise deps via pnpm catalogs                                                |
| vite-plus-migration                | Replace Turbo with Vite Plus                                                      |
| commit-hooks-guardrails            | Husky + lint-staged + commitlint + secretlint                                     |
| doppler-secrets                    | Config inheritance via Doppler                                                    |
| ci-hardening                       | GitHub Actions gates + setup action                                               |
| cloudflare-pulumi-infra            | Pulumi IaC for CF infrastructure                                                  |
| client-workers-assets-deploy       | SPA hosted on Workers Assets (ADR 006)                                            |
| workers-hono-port                  | Hard-cut Express → Hono/Workers + Drizzle                                         |
| stryker-mutation-guardrails        | Per-package mutation testing + CI gate                                            |
| adr-lore-commit-protocol           | ADR system + lore commit trailers                                                 |
| integration-payload-mapper-dataset | Dataset + eval harness for payload mapper                                         |
| agents-md-principal-rewrite        | CLAUDE.md principal-level rewrite                                                 |
| cf-rate-limiting                   | Rate limiter middleware for Workers                                               |
| analytics-engine-telemetry         | Delivery-attempt telemetry via Analytics Engine                                   |
| cf-queues-delivery                 | Push delivery + retry/DLQ via Cloudflare Queues                                   |
| durable-objects-fan-out            | TopicRoom DO for WebSocket fan-out                                                |
| message-replay-cursor              | Postgres seq + DO cursor replay                                                   |
| client-route-code-splitting        | Route-level lazy + bundle-budget audit gate                                       |
| consistency-lab-core               | Lab core: SessionLock, gauge, sanitizer, telemetry, kill switch, schema           |
| consistency-lab-shell              | Hono SSR + htmx shell, Workers Assets                                             |
| consistency-lab-probes             | CFQueues, PgPolling, PgDirectNotify probes                                        |
| consistency-lab-01a-correctness    | Scenario 1a: inversion / duplicate / Kendall-tau across 3 paths                   |
| consistency-lab-01b-latency        | Scenario 1b: p50/p95/p99 latency + cost annotation                                |
| consistency-lab-ops                | Heartbeat cron, cost ceiling auto-kill, audit log                                 |
| showcase-hardening-100             | Security, contract, typecheck, CI, dependency, test, and metrics blockers closed  |
| rebrand-ingestlens                 | Rebrand public surfaces from node-pubsub to IngestLens                            |
| ai-oss-tooling-adapter             | Adopt the minimal OSS AI/validation stack behind one Worker adapter               |
| ai-payload-intake-mapper           | Workers AI suggestion-only payload mapping with validation and approval           |
| public-dataset-demo-ingestion      | Demo packaged around public ATS fixture data with optional allowlisted live fetch |
| adopt-workers-test-kit             | Replace hand-rolled CF mock factories with `@webpresso/workers-test-kit`          |
| adopt-db-branching                 | Adopt `@webpresso/db-branching` `BranchProvider` interface for Neon E2E branches  |
| bump-agent-kit                     | Track `@webpresso/agent-kit` via catalog (git+ssh) — tech-debt + Lore CI          |

## Recently shipped (post-wave hardening)

These landed after the last wave closed and aren't tracked as separate
blueprints, but are load-bearing for the current state:

- **JWT jti revocation via KV** (closes tech-debt `h-001`) — commit `f29d83e`.
- **oxlint complexity ≤ 10 enforcement** — hot-path decomposition across
  workers, intake adapter, and lab core; commit `83c3a88`.
- **Pulumi `prd` stack resources + lab UI fonts committed** — commit
  `78990b0`.
- **Catalog migration of `@webpresso/agent-kit` to git+ssh** — commit
  `af1c3b7`; replaces machine-local `file:` paths.

## What's next

There is no committed wave queued. The natural follow-on candidates,
none of which are blueprints yet:

- `manual-replay-after-approval` — surface a re-run button for already-approved
  mapping revisions (deferred from `ai-payload-intake-mapper` v1).
- `additional-demo-lenses` — extend beyond the seeded ATS fixture catalog
  while preserving the public-data boundary.
- `tech-debt-h-002` / `tech-debt-h-003` — remediation steps already
  documented (`907112a`); promote to blueprints when scheduled.

## Key constraints (still binding)

- Use pinned public fixtures by default; optional live public ATS
  fetches must be allowlisted, cached, and disabled by default.
- No paid SaaS dependency and no full connector marketplace.
- Treat `docs/research/product/VISION.md` as the product source of
  truth and `docs/research/2026-04-24-messy-hr-ats-data-demo-sources.md`
  as the messy-data research source.
- Public-package isolation: extracted `@webpresso/*` deps must remain
  installable standalone — no imports from the private `webpresso/monorepo/`.
