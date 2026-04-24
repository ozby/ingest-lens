# IngestLens

**AI-assisted integration observability for payload intake, mapping, delivery, and replay-aware debugging.**

IngestLens is a Cloudflare-first showcase for a common IntegrationOps problem:
third-party payloads drift, operators need help mapping them safely, and the
underlying delivery rails still need honest, observable guarantees.

## What is shipped vs. partial vs. planned?

| State | What it means here |
| --- | --- |
| **Shipped** | Worker auth, owned queues/topics, push delivery, pull receive leases, dashboard metrics, and route/client contract alignment are implemented in this repo today. |
| **Partial** | The current UI and docs now frame the product as IngestLens, but the intake-mapping review workflow is not fully built yet. |
| **Planned** | AI-assisted mapping suggestions, canonical demo-guide flows, and the public dataset ingestion story are tracked as blueprints, not presented as completed product features. |

## The product in 30 seconds

- **Input:** messy third-party payloads that need review before they can be
  trusted.
- **Control plane:** authenticated operators own the queues, topics, and future
  mapping reviews tied to their delivery rails.
- **Delivery substrate:** Cloudflare Workers + Postgres + Queues + Durable
  Objects provide the current execution backbone.
- **Observability:** dashboard stats, replay-aware fan-out, and explicit
  delivery guarantees make the system inspectable instead of magical.

## Current architecture snapshot

```mermaid
flowchart TD
    A[Third-party payload or operator action] --> B[Cloudflare Worker API]
    B --> C[Validate auth + ownership]
    C --> D[Postgres via Hyperdrive]
    D --> E[Queue/topic delivery rails]
    E --> F[Cloudflare Queues consumer]
    F --> G[Push delivery + retry / DLQ]
    F --> H[TopicRoom Durable Object fan-out]
    B -. planned .-> I[AI-assisted mapping suggestion + approval flow]
```

## Demo path

1. Register and log in.
2. Create owned queues/topics and inspect delivery/dashboard behavior.
3. Publish payloads directly or via topics and observe push + replay-aware
   delivery behavior.
4. Follow the planned IngestLens roadmap for the next layer:
   - `rebrand-ingestlens` — align all public surfaces around the product story
   - `ai-oss-tooling-adapter` — add the adapter boundary for OSS AI/validation
   - `ai-payload-intake-mapper` — add mapping suggestion + approval
   - `public-dataset-demo-ingestion` — package the canonical public dataset demo

### Public dataset demo (planned, provenance-documented)

The ATS demo lens is an explicit, public-data boundary and is intentionally
deterministic:

- **Canonical fixture source:**
  `data/payload-mapper/payloads/ats/open-apply-sample.jsonl`
- **Boundary:** public ATS job-posting payloads only (Ashby/Greenhouse/Lever sample)
  and no private connector ingestion.
- **Runtime behavior:** no runtime filesystem dependency, no default live fetch;
  the demo uses a pinned fixture catalog/bundle.
- **Route strategy:** extend and reuse existing intake routes under
  `/api/intake/*` (including mapping suggestions, pending review, approval,
  and rejection).

For a concrete flow, add the canonical walkthrough:
[`docs/guides/public-dataset-demo.md`](docs/guides/public-dataset-demo.md).

For this workstream, “provenance-correct docs” means:

- naming the exact fixture path used by the demo,
- calling out deterministic v1 behavior and optional (explicit) freshness updates,
- clearly stating what the demo is **not** (live connector, private data,
  autonomous mutation).

## Run locally from a clean checkout

```bash
pnpm install
pnpm --filter @repo/workers dev
pnpm --filter client dev
```

Local worker development expects the environment described in
[`.env.example`](./.env.example): a Postgres connection (`DATABASE_URL`) for
local development, a `JWT_SECRET`, and the same Cloudflare binding shape used by
`wrangler.toml`. Doppler remains the preferred secret-loading path for real
runs, but the package-level commands above are the clean-checkout baseline.

## Verify locally

```bash
pnpm -r lint
pnpm lint:repo
pnpm -r check-types
pnpm -r test
pnpm -r --if-present build
pnpm docs:check
pnpm blueprints:check
```

## Delivery rails, honestly stated

IngestLens is not pretending queues/topics disappeared. They remain the
execution primitives behind the product:

- **Queues** hold direct message delivery work.
- **Topics** fan out to subscribed queues.
- **Pull receive leases** are at-least-once and currently non-atomic under
  concurrent consumers.
- **Push delivery** retries with backoff and DLQ behavior.
- **Durable Objects** provide topic fan-out and short reconnect replay.

See the detailed system docs for the exact guarantees and caveats.

## Docs

- [Architecture](docs/architecture.md) — system design and truth-state notes
- [Delivery guarantees](docs/delivery-guarantees.md) — push and pull delivery behavior
- [Scale considerations](docs/scale-considerations.md) — where the current design strains
- [ADR index](docs/adrs/README.md) — durable product and architecture decisions
- [Blueprints](blueprints/README.md) — planned work, dependencies, and execution order
- [Roadmap](ROADMAP.md) — current wave plan and dependency DAG

## Why this repo exists

This repo is intentionally scoped as a **showcase**, not a full connector
platform. It demonstrates:

- secure ownership boundaries,
- honest delivery semantics,
- AI-assisted mapping as a controlled future layer,
- and a reviewable blueprint-driven execution model.

It does **not** claim:

- a finished marketplace of connectors,
- exactly-once delivery,
- a production-ready global quota system,
- or a completed AI ingestion product surface.
