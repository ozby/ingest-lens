---
type: adr
last_updated: "2026-04-24"
---

# ADR 0004: IngestLens Adaptive Ingestion Architecture

- **Status:** accepted
- **Date:** 2026-04-24
- **Decider(s):** repo owner

## Context

IngestLens is being positioned as a generic ingestion-observability showcase:
messy third-party payloads enter an intake flow, deterministic drift checks
identify mapping or contract uncertainty, an AI-assisted mapper proposes field
mapping repairs, an admin/operator approves or rejects the suggestion in a
dedicated approval panel, and approval versions the mapping before replaying the
source payload through deterministic ingestion into the existing delivery rails.

The architecture needs a hard boundary between probabilistic AI and deterministic
platform behavior. The product should demonstrate AI judgment where it is useful,
without letting a model mutate data, publish events, bypass authorization, or
invent hidden state.

Current repo facts that shape the decision:

- Worker HTTP routes are registered manually in `apps/workers/src/index.ts`.
- Persistent state lives in Postgres via Drizzle schema definitions in
  `apps/workers/src/db/schema.ts`.
- Delivery already uses Cloudflare Queues through `DELIVERY_QUEUE.send(...)`.
- Delivery telemetry is centralized in `apps/workers/src/telemetry.ts` and writes
  to Analytics Engine best-effort.
- Public mapping assets already live under `data/payload-mapper/`.
- The default demo must be deterministic, public-data based, and runnable without
  paid external SaaS credentials.

External platform facts checked on 2026-04-24:

- Workers AI is exposed to Workers through an `AI` binding configured in Wrangler;
  calls use `env.AI.run(model, input)`.
- Workers AI JSON Mode accepts a JSON Schema-shaped `response_format`, but
  Cloudflare documents that schema satisfaction is not guaranteed, so local parse
  and validation remain mandatory.
- Cloudflare-hosted text-generation models are runtime selectable. Model choice
  is therefore configuration, not an architectural contract embedded throughout
  the app.
- Cloudflare documents a Workers AI integration for the Vercel AI SDK through
  `workers-ai-provider`; Vercel documents `generateObject`/`streamObject` for
  schema-constrained structured data.

## Decision

### 1. AI is used only for mapping repair suggestions

The only v1 AI call is:

```text
source payload + target contract + current approved mapping revision + prompt version
  -> Workers AI mapping adapter
  -> suggestion JSON: mappings, drift categories, missing fields, ambiguous fields, confidence, notes
```

The model may suggest source paths and explain uncertainty. It must not:

- ingest live data on its own;
- validate authentication or authorization;
- normalize the final event;
- publish to queues or topics;
- approve, version, replay, or ingest a suggestion;
- decide approval;
- act as the sole judge of another model output;
- write telemetry directly;
- decide retention or redaction policy;
- serve as a source of truth for schema validity.

Every model output is parsed, schema-validated, source-path-validated,
compatibility-checked, and stored as an auditable suggestion attempt before a
human can approve it.

### 2. Deterministic code owns all state transitions after suggestion

### 2a. The admin approval panel is the control point

The public showcase needs an explicit admin/operator surface, not a hidden approval
button inside a generic intake screen. The protected client route is
`/admin/intake`. It provides:

- a pending-suggestions queue;
- detail view with source provenance, redacted payload preview, drift category,
  confidence, missing fields, ambiguous fields, validation errors, mapping diff,
  and target queue/topic;
- approve and reject actions;
- optional advisory judge critique after deterministic validation;
- post-approval replay and ingest status.

The admin panel never calls Workers AI directly. It drives Worker API state
transitions and renders the resulting trace.

The end-to-end flow is:

```text
1. operator selects a pinned fixture or pastes JSON
2. Worker authenticates, rate-limits, bounds payload size/depth, and validates envelope
3. Worker creates intakeAttemptId / mappingTraceId
4. Worker selects the target contract and current approved mapping revision
5. Worker runs deterministic drift checks and builds a versioned prompt from the contract + mapping assets
6. AI adapter returns either a repair suggestion, abstention, validation failure, or runtime failure
7. local validators reject malformed JSON, missing source paths, incompatible type changes, and invalid target fields
8. Worker persists attempt metadata, drift category, redacted summary, validation results, model/prompt metadata, and short-lived review payload reference
9. admin panel lists pending suggestions with confidence, ambiguity, missing fields, mapping diff, and delivery target
10. admin approves or rejects exactly one suggestion; approval re-checks owner scope and target queue/topic ownership
11. approval creates a new approved mapping revision and triggers deterministic replay of the original source payload through the approved mapping
12. deterministic normalizer emits `eventType: "ingest.record.normalized"` with `schemaVersion: "v1"` and ingests it by inserting the message plus queue delivery payload
13. existing message/delivery rails enqueue and deliver the normalized event
14. telemetry records drift, prompt, validation, approval, approved mapping revision, ingest, publish, delivery, retry, and replay using the same trace id
```

### 2b. Approval triggers replay and ingestion

Approval is not merely a status flag. On approval, the Worker reloads the source
payload from its fixture id or short-lived review payload, stores a new approved
approved mapping revision, applies that mapping with deterministic code, emits
`eventType: "ingest.record.normalized"` with `schemaVersion: "v1"`, inserts the
event into the existing message table, and enqueues the existing delivery
payload.

The API surface is:

```text
GET  /api/intake/mapping-suggestions?status=pending_review
GET  /api/intake/mapping-suggestions/:id
POST /api/intake/mapping-suggestions/:id/reject
POST /api/intake/mapping-suggestions/:id/approve
```

`approve` performs the first deterministic replay+ingest and is idempotent. A
manual replay endpoint is deferred until operator need is proven; retries use an
idempotency key derived from `mappingTraceId` and the approved
`mappingVersionId` so they do not create accidental duplicate ingests.

### 3. Raw payload retention is intentionally narrow

Telemetry never stores raw payload text, full document bodies, or full job descriptions. Persistence rules:

- Pinned public fixtures: store `fixtureId`, source system, source URL, payload
  hash, and schema version; reconstruct review payload from bundled fixture data.
- Pasted JSON: store the raw review payload only in owner-scoped Postgres state
  with `expiresAt`; default review TTL is 24 hours.
- Attempt metadata retained beyond the raw payload window must be redacted:
  status, confidence, validation errors, prompt version, model id, field paths,
  target schema, source hash, and operator action.

### 4. Public fixtures are bundled for the deterministic demo

The deterministic demo uses a curated, small fixture module generated from
`data/payload-mapper/payloads/ats/open-apply-sample.jsonl` and committed under the
Worker intake code, for example
`apps/workers/src/intake/demoFixtures.ts`.

Reasons:

- It works in deployed Workers and local tests without filesystem assumptions.
- It avoids adding R2/KV just to serve eight showcase records.
- It keeps the full dataset out of the Worker bundle.

Runtime live fetch stays out of v1. If freshness is needed, add a pre-demo
fixture-refresh script that fetches from allowlisted public sources, writes
pinned fixtures, records hashes, and keeps the runtime demo deterministic. A
runtime live-fetch endpoint can be revisited later only if the pinned-fixture
path is already stable and the endpoint is admin-only, allowlisted, cached,
timeout-bounded, payload-size-bounded, and secondary to pinned fixtures.

### 5. The canonical normalized event is generic and versioned

Approved mappings emit one generic event envelope. The job-posting demo lens uses
`recordType: "job_posting"`, but the platform event remains domain-neutral:

```json
{
  "eventType": "ingest.record.normalized",
  "schemaVersion": "v1",
  "recordType": "job_posting",
  "contractId": "job-posting-v1",
  "mappingVersionId": "...",
  "intakeAttemptId": "...",
  "mappingTraceId": "...",
  "source": {
    "system": "source-system-id",
    "fixtureId": "...",
    "sourceUrl": "...",
    "payloadHash": "..."
  },
  "record": {
    "externalId": "...",
    "title": "...",
    "department": "...",
    "locations": [],
    "workMode": "remote|hybrid|onsite|unknown",
    "employmentType": "...",
    "compensation": null,
    "applyUrl": "..."
  },
  "mapping": {
    "promptVersion": "payload-mapping-v1",
    "model": "...",
    "approvedBy": "...",
    "approvedAt": "..."
  }
}
```

Later domain contracts can be added only after the generic mapping and
job-posting demo lens are shipped and measured. Employee-style data remains
synthetic/adversarial in v1.

### 6. Correlation is a first-class product feature

Every intake attempt creates one `mappingTraceId`. The same id appears in:

- mapping-suggestion API responses;
- suggestion persistence rows;
- admin approval/rejection records;
- replay/ingest records;
- normalized generic event metadata;
- delivery message metadata;
- Analytics Engine datapoints;
- dashboard/replay views.

This makes the showcase auditable instead of merely decorative.

### 7. V1 intentionally avoids a platform-shaped abstraction explosion

The elegant v1 implementation has only these new conceptual pieces:

- `intake_attempts`: one row per submitted payload/suggestion/review lifecycle;
- `mapping_versions`: one approved mapping snapshot per promoted repair;
- pure functions for drift detection, mapping validation, mapping application,
  and normalized-envelope creation;
- one Workers AI adapter with deterministic fallback;
- optional Vercel AI SDK usage inside that adapter only, if it reduces
  structured-output boilerplate without introducing Vercel AI Gateway or live
  credentials into tests;
- one admin review UI;
- optional advisory judge critique that never gates approval or ingest.

Rejected for v1: runtime schema-registry CRUD, connector marketplace, runtime
live-fetch cache, Vercel AI Gateway dependency, LLM-as-judge approval gate, extra
storage service, workflow engine, and Durable Object coordination for mapping
replay. Those can be revisited only after the
deterministic pinned-fixture path is shipped and measured.

## Consequences

### Positive

- AI is visible and useful, but all dangerous transitions stay deterministic and versioned.
- The demo is runnable without live AI credentials because deterministic fallback
  and eval mode are explicit.
- Public fixtures work after deployment because the Worker does not depend on
  repo-local filesystem access.
- The trace id gives reviewers a concrete way to inspect the full lifecycle.
- Redaction and retention are architecture decisions, not comments sprinkled in
  route handlers.

### Negative

- Bundling curated fixtures requires a small build/update step when the fixture
  sample changes.
- Short-lived raw payload persistence adds cleanup/expiry behavior to implement.
- Suggestion-only AI is less flashy than autonomous mapping, but it avoids the
  wrong showcase signal: a probabilistic system silently corrupting integration
  data. Human-approved mapping revisions are the self-healing mechanism.

### Neutral / follow-ups

- The model id should remain configurable, and tests/CI must not depend on live
  model availability.
- Replay proof has two meanings: approval replay of a source payload into
  ingestion, and existing delivery/TopicRoom replay after event delivery. The
  demo must surface `mappingTraceId` through both paths.
- If fixture volume grows beyond a curated demo set, revisit R2 or KV. Do not add
  storage infrastructure for the v1 eight-record demo.
- If advisory judging is added, use a separate fake judge runner in tests and
  present the output as critique, not truth.

## Alternatives considered

- **AI normalizes and publishes directly** — rejected because it lets a model
  perform the dangerous state transition and makes non-hallucination hard to
  prove.
- **AI only in an offline eval script** — rejected because the portfolio needs a
  visible product feature, not just a background research artifact.
- **R2/KV fixture store for v1** — rejected because the deterministic demo is
  small and does not justify another deployed dependency.
- **Store every raw payload indefinitely** — rejected because observability value
  does not require retaining sensitive or verbose source text forever.
- **Separate demo-only API tree** — rejected because it hides integration risk;
  the demo should exercise the real `/api/intake/*` path.
