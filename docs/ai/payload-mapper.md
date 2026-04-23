---
type: research
last_updated: "2026-04-24"
---

# IngestLens Payload Mapper — Dataset and Eval Design

## What it is

The integration payload mapper is a **suggestion-only** LLM assistant for generic
third-party data ingestion. It helps operators repair mappings between messy
source payloads and versioned IngestLens data contracts.

Public job postings are the first demo lens, not the product boundary. The same
architecture should also make sense for CRM leads, support tickets, product
catalog feeds, partner webhooks, and vendor exports.

Given a raw payload, a target contract, and the currently approved mapping
version, the mapper suggests:

- source-path to target-field mappings;
- missing required target fields;
- ambiguous mappings that require operator review;
- drift categories such as renamed fields, new fields, type changes, or nested
  shape changes;
- a confidence summary and caveats.

It does **not** autonomously mutate payloads in production. It is a
mapping-repair assistant, not an auto-ingestion system. Self-healing means
human-approved mapping promotion and deterministic replay, not autonomous
model writes.

## AI boundary

Per [ADR 0004](../adrs/0004-ingestlens-ai-intake-architecture.md), AI is used
only for suggestion generation:

```text
source payload + target contract + current approved mapping revision + prompt version
  -> Workers AI adapter
  -> suggested mapping repair, drift categories, missing fields, ambiguous fields, confidence, notes
```

Deterministic code owns all other steps: authentication, rate limiting, payload
size/depth limits, JSON parsing, source-path validation, compatibility checks,
admin approval, approved-mapping-revision persistence, replay, ingestion, publishing,
telemetry, retention, redaction, and delivery replay. Workers AI JSON Mode is
treated as a helpful output-shaping feature, not a correctness guarantee; every
model response must still satisfy the local eval contract and source-path checks.

## LLM-as-judge policy

LLM-as-judge can be used later for offline evaluation and admin-assist critique:

- review explanation quality against a rubric;
- flag likely ambiguity or risky mappings for human review;
- compare prompt versions on pinned fixtures;
- summarize why a suggestion may deserve rejection.

It must not approve, reject, replay, ingest, or replace deterministic validators.
The production gate is deterministic validation plus admin approval. It is not in
the v1 implementation path.

## Why this fits the platform

The event-delivery platform already handles:

- event acceptance and validation;
- signed payload delivery;
- retries, replay, and idempotent delivery;
- delivery state visibility and observability.

The natural next layer is **ingestion intelligence**: detecting when a source
shape no longer matches the approved contract and helping an operator promote a
safe mapping repair. Real-time delivery only helps if the payload is correctly
shaped. The mapper closes the semantic gap while deterministic code owns hard
guarantees.

## Minimal v1 implementation shape

Keep v1 intentionally small:

1. one shared type file: `packages/types/IntakeMapping.ts`;
2. one Worker route file: `apps/workers/src/routes/intake.ts`;
3. one pure validation module for drift/source-path/contract checks;
4. one pure mapping module that applies an approved mapping to a payload;
5. one deterministic eval runner over pinned fixtures;
6. one admin review component/page pair.

Do not add a runtime schema-registry UI, connector marketplace, live-fetch cache,
LLM judge gate, or extra storage service until the deterministic path is shipped
and measured.

## Dataset design

The dataset pack lives at `data/payload-mapper/` and is split between the v1
demo lens and deferred adversarial assets.

### V1 demo lens: public job postings

The v1 demo uses pinned public job-posting payloads and target-contract fixtures:

- `payloads/ats/open-apply-sample.jsonl` — 8 pinned public job-posting payloads
  across three source shapes.
- `schemas/ats/ashby-jobs.json`, `schemas/ats/greenhouse-jobs.json`, and
  `schemas/ats/lever-postings.json` — frozen source-shape references for the
  public job-posting lens.
- `schemas/vendor-docs/` — frozen source extracts that explain the source shapes.

The `open-apply-jobs` dataset is a **daily full snapshot** of public job
postings, not an event stream. The repo-local sample is pinned for deterministic
demos and task generation.

### Deferred/adversarial assets

Candidate, application-stage, and employee-style payloads are useful for
adversarial evaluation, but they are not part of the v1 product promise:

- `schemas/ats/ashby-candidates.json`
- `schemas/ats/ashby-applications.json`
- `schemas/hris/employee-unified-keys.json`
- `schemas/hris/employee-custom-fields.json`
- `payloads/synthetic/employee-updates.jsonl`
- `payloads/synthetic/application-stage-changes.jsonl`

Keep these as synthetic/future eval material until a privacy-safe public source
exists and the job-posting lens is shipped.

### Gold mapping tasks

Hand-authored mapping tasks with exact expected mappings, missing-field labels,
and ambiguity labels.

| File                              | Purpose                                        |
| --------------------------------- | ---------------------------------------------- |
| `mapping_tasks/train.jsonl`       | Standard mapping cases                         |
| `mapping_tasks/eval.jsonl`        | Held-out eval: exact-match, missing, ambiguous |
| `mapping_tasks/adversarial.jsonl` | Hard cases: unknown fields, aliases, drift     |

## Why these data sources

**open-apply-jobs** is the best available public demo-lens source of realistic
job-posting payloads. It provides authentic field names and shapes without
requiring access to private production systems.

**Synthetic employee-style payloads** fill a future eval gap where public data is
insufficient for tenant-defined fields and multi-source naming differences. They
are deferred from the v1 product flow.

**Frozen source docs** provide ground truth for field semantics and connector
behavior without requiring live network access during tests.

## Why suggestion-only

The hardest mapping problems involve:

1. **Custom fields** — same semantic meaning, many different source names
2. **Unstable identifiers** — source IDs may change after deduplication or export
3. **Structural differences** — one source nests departments; another uses rich-text blobs
4. **Alias collisions** — multiple source fields aliasing the same target key with different values

These cases require operator judgment. Autonomous mapping with false confidence causes downstream
data corruption. The mapper surfaces uncertainty; operators confirm.

## Evaluation

See `evals/rubric.md` for the full scoring rubric and `evals/eval-contract.json` for the
machine-readable eval contract.

Key pass gates:

- Standard eval set: weighted score ≥0.75
- Adversarial set: weighted score ≥0.60
- Non-hallucination rate: ≥0.75 (hard gate)

The non-hallucination hard gate ensures the mapper never claims a source field path exists when
it does not.
