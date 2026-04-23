---
type: research
last_updated: "2026-04-22"
---

# Integration Payload Mapper — Dataset and Feature Design

## What it is

The integration payload mapper is a **suggestion-only** LLM assistant that helps operators and
engineers map source ATS/HRIS webhook payloads to the platform's unified internal schema.

Given a raw payload from a vendor system (Ashby, Greenhouse, Lever, BambooHR, Workday, etc.)
and a list of target unified fields, the mapper suggests:

- Which source field maps to which target field
- Which target fields are missing from the source
- Which mappings are ambiguous or require operator review
- A confidence summary

It does **not** autonomously mutate payloads in production. It is a mapping assistant, not an
autonomous transform engine.

## Why this fits the platform

The event-delivery platform already handles:

- Event acceptance and validation
- Signed payload delivery
- Retries, replay, and idempotent delivery
- Delivery state visibility and observability

The natural next layer for a unified-API platform is **integration intelligence**: helping
operators understand how source system fields align to the unified contract. Real-time delivery
only helps if the payload is correctly shaped. The mapper closes that gap.

## Dataset design

The dataset pack lives at `data/payload-mapper/` and has three layers:

### Layer 1: Schema truth

Source: Unified-API vendor docs and ATS connector docs (Ashby, Greenhouse, Lever).

Files:

- `schemas/ats/ashby-jobs.json` — Ashby job fields with unified keys
- `schemas/ats/ashby-candidates.json` — Ashby candidate fields (including ID instability note)
- `schemas/ats/ashby-applications.json` — Ashby application fields
- `schemas/ats/greenhouse-jobs.json` — Greenhouse job fields (nested departments/offices)
- `schemas/ats/lever-postings.json` — Lever posting fields (text/team/applyUrl naming)
- `schemas/hris/employee-unified-keys.json` — Unified HRIS employee field list
- `schemas/hris/employee-custom-fields.json` — Custom field alias definitions
- `schemas/vendor-docs/` — Frozen source extracts from vendor docs

### Layer 2: Realistic source payloads

Source: `open-apply-jobs` public dataset (Ashby, Greenhouse, Lever) + synthetic HRIS payloads.

Files:

- `payloads/ats/open-apply-sample.jsonl` — 8 pinned ATS job posting payloads (3 systems)
- `payloads/synthetic/employee-updates.jsonl` — 5 HRIS employee payloads (4 vendor styles)
- `payloads/synthetic/application-stage-changes.jsonl` — 5 application stage event payloads

The `open-apply-jobs` dataset is a **daily full snapshot** of public job postings, not an event
stream. The repo-local sample is pinned for deterministic demos and task generation.

### Layer 3: Gold mapping tasks

Hand-authored mapping tasks with exact expected mappings, missing-field labels, and ambiguity labels.

| File                              | Tasks | Purpose                                                    |
| --------------------------------- | ----- | ---------------------------------------------------------- |
| `mapping_tasks/train.jsonl`       | 12    | Standard mapping cases across 5 systems                    |
| `mapping_tasks/eval.jsonl`        | 8     | Held-out eval: exact-match, missing, ambiguous             |
| `mapping_tasks/adversarial.jsonl` | 7     | Hard cases: unstable IDs, unknown fields, alias collisions |

Total: 27 tasks.

## Why these data sources

**open-apply-jobs** is the best available public source of realistic ATS job posting payloads from
Ashby, Greenhouse, and Lever. It provides vendor-authentic field names and shapes without requiring
access to private production systems.

**Synthetic HRIS payloads** fill the gap where public ATS data is insufficient — specifically for
employee records, custom fields, and multi-vendor naming differences. They are derived from
vendor-documented concepts and kept intentionally close to documented field shapes.

**Vendor docs** provide the ground truth for unified keys, custom-field alias semantics, and
connector behavior (including known issues like Ashby candidate ID instability).

## Why suggestion-only

The hardest mapping problems involve:

1. **Custom fields** — same semantic meaning, many different vendor names
2. **Unstable identifiers** — Ashby candidate IDs may change after deduplication
3. **Structural differences** — Greenhouse uses nested `departments[0].name`; Lever uses `text`
4. **Alias collisions** — multiple remote fields aliasing the same unified key with different values

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
