# Blueprints

Durable implementation plans for this monorepo. Every non-trivial initiative
lives here as a blueprint before it is merged to `main`. A blueprint is the
single source of truth for why a change is happening, what "done" looks like,
and how parallel work is sequenced.

## Lifecycle

Blueprints move through directory-based states. The `status` frontmatter in
`_overview.md` must match the directory the blueprint currently lives in.

| Directory                 | Status        | Meaning                                              |
| ------------------------- | ------------- | ---------------------------------------------------- |
| `blueprints/planned/`     | `planned`     | Approved, waiting to be picked up.                   |
| `blueprints/in-progress/` | `in-progress` | Actively being executed on a branch.                 |
| `blueprints/parked/`      | `parked`      | Approved but deliberately deferred.                  |
| `blueprints/completed/`   | `completed`   | Executed, merged, and verified.                      |
| `blueprints/archived/`    | `archived`    | Superseded or withdrawn; kept for historical record. |

Transitions are plain `git mv` operations. The `$plan-refine` skill audits the
blueprint against the current repo before each transition.

Task-level blocking is tracked inside the blueprint itself: set a task
`**Status:**` to `blocked` and add a `**Blocked:**` reason. There is no
blueprint-level `blocked` status.

## Layout

Each blueprint is a directory named with a kebab-case slug. The canonical
entry point is `_overview.md`.

```text
blueprints/
  planned/
    <slug>/
      _overview.md            # canonical blueprint (required)
      research/               # optional: source captures, fact-check notes
      artifacts/              # optional: generated schemas, fixtures
```

The `_overview.md` frontmatter uses the template at
`docs/templates/blueprint.md`.

## Author a new blueprint

Invoke `$plan <slug> [goal]`. The skill will:

1. Read this README, the template, and the repo facts it needs.
2. Write `blueprints/planned/<slug>/_overview.md` with a full phase/task pool.
3. Register the slug in the blueprint index below via a follow-up edit.

## Harden a blueprint before execution

Invoke `$plan-refine <slug>`. The skill will:

1. Verify every referenced file path, workspace, command, and dependency.
2. Tighten vague acceptance criteria into checkable outcomes.
3. Confirm same-wave file conflicts are zero.
4. Update `last_updated` and append a `Refinement Summary` section.

## Active blueprints

- [`showcase-hardening-100`](./planned/showcase-hardening-100/_overview.md) — close critical audit blockers before any brand or AI polish: authz, contracts, typecheck, CI, tests, audit, and real metrics.
- [`rebrand-ingestlens`](./planned/rebrand-ingestlens/_overview.md) — replace public `node-pubsub` surfaces with the IngestLens IntegrationOps story.
- [`ai-oss-tooling-adapter`](./planned/ai-oss-tooling-adapter/_overview.md) — adopt the OSS AI/validation adapter boundary before the mapper and demo layers land.
- [`ai-payload-intake-mapper`](./planned/ai-payload-intake-mapper/_overview.md) — add a Workers AI suggestion-only payload mapping flow with validation and approval.
- [`public-dataset-demo-ingestion`](./planned/public-dataset-demo-ingestion/_overview.md) — package the demo around public `open-apply-jobs` ATS fixtures and optional allowlisted live fetches.
- [`client-workers-assets-deploy`](./planned/client-workers-assets-deploy/_overview.md) — deploy the client SPA as a pure-static Worker via wrangler's `[assets]` binding at `dev.ingest-lens.ozby.dev` (prd: `ingest-lens.ozby.dev`); CF-official Workers + Assets pattern, atomic custom domain + DNS + cert, CORS to the API Worker.
- [`consistency-lab-probes`](./planned/consistency-lab-probes/_overview.md) — pre-flight fact-check probes that reproduce every load-bearing external claim the lab blueprints rely on (Hyperdrive LISTEN/NOTIFY, Worker CPU 300s, HTMX SSE replay, Workers Assets binding, `@thi.ng/tdigest` on Workers, Doppler write API, font licenses, CF Queues one-consumer, CF billing API absence). Gates all downstream lab blueprints.
- [`consistency-lab-core`](./planned/consistency-lab-core/_overview.md) — `packages/lab-core` scaffold for the consistency lab: runner contract, `SessionLock` + `LabConcurrencyGauge` DOs, `TelemetryCollector`, allowlist `Sanitizer`, and `lab.*` Postgres schema.
- [`consistency-lab-01a-correctness`](./planned/consistency-lab-01a-correctness/_overview.md) — scenario 1a: three delivery paths (CF Queues vs Postgres polling vs Hyperdrive LISTEN/NOTIFY) run the same 10k-message workload and report inversions, duplicates, and ordering property.
- [`consistency-lab-01b-latency`](./planned/consistency-lab-01b-latency/_overview.md) — scenario 1b: same three delivery paths measured for p50/p95/p99 latency, throughput under contention, and cost-per-million from a pinned CF pricing table.
- [`consistency-lab-shell`](./planned/consistency-lab-shell/_overview.md) — `apps/lab` Hono app: HTMX-on-Hono SSR scenario pages, SSE live updates, `LAB_ENABLED` feature flag, session-cookie auth, self-hosted Inter Tight + JetBrains Mono.
- [`consistency-lab-ops`](./planned/consistency-lab-ops/_overview.md) — operational hardening: 15-min synthetic-run heartbeat, CF-billing cost alerts with $50 auto kill-switch, incident runbook, `packages/lab-core` onboarding README, HTMX-precedent note in CLAUDE.md.
- [`langfuse-prompt-tracing`](./planned/langfuse-prompt-tracing/_overview.md) — add Langfuse prompt versioning and per-call AI tracing to the Workers AI intake pipeline via `@langfuse/client` + `@langfuse/tracing` + custom Workers-compatible OTLP exporter.

## Execution roadmap

For the current wave order, Mermaid dependency DAG, and which blueprints are ready-next, see [`ROADMAP.md`](../ROADMAP.md) at the repo root.

## Research alignment notes

The current blueprint set deliberately **does not** include separate plans for:

- Cloudflare PubSub — retired; product is dead / 404 as of 2026-04-22.
- D1 for topic / subscription metadata — deferred as YAGNI while Postgres via
  Hyperdrive remains the durable data plane.
- KV as an API-key cache — deferred as YAGNI for the current JWT-based auth
  path.
- Pipelines — confirmed open beta and useful later, but not part of the
  current implementation wave.

See `docs/research/cloudflare-architecture-2026-04.md` for the fact-checked
research artifact these blueprints implement.

## Gap audit snapshot

Superseded by [`ROADMAP.md`](../ROADMAP.md). See the roadmap for the current execution order, dependency chain, and readiness assessment.

## Validation

Run `pnpm blueprints:check` to check:

- Every blueprint directory contains `_overview.md`.
- Frontmatter `status` matches the directory it lives in.
- Legacy `.omx` plan, contract, and lifecycle artifacts remain internally consistent when present.
