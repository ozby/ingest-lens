---
type: research
last_updated: "2026-04-24"
---

# IngestLens Vision

IngestLens is an **ingestion review and replay system**: it takes
messy third-party payloads, detects schema or semantic drift, proposes safe
mapping repairs with AI, requires operator approval, promotes an approved
mapping revision, replays the source payload deterministically, and proves the
result through telemetry and existing delivery rails.

This file is the canonical product-vision source. `README.md` is the public
landing page, `ROADMAP.md` is execution sequencing, and individual blueprints are
the implementation contracts. When those documents disagree, update this file
first and then make the others conform.

## One-sentence product promise

> **Deterministic intake, AI-assisted mapping repair, human approval, replay,
> delivery, and proof for messy third-party data.**

## Audience

The primary audience is an engineering hiring panel or senior technical reviewer.
The repo should demonstrate how an experienced engineer chooses a bounded product
slice, labels truth state honestly, designs failure boundaries, and verifies work
before claiming it is ready.

The product story should still read like a real operator tool, not like an
internal process demo. The process is proof; **IngestLens is the public story**.

## What IngestLens Is

IngestLens has two product layers:

1. **Review-and-replay layer.** A reviewer sees a messy third-party payload, a
   detected target-contract or mapping drift, an AI-generated repair suggestion,
   validation failures or confidence signals, an explicit approval step, an
   approved mapping revision, a replayed normalized record, and the
   delivery/telemetry trail.
2. **Runtime substrate.** Hono on Cloudflare Workers, Postgres via Hyperdrive,
   Cloudflare Queues, Durable Objects, rate limiting, and Analytics Engine
   provide the reliable delivery rails behind the demo.

Blueprints, TDD steps, CI gates, commit trailers, and docs checks remain
engineering proof, but they are process evidence rather than a product layer.
The queue/topic platform is the enabling substrate; it is no longer the headline.

## Current truth state

Use these exact truth-state labels across README, roadmap, blueprints, guides,
and UI copy:

| State       | Meaning                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------- |
| **shipped** | Executable on `main` today with local commands and tests.                                     |
| **partial** | Some real infrastructure exists, but behavior is incomplete, placeholder-backed, or drifting. |
| **planned** | Captured in a blueprint but not executable yet.                                               |

### Shipped

- Worker-based auth, queues, topics, message delivery, and queue consumer.
- Postgres-backed users, queues, messages, topics, server metrics, and queue
  metrics.
- Delivery-attempt telemetry for ack/retry/drop outcomes.
- Offline payload-mapper assets: source schemas, mapping tasks, eval contract,
  and the pinned public ATS fixture sample under `data/payload-mapper/`.
- Blueprint, docs, formatting, linting, commit, and CI guardrails.

### Partial

- Observability: delivery metrics exist, but dashboard activity/history and some
  visual health signals are not yet fully sourced from real runtime data.
- Authorization: some owner checks exist, but message operations, topic queue
  subscription, and dashboard metrics need a hardening pass before the product
  can be presented as an ingestion review system.
- Public identity: the IngestLens vision exists here and in planned blueprints,
  but README/UI labels are still being reworked by the rebrand blueprint, and
  the deployed Worker resource name remains the legacy `node-pubsub-workers`
  identifier until that rename is proven low-risk.

### Planned

- `/api/intake/*` Worker routes.
- `/intake` fixture/payload submission UI and `/admin/intake` approval console.
- Shared intake/mapping contracts in `packages/types` and Worker consumption of
  those contracts.
- Cloudflare Workers AI binding, deterministic fallback, prompt/schema boundary,
  and JSON-output validation.
- First-class mapping-suggestion persistence, approval state, validation errors,
  model metadata, and retention/redaction policy.
- Runtime access to pinned schema/fixture assets via a bundled demo-fixture
  module.
- Public fixture catalog and generic `ingest.record.normalized` events with a
  domain-specific record payload. Live public fetch is future-only.

## The core demo loop

The canonical demo should prove this end-to-end loop:

```text
messy third-party payload
  -> contract/schema selection
  -> drift detection + intake validation
  -> AI mapping repair suggestion (or abstention)
  -> local schema/path/compatibility validation
  -> quarantine or pending admin approval
  -> approved mapping revision
  -> deterministic replay through approved mapping
  -> normalized record/event ingested
  -> queue/topic delivery rails
  -> observability trail: drift, prompt, validation, approval, replay, delivery
```

A successful demo is not “the model guessed a mapping.” A successful demo proves
that the system detects drift, repairs mappings under human control, replays data
deterministically, and can explain every state transition.

## Where AI is used

AI is intentionally narrow in v1. IngestLens uses Workers AI for **one product
job**: propose a mapping repair from a messy source payload to a target
contract, with missing fields, ambiguous fields, drift categories, confidence,
and caveats.

AI does **not** own ingestion, authentication, authorization, rate limiting,
source-path validation, normalization, publishing, telemetry writes, retention,
redaction, replay, or approval. Those are deterministic platform responsibilities.

The AI boundary is:

```text
source payload + target contract + current approved mapping revision + prompt version
  -> Workers AI adapter using JSON Mode
  -> local JSON/schema/source-path/compatibility validation
  -> persisted suggestion, abstention, or quarantine reason
```

Cloudflare Workers AI JSON Mode is useful but not trusted as a guarantee. The
local validator remains the source of truth for whether a suggestion can be shown
or approved. Tests and CI use deterministic fallback/eval mode; live AI is an
opt-in demo enhancement.

## What counts as realistically messy data

IngestLens is generic; the first public demo lens uses pinned ATS job-posting
fixtures because they are public, deterministic, and free of private
candidate/employee records. The platform should also make sense for CRM leads,
support tickets, catalog feeds, partner webhooks, and vendor exports. The fixture
set should exercise at least these phenomena:

| Messy phenomenon                           | Why it matters for IngestLens                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| Rich HTML descriptions and long legal text | Requires safe HTML handling, section extraction, and telemetry that avoids raw leaks. |
| Vendor-specific field names                | `title`, `text`, `name`, `apply_url`, `applyUrl`, `location`, `locations`, etc.       |
| Multi-location / remote ambiguity          | A posting may mix city, country, remote, hybrid, timezone, and region restrictions.   |
| Compensation variance                      | Salary may be absent, range-based, currency-specific, interval-based, or text-only.   |
| Department/team/office hierarchy drift     | ATS products expose departments, teams, offices, parent IDs, or free-form labels.     |
| Custom questions and screening fields      | Application forms contain job-specific field sets and branching validation semantics. |
| Compliance and demographic blocks          | Sensitive data must be separated from evaluation/delivery paths and logged carefully. |
| Application deep links and source tracking | Apply URLs and source parameters need provenance preservation.                        |
| Snapshot vs event semantics                | Public datasets are often full snapshots, not webhooks; drift repair must be honest.  |
| Custom enterprise fields                   | Vendor exports expose tenant-defined fields, aliases, omissions, and type mismatch.   |

Near-term fixtures should stay public-job-posting oriented as the first demo
lens. Synthetic employee-style updates can remain adversarial/eval fixtures
until a privacy-safe public source is available. The product category remains
generic ingestion mapping repair, not HR intake.

## Product principles

1. **Suggestion-only AI.** The model proposes mapping repairs; it never mutates,
   promotes, replays, or publishes without approval.
2. **Validate locally.** Every model output is parsed, schema-checked,
   compatibility-checked, and verified against the source payload paths before
   persistence or approval.
3. **Abstention is success.** If the mapping is ambiguous, invalid, or too risky,
   the system records a safe abstention instead of inventing certainty.
4. **Human-in-the-loop control.** The admin sees drift category, confidence,
   validation errors, missing fields, mapping diff, delivery target, and source
   provenance before approval.
5. **No raw leakage.** Telemetry and UI summaries should avoid exposing raw
   payload text unless the specific view is explicitly designed for review.
6. **Deterministic first.** The default demo uses pinned fixtures and
   deterministic evals. Live AI is an opt-in demo enhancement; live source
   refresh should happen before the demo, not inside the runtime happy path.
7. **Advisory judges only.** LLM-as-judge can critique risk and explanation
   quality for humans, but it cannot approve, reject, replay, ingest, or replace
   deterministic validators.
8. **Truth over polish.** UI copy must label shipped, partial, and planned
   behavior honestly.
9. **No marketplace sprawl.** The scope is a focused ingestion-observability
   demo, not a connector marketplace, warehouse, or full unified API vendor.

## Canonical architecture decisions

| Decision                   | Choice                                                                                                                                     | Rationale                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Canonical docs             | Vision = durable narrative; README = landing page; ROADMAP = execution order; guides = demos                                               | Prevents source-of-truth drift.                                                           |
| Truth-state vocabulary     | `shipped`, `partial`, `planned`                                                                                                            | One vocabulary across all public surfaces.                                                |
| Product category           | Generic ingestion review, mapping repair, and replay                                                                                       | Broader and more valuable than HR-only intake while still demoable.                       |
| First demo lens            | Public ATS job postings first                                                                                                              | Useful, public, deterministic, and directly demonstrates messy integration normalization. |
| Default dataset            | Pinned `open-apply-jobs` subset under `data/payload-mapper/payloads/ats/`                                                                  | Avoids flaky demos and private PII.                                                       |
| Canonical normalized event | `eventType: "ingest.record.normalized"` with `schemaVersion`, `recordType`, and domain payload                                             | Keeps the platform generic while letting the job-posting demo emit a job-posting record.  |
| Canonical schema ownership | `packages/types/IntakeMapping.ts` plus versioned schema/eval docs under `data/payload-mapper/`                                             | Shared contracts must be usable by Worker, client, eval runner, and docs.                 |
| AI boundary                | Cloudflare Workers AI behind a single adapter with deterministic fallback                                                                  | On-stack, no paid SaaS dependency, testable without credentials.                          |
| Demo fixture access        | Bundle the curated public ATS fixture set into Worker code for v1; defer R2/KV until fixture volume justifies it                           | Deployed demo works without repo-local filesystem assumptions or extra storage.           |
| Mapping persistence        | Store attempts, drift category, validation status, approval state, approved mapping revisions, model/prompt metadata, and redacted summary | Auditability and safe self-healing are the product value.                                 |
| Telemetry source of truth  | Extend delivery telemetry for mapping lifecycle and expose measured values only                                                            | Fake health/history undermines the portfolio signal.                                      |
| Live source freshness      | Optional fixture-refresh script; no runtime live-fetch endpoint in v1                                                                      | Shows real public-data provenance without making the demo flaky.                          |
| Public/internal naming     | Public docs/UI use IngestLens; internal legacy names may remain only with explicit deferments                                              | Avoids risky churn while keeping the public story clean.                                  |
| AI use                     | AI suggests mapping repairs only; deterministic code validates, admins approve, deterministic replay ingests, and telemetry records        | Keeps probabilistic behavior out of dangerous state transitions.                          |
| Raw payload retention      | Pinned fixtures are referenced by id/hash; pasted JSON is owner-scoped with short review TTL; telemetry is redacted                        | Makes review possible without turning observability into data leakage.                    |
| Correlation id             | One `mappingTraceId` spans suggestion, admin decision, replay, ingest, normalized event, delivery, and telemetry                           | Turns the demo into an auditable lifecycle instead of disconnected screens.               |

## Elegant v1 architecture constraints

To keep the showcase maintainable, v1 must prefer fewer moving parts over a
platform-shaped abstraction explosion:

1. **Contracts as code.** Target contracts and demo mappings live in typed repo
   files for v1; no runtime schema-registry UI or contract CRUD.
2. **Two persistence concepts.** Store intake attempts and approved mapping
   versions; do not introduce separate workflow engines, job tables, or catalog
   services until evidence requires them.
3. **Pure deterministic core.** Drift detection, source-path validation, mapping
   application, and normalized-envelope creation are pure functions with focused
   tests.
4. **One probabilistic seam.** Workers AI is behind one adapter with a
   deterministic fallback. Tests never require live AI.
5. **Replay is the proof.** Approval promotes a approved mapping revision and immediately
   replays the source payload through deterministic code.
6. **No v1 runtime live fetch.** Pinned fixtures are the critical path. If
   freshness is needed, use a pre-demo fixture-refresh script that writes pinned
   fixtures and hashes.
7. **LLM-as-judge is a reviewer, not a gate.** It is worthwhile only as an
   optional admin-assist critique after deterministic validation exists and can
   be tested with a fake judge runner.

## Recommended use case

The researched product wedge is **ingestion review and replay**. AI helps repair
generic integration-data mappings, while a human admin controls approved-mapping-revision
promotion and deterministic replay. The first demo lens is public job-posting
data because it is concrete, messy, public, and safe to ship without private
records. LLM-as-judge is a good showcase addition as an admin-assist risk
reviewer and offline eval explainer, but it is not the production approver and
must not gate ingestion. See
[`docs/research/2026-04-24-self-healing-data-ingestion-architecture.md`](../2026-04-24-self-healing-data-ingestion-architecture.md).

## Decided end-to-end flow

[ADR 0004](../../adrs/0004-ingestlens-ai-intake-architecture.md) is the
canonical flow and contract source. The durable shape is deliberately small:

1. Operator selects a bundled fixture or pastes JSON.
2. Worker authenticates, rate-limits, validates the envelope, and creates
   `intakeAttemptId` / `mappingTraceId`.
3. Deterministic code selects the target contract, current approved mapping revision, and
   drift state.
4. Workers AI may propose one mapping repair suggestion or abstain; local
   validators decide whether that suggestion is reviewable.
5. Admin approval creates an approved mapping revision and immediately replays
   the source payload through deterministic normalization into
   `eventType: "ingest.record.normalized"` with `schemaVersion: "v1"`.
6. Existing queue/topic rails deliver the event, and telemetry uses the same
   trace id to prove the lifecycle.

## Blueprint execution map

1. **`showcase-hardening-100`** — make the substrate safe and honest first:
   object-level authz, contract drift, typecheck, dependency audit, CI gates,
   tests, and metrics truthfulness.
2. **`client-route-code-splitting`** — remove bundle-size warnings and add a
   frontend performance guardrail.
3. **`rebrand-ingestlens`** — align README/docs/UI with the IngestLens product
   story while preserving truth-state labels.
4. **`ai-payload-intake-mapper`** — add the protected generic intake route,
   shared data contracts, approved-mapping-revision model, AI adapter, drift validation,
   persistence, approval flow, telemetry, and deterministic eval runner.
5. **`public-dataset-demo-ingestion`** — package the public fixture catalog,
   job-posting demo lens, upstream fixture coverage, and one executable demo path.

## Known gaps that must not be hidden

| Gap                                        | Why it matters                                                                                                            | Owning blueprint                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Existing authz holes in delivery rails     | Approval/publish cannot be trusted until queue/topic/message ownership is consistent.                                     | `showcase-hardening-100`           |
| No `/api/intake/*` route yet               | The core IngestLens workflow is planned, not shipped.                                                                     | `ai-payload-intake-mapper`         |
| No `/intake` client page yet               | Public UI cannot honestly claim end-to-end intake until this exists.                                                      | `ai-payload-intake-mapper`         |
| No shared intake/target-contract model yet | Worker/client/eval cannot share mapping, drift, and replay semantics.                                                     | `ai-payload-intake-mapper`         |
| Worker does not yet consume `@repo/types`  | Shared contracts require package wiring, not just a new file.                                                             | `ai-payload-intake-mapper`         |
| No AI binding or deterministic adapter     | Live AI must be isolated and tests must pass without Cloudflare credentials.                                              | `ai-payload-intake-mapper`         |
| No mapping persistence tables              | Auditability requires attempts, drift categories, approved mapping revisions, approvals, validation errors, and metadata. | `ai-payload-intake-mapper`         |
| No runtime fixture access implementation   | The decision is now bundled curated Worker fixtures, but the code does not exist yet.                                     | `public-dataset-demo-ingestion`    |
| No `mappingTraceId` lifecycle yet          | Suggestion, approval, publish, telemetry, and replay need one correlation id.                                             | `ai-payload-intake-mapper`         |
| No raw-payload expiry/cleanup yet          | Review payloads need short TTL and redacted long-term metadata.                                                           | `ai-payload-intake-mapper`         |
| Dashboard has placeholder signals          | Observability must be measured or explicitly labelled synthetic.                                                          | `showcase-hardening-100` / AI work |
| Demo guide not canonical yet               | There should be one guide, not competing demo docs.                                                                       | `public-dataset-demo-ingestion`    |

## Demo success criteria

The portfolio demo is ready when a reviewer can run one documented path and see:

1. a pinned fixture selected from the catalog;
2. a visible messy source payload with provenance;
3. detected drift or mapping uncertainty;
4. an AI mapping repair suggestion or explicit abstention;
5. local validation of source paths, compatibility policy, required fields, and target record shape;
6. an admin approval step that creates a new approved mapping revision and shows the queue/topic delivery target;
7. approval replaying the source payload through the approved mapping;
8. one `ingest.record.normalized` event ingested through existing delivery rails;
9. delivery telemetry showing accepted, delivered/retried, and replayable state;
10. deterministic tests/evals passing without paid SaaS credentials.

## Non-goals

- No full connector marketplace.
- No private candidate or employee ingestion in the public job-posting demo lens.
- No arbitrary public-URL scraping.
- No paid LLM SaaS dependency.
- No autonomous AI writes.
- No LLM judge as production approver; judge-style critique is advisory admin-assist only.
- No claims that planned intake/mapping behavior is shipped before the blueprints
  land.

## Why this can win as a portfolio

- It is a small but realistic ingestion-platform slice rather than a generic
  CRUD app.
- It demonstrates judgment under uncertainty: AI is constrained, validated,
  evaluated, and operator-approved.
- It uses public data while still surfacing realistic enterprise-integration
  messiness: custom fields, rich text, locations, salary, compliance, and
  provider-specific naming, while the architecture remains reusable.
- It turns existing delivery infrastructure into product proof instead of
  showing queues/topics as primitives in isolation.
- It keeps senior-level engineering artifacts visible: blueprints, gates,
  test philosophy, security posture, and source-linked research.
