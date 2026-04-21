---
type: blueprint
status: planned
complexity: M
created: "2026-04-21"
last_updated: "2026-04-22"
progress: "0% (refined and fact-checked dataset blueprint)"
depends_on: []
tags:
  - ai
  - datasets
  - integrations
  - unified-api
  - mapping
---

# Integration payload mapper — dataset and eval pack

**Goal:** Design a fact-checked, implementation-ready dataset pack for a small LLM-powered **integration payload mapper** inside the event-delivery platform, using public ATS/HRIS sources and a disciplined evaluation set rather than a generic HR CSV dump.

## Planning Summary

- **Primary user story:** show that the repo is not only about delivery reliability, but also a pragmatic AI-assisted integration feature that fits a unified-API platform for HR/ATS/LMS/Payroll systems.
- **Feature scope:** suggestion-only payload mapping assistant for operators/engineers; no autonomous mutation of production delivery payloads.
- **Dataset strategy:** use a **3-layer dataset**:
  1. schema/field docs as mapping truth,
  2. public ATS-originated payload-like data for realism,
  3. hand-curated gold mapping tasks for evaluation.
- **Why this is the right level:** the hardest problem here is not “find a giant HR dataset,” it is **mapping fields across systems with ambiguity, custom fields, and missing data**.
- **Output path:** `blueprints/planned/integration-payload-mapper-dataset/_overview.md`

## Problem Statement

The current event-delivery platform now has a strong story around:

- event acceptance
- signed delivery
- retries and replay
- delivery state visibility
- operator-facing observability

That is already relevant to the target platform story around unified APIs and real-time integrations. However, the user also wants one **simple LLM feature** that feels directly relevant to a platform that unifies many third-party systems.

The best-fit feature is an **integration payload mapper**:

- input: source payload + target contract / field list
- output: suggested field mappings, missing fields, ambiguous mappings, and transformation hints

This only works if the repo has a **small, credible, fact-checked dataset** for:

1. source-system fields and models,
2. target/unified keys,
3. gold mapping tasks for evaluation.

Using one giant generic HR or payroll dataset would miss the real integration problem. The dataset should instead be shaped around **schema alignment**, **custom fields**, and **cross-system field mapping**.

## Fact-Checked Findings

| ID  | Severity | Claim                                                                                | Reality                                                                                                                                                                                                                                                             | Fix in this blueprint                                                                                                    |
| --- | -------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| F1  | HIGH     | A single generic HR dataset is enough for this feature                               | It is not. Unified-API vendor docs emphasize **unified keys**, **custom-field aliases**, and **integration-specific mappings**, which is a schema-alignment problem, not a generic row-classification problem. Source: vendor custom-fields + create-employee docs. | Use a multi-layer dataset pack rather than one generic CSV.                                                              |
| F2  | HIGH     | Custom fields are just extra columns                                                 | Vendor docs show that each supported model has a `custom_fields` JSON object, aliases map remote names to unified keys, and values may be strings, numbers, objects, or arrays. Source: vendor custom-fields docs.                                                  | Dataset must preserve nested/custom-field shapes and alias metadata.                                                     |
| F3  | HIGH     | Public ATS data can provide realistic source payload examples                        | Yes, but only for certain domains. `open-apply-jobs` provides daily public data from **Ashby, Greenhouse, and Lever** with normalized posting/job attributes. It is strong for ATS-facing realism, weaker for full HRIS employee/payroll coverage.                  | Use `open-apply-jobs` as the primary public realism source for ATS-oriented examples, not as the sole dataset.           |
| F4  | HIGH     | Mapping should focus on field-level semantics rather than free-text job descriptions | Yes. Vendor create-employee flow explicitly highlights **smart field mapping using unified keys**. Source: vendor create-employee docs.                                                                                                                             | The main eval/task format should be structured field mapping, not NLP summarization.                                     |
| F5  | HIGH     | Custom-field mapping can be partially automated through alias matching               | Yes. Vendor custom-fields docs describe aliases that map multiple remote field names into one unified custom-field key.                                                                                                                                             | Include alias-driven task examples and ambiguity tests in the gold eval set.                                             |
| F6  | MEDIUM   | Webhook/event semantics are relevant to the mapper                                   | Indirectly. Vendor webhook docs and real-time-data docs reinforce that integration systems need near-real-time downstream updates and idempotent consumers, but they do not themselves provide mapping data.                                                        | Use webhook docs as product rationale, not as the core dataset source.                                                   |
| F7  | MEDIUM   | The mapper can safely become an autonomous transform engine in v1                    | No. The user explicitly wants a **simple** LLM feature, and relevance is stronger if the model is **suggestion-only** with operator review.                                                                                                                         | Add hard guardrails: suggestion-only, confidence/unknowns surfaced, explicit non-goals.                                  |
| F8  | MEDIUM   | Candidate identifiers are always stable in ATS connectors                            | Not always. Vendor Ashby connector docs note that candidate IDs may change after deduplication and recommend application IDs as a source of truth for progression tracking.                                                                                         | Include at least one mapping task that teaches/flags unstable source identifiers and recommends a more stable reference. |
| F9  | LOW      | `open-apply-jobs` is an incremental event stream                                     | It is not. The dataset is described as a daily full snapshot of active postings.                                                                                                                                                                                    | Use it for source examples and offline task generation, not as replay/event truth.                                       |
| F10 | LOW      | Every target field can be mapped confidently                                         | Not true. Vendor docs explicitly call out custom fields, remote fields, and self-serve field mapping. Some mappings should remain ambiguous or missing.                                                                                                             | Gold tasks must include “unknown / ambiguous / unmapped” examples and score restraint positively.                        |

## Evidence Base

### Primary external sources

- **Unified-API vendor docs** (source of the schema/alignment truth; specific URLs captured locally in `research/vendor-docs.manifest.json`)
  - custom-fields feature docs
  - create-employee / smart field mapping docs
  - custom-fields API (current mappings endpoint)
  - Ashby ATS connector docs
  - real-time data feature docs
  - downstream webhook docs
- **Open-Apply Jobs dataset**
  - `https://huggingface.co/datasets/edwarddgao/open-apply-jobs`

### Brownfield repo anchors

- `README.md`
- `docs/event-delivery-platform.md`
- `apps/api-server/`
- `apps/notification-server/`
- `apps/client/`
- `packages/db/`
- `packages/types/`

## Architecture Overview

```text
Unified-API vendor docs + ATS / HRIS docs
    -> field dictionaries, model names, custom-field semantics, webhook semantics

Open ATS job data (Ashby / Greenhouse / Lever)
    -> realistic public source payload examples

Curated synthetic HRIS payloads
    -> employee / employment / custom-field examples where public ATS data is insufficient

Hand-authored gold mapping tasks
    -> exact expected mappings, ambiguities, and missing-field labels

Dataset pack
  data/payload-mapper/
    schemas/
    payloads/
    mapping_tasks/
    evals/

LLM feature
  source payload + target contract
    -> suggested mappings
    -> ambiguity / missing-field warnings
    -> confidence summary
```

## Exact Dataset Design

### Directory layout

```text
data/payload-mapper/
  schemas/
    ats/
      ashby-jobs.json
      ashby-candidates.json
      ashby-applications.json
      greenhouse-jobs.json
      lever-postings.json
    hris/
      employee-unified-keys.json
      employee-custom-fields.json
  payloads/
    ats/
      ashby-job-postings.jsonl
      greenhouse-job-postings.jsonl
      lever-job-postings.jsonl
    synthetic/
      candidate-events.jsonl
      employee-updates.jsonl
      application-stage-changes.jsonl
  mapping_tasks/
    train.jsonl
    eval.jsonl
    adversarial.jsonl
  evals/
    rubric.md
    metrics.json
```

### Schema record format

Each schema file should normalize connector docs into this format:

```json
{
  "system": "ashby",
  "category": "ats",
  "model": "jobs",
  "field": "post_url",
  "field_type": "string",
  "unified_key": "post_url",
  "required": false,
  "notes": "Canonical posting URL on the ATS career site",
  "source_url": "vendor-docs:ats/connectors/ashby"
}
```

### Payload record format

Use real or synthetic source payloads in a consistent envelope:

```json
{
  "id": "ashby-job-001",
  "source_system": "ashby",
  "source_model": "jobs",
  "source_kind": "public_dataset",
  "payload": {
    "title": "AI Platform Engineer",
    "apply_url": "https://jobs.ashbyhq.com/...",
    "employment_type": "FullTime",
    "department": "Engineering",
    "locations": ["Remote"]
  },
  "source_url": "https://huggingface.co/datasets/edwarddgao/open-apply-jobs"
}
```

### Mapping task format

This is the core gold task shape:

```json
{
  "id": "map-ashby-job-001",
  "source_system": "ashby",
  "source_model": "jobs",
  "target_model": "job",
  "target_contract_version": "v1",
  "source_payload": {
    "title": "Senior Product Engineer",
    "apply_url": "https://jobs.ashbyhq.com/...",
    "department": "Engineering",
    "employment_type": "FullTime",
    "locations": ["Berlin"]
  },
  "target_fields": [
    "name",
    "post_url",
    "department",
    "employment_type",
    "location"
  ],
  "expected_mapping": {
    "name": "title",
    "post_url": "apply_url",
    "department": "department",
    "employment_type": "employment_type",
    "location": "locations[0]"
  },
  "missing_fields": [],
  "ambiguous_fields": [],
  "notes": ["List-to-scalar conversion for location is acceptable here"]
}
```

### Evaluation rubric

The eval set should score:

1. **correct exact mappings**
2. **correct missing-field detection**
3. **correct ambiguity detection**
4. **non-hallucination / abstention**
5. **useful reasoning summary**

## Seed Mapping Task Examples

### Example 1 — ATS job posting normalization

```json
{
  "id": "map-ashby-job-001",
  "source_system": "ashby",
  "source_model": "jobs",
  "target_model": "job",
  "source_payload": {
    "name": "Senior Product Engineer",
    "post_url": "https://jobs.ashbyhq.com/example/123",
    "employment_type": "FullTime",
    "department": "Engineering",
    "location": "Berlin"
  },
  "target_fields": [
    "name",
    "post_url",
    "employment_type",
    "department",
    "location"
  ],
  "expected_mapping": {
    "name": "name",
    "post_url": "post_url",
    "employment_type": "employment_type",
    "department": "department",
    "location": "location"
  },
  "missing_fields": [],
  "ambiguous_fields": []
}
```

### Example 2 — Public ATS dataset record to unified job shape

```json
{
  "id": "map-openapply-ashby-001",
  "source_system": "open-apply-jobs/ashby",
  "source_model": "job_posting_snapshot",
  "target_model": "job",
  "source_payload": {
    "title": "AI Platform Engineer",
    "apply_url": "https://jobs.ashbyhq.com/0g/...",
    "employment_type": "FullTime",
    "department": "Engineering",
    "locations": ["Remote"]
  },
  "target_fields": [
    "name",
    "post_url",
    "employment_type",
    "department",
    "location"
  ],
  "expected_mapping": {
    "name": "title",
    "post_url": "apply_url",
    "employment_type": "employment_type",
    "department": "department",
    "location": "locations[0]"
  },
  "missing_fields": [],
  "ambiguous_fields": ["location"],
  "notes": ["Remote list values may require downstream normalization"]
}
```

### Example 3 — HRIS employee custom field mapping

```json
{
  "id": "map-employee-custom-001",
  "source_system": "personio_like",
  "source_model": "hris_employees",
  "target_model": "employee",
  "source_payload": {
    "first_name": "Maya",
    "last_name": "Patel",
    "custom_fields": {
      "Favorite Color": "blue"
    }
  },
  "target_fields": ["first_name", "last_name", "custom_fields.fav_color"],
  "expected_mapping": {
    "first_name": "first_name",
    "last_name": "last_name",
    "custom_fields.fav_color": "custom_fields['Favorite Color']"
  },
  "missing_fields": [],
  "ambiguous_fields": [],
  "notes": [
    "Uses alias mapping from remote field name to unified custom-field key"
  ]
}
```

### Example 4 — Candidate payload with unstable identifier warning

```json
{
  "id": "map-ashby-candidate-001",
  "source_system": "ashby",
  "source_model": "candidates",
  "target_model": "candidate",
  "source_payload": {
    "id": "cand_remote_123",
    "first_name": "Jules",
    "last_name": "Ng",
    "email_addresses": ["jules@example.com"]
  },
  "target_fields": [
    "first_name",
    "last_name",
    "primary_email",
    "stable_progression_reference"
  ],
  "expected_mapping": {
    "first_name": "first_name",
    "last_name": "last_name",
    "primary_email": "email_addresses[0]"
  },
  "missing_fields": ["stable_progression_reference"],
  "ambiguous_fields": ["id"],
  "notes": [
    "Vendor Ashby connector docs note candidate IDs may change after deduplication; application IDs are safer for progression tracking"
  ]
}
```

### Example 5 — Downstream webhook payload adaptation

```json
{
  "id": "map-delivery-payload-001",
  "source_system": "event-platform",
  "source_model": "event",
  "target_model": "endpoint_delivery_payload",
  "source_payload": {
    "event_type": "candidate.updated",
    "payload": {
      "candidate_id": "cand_123",
      "given_name": "Maya",
      "family_name": "Patel",
      "email_address": "maya@example.com",
      "current_stage": "onsite"
    }
  },
  "target_fields": ["id", "first_name", "last_name", "email", "stage"],
  "expected_mapping": {
    "id": "payload.candidate_id",
    "first_name": "payload.given_name",
    "last_name": "payload.family_name",
    "email": "payload.email_address",
    "stage": "payload.current_stage"
  },
  "missing_fields": [],
  "ambiguous_fields": []
}
```

### Example 6 — Deliberate abstention / unknown mapping

```json
{
  "id": "map-employee-custom-unknown-001",
  "source_system": "hris_custom_fields",
  "source_model": "hris_employees",
  "target_model": "employee",
  "source_payload": {
    "custom_fields": {
      "T-Shirt Size": "Large"
    }
  },
  "target_fields": ["custom_fields.tax_id", "custom_fields.cost_center"],
  "expected_mapping": {},
  "missing_fields": ["custom_fields.tax_id", "custom_fields.cost_center"],
  "ambiguous_fields": ["custom_fields['T-Shirt Size']"],
  "notes": [
    "Correct behavior is to abstain rather than hallucinate a semantic mapping"
  ]
}
```

## Key Decisions

| Decision                      | Choice                                         | Rationale                                                                                     |
| ----------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Primary public realism source | `open-apply-jobs`                              | Public ATS data from Ashby / Greenhouse / Lever is directly relevant to unified-API platforms |
| Ground-truth schema source    | Unified-API vendor docs                        | Most relevant source for unified keys, custom fields, and connector behavior                  |
| HRIS coverage                 | Small synthetic payload pack derived from docs | Better fit than generic payroll/employee CSVs                                                 |
| Main gold task type           | Field-mapping tasks                            | Better aligned than text generation/classification tasks                                      |
| LLM feature scope             | Suggestion-only mapper                         | Stronger product fit and safer guardrails                                                     |
| Eval philosophy               | Reward correct abstention                      | Mapping quality depends on not hallucinating fields                                           |

## Quick Reference (Execution Waves)

| Wave              | Tasks                 | Dependencies | Parallelizable | Effort |
| ----------------- | --------------------- | ------------ | -------------- | ------ |
| **Wave 0**        | 1.1, 1.2, 1.3         | None         | 3 agents       | XS-S   |
| **Wave 1**        | 2.1, 2.2, 2.3         | Wave 0       | 3 agents       | S      |
| **Wave 2**        | 3.1, 3.2              | Wave 1       | 2 agents       | S-M    |
| **Wave 3**        | 4.1                   | Wave 2       | 1 agent        | S      |
| **Critical path** | 1.1 → 2.2 → 3.1 → 4.1 | --           | 4 waves        | M      |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning                  | Target | Actual       |
| ------ | ---------------------------------- | ------ | ------------ |
| RW0    | Ready tasks in Wave 0              | ≥ 3    | 3            |
| CPR    | total_tasks / critical_path_length | ≥ 2.5  | 7 / 4 = 1.75 |
| DD     | dependency_edges / total_tasks     | ≤ 2.0  | 6 / 7 = 0.86 |
| CP     | same-file overlaps per wave        | 0      | 0            |

**Parallelization score:** C

**Refinement delta:** correctness dependencies around schema-first design and eval-contract definition keep the critical path narrower than ideal, but the task pool is still parallel-safe and conflict-free.

## Task Pool

### Phase 1: Fact-checked source capture [Complexity: S]

#### [research] Task 1.1: Freeze vendor schema/mapping source extracts

**Status:** todo

**Depends:** None

Capture the exact vendor docs needed for the mapper dataset: custom fields, create employee / smart field mapping, custom fields API with current mappings, Ashby ATS connector, real-time data, and downstream webhooks. Normalize them into a stable source manifest with URLs, fetch dates, and extracted model/field notes.

**Files:**

- Create: `data/payload-mapper/schemas/manifest.json`
- Create: `data/payload-mapper/schemas/vendor-docs/ashby.json`
- Create: `data/payload-mapper/schemas/vendor-docs/custom-fields.json`
- Create: `data/payload-mapper/schemas/vendor-docs/create-employee.json`

**Steps (TDD):**

1. Write a schema validation test for `manifest.json` and source extract shape.
2. Run: `pnpm test -- --runInBand` or a targeted Vitest command — verify FAIL.
3. Capture the fact-checked extracts and normalize them.
4. Re-run the targeted test — verify PASS.
5. Run: `pnpm lint` and `pnpm check-types` for any parser/fixture helpers introduced.

**Acceptance:**

- [ ] Source manifest includes URLs, fetch date, model scope, and notes
- [ ] Extracts are structured enough to drive mapping-task generation
- [ ] The extracted docs support the claims in this blueprint

#### [research] Task 1.2: Freeze public ATS realism source

**Status:** todo

**Depends:** None

Create a small, pinned working subset from `open-apply-jobs` rather than coupling the repo to a giant remote dataset at runtime. The subset should include only the columns required for mapping-task generation and should preserve `source`, `title`, `apply_url`, `employment_type`, `department`, `locations`, and salary fields where present.

**Files:**

- Create: `data/payload-mapper/payloads/ats/open-apply-sample.jsonl`
- Create: `data/payload-mapper/payloads/ats/README.md`

**Steps (TDD):**

1. Write a fixture-shape test for the ATS sample rows.
2. Run targeted tests — verify FAIL.
3. Commit a small working subset with one or more rows from Ashby, Greenhouse, and Lever.
4. Re-run targeted tests — verify PASS.

**Acceptance:**

- [ ] Sample includes all 3 ATS sources
- [ ] Only required fields are retained
- [ ] The sample is small enough for repo use and deterministic demos

#### [research] Task 1.3: Define mapper guardrails and non-goals

**Status:** todo

**Depends:** None

Write the explicit guardrails for the LLM mapper so it remains suggestion-only, confidence-aware, and abstention-friendly. This task exists early because it defines evaluation success, not just implementation behavior.

**Files:**

- Create: `data/payload-mapper/evals/rubric.md`

**Steps (TDD):**

1. Write a checklist-style validation test or markdown assertion for required rubric sections.
2. Run targeted validation — verify FAIL.
3. Author the rubric with scoring for exact match, ambiguity detection, missing-field detection, and non-hallucination.
4. Re-run validation — verify PASS.

**Acceptance:**

- [ ] Suggestion-only behavior is explicit
- [ ] Confidence and abstention are scored
- [ ] Guardrails prevent autonomous mapping claims

### Phase 2: Exact data-model design [Complexity: S]

#### [schema] Task 2.1: Implement the exact dataset schemas

**Status:** todo

**Depends:** Task 1.1, Task 1.2, Task 1.3

Define the exact JSON/JSONL schemas for:

- schema records
- payload records
- mapping task records
- eval metadata

This must be machine-readable and strict enough that examples and future code can validate against it.

**Files:**

- Create: `data/payload-mapper/schema-record.schema.json`
- Create: `data/payload-mapper/payload-record.schema.json`
- Create: `data/payload-mapper/mapping-task.schema.json`
- Create: `data/payload-mapper/evals/metrics.json`

**Steps (TDD):**

1. Write failing validation tests for the four schema files.
2. Run targeted tests — verify FAIL.
3. Implement the schemas and example fixtures.
4. Re-run targeted tests — verify PASS.

**Acceptance:**

- [ ] Every dataset artifact shape is explicitly specified
- [ ] The schemas are compatible with the examples in this blueprint
- [ ] Validation catches unknown or malformed mapping-task fields

#### [data] Task 2.2: Create the first gold mapping-task pack

**Status:** todo

**Depends:** Task 2.1

Create a first gold mapping-task pack with exact expected mappings, missing-field labels, ambiguity labels, and notes. Start with the six examples in this blueprint, then expand to at least 20 tasks spread across ATS jobs, ATS candidates/applications, HRIS employee/custom-field examples, and event-delivery payload adaptation.

**Files:**

- Create: `data/payload-mapper/mapping_tasks/train.jsonl`
- Create: `data/payload-mapper/mapping_tasks/eval.jsonl`
- Create: `data/payload-mapper/mapping_tasks/adversarial.jsonl`

**Steps (TDD):**

1. Write a test that asserts task IDs are unique, task splits are valid, and every row validates against the schema.
2. Run targeted tests — verify FAIL.
3. Create the first 20 mapping tasks across train/eval/adversarial.
4. Re-run targeted tests — verify PASS.

**Acceptance:**

- [ ] At least 20 tasks exist
- [ ] Eval set includes exact-match, ambiguous, missing-field, and abstention cases
- [ ] Adversarial set includes unstable-ID and custom-field alias cases

#### [data] Task 2.3: Create a synthetic HRIS payload subset

**Status:** todo

**Depends:** Task 1.1, Task 2.1

Because public ATS data is not enough for the employee/custom-field mapping story, create a small synthetic HRIS payload pack derived from vendor HRIS docs and custom-field behavior. Keep it intentionally small and schema-shaped, not randomly generated.

**Files:**

- Create: `data/payload-mapper/payloads/synthetic/employee-updates.jsonl`
- Create: `data/payload-mapper/payloads/synthetic/application-stage-changes.jsonl`

**Steps (TDD):**

1. Write a fixture validation test against the payload schema.
2. Run targeted tests — verify FAIL.
3. Author the synthetic HRIS payloads.
4. Re-run targeted tests — verify PASS.

**Acceptance:**

- [ ] Synthetic payloads cover employee, custom-field, and progression examples
- [ ] Examples stay close to vendor-documented concepts
- [ ] No unrealistic/random field drift is introduced

### Phase 3: Evaluation and repo fit [Complexity: M]

#### [qa] Task 3.1: Build a mapper evaluation harness contract

**Status:** todo

**Depends:** Task 2.2, Task 2.3

Define the exact evaluation contract for the future LLM mapper:

- input format
- expected output format
- scoring fields
- pass/fail thresholds

This task does not need a full model integration yet; it needs an executable contract that future implementations can target.

**Files:**

- Create: `data/payload-mapper/evals/eval-contract.json`
- Create: `data/payload-mapper/evals/README.md`

**Steps (TDD):**

1. Write validation tests for the eval contract file.
2. Run targeted tests — verify FAIL.
3. Implement the contract and scoring rules.
4. Re-run targeted tests — verify PASS.

**Acceptance:**

- [ ] Eval contract can score exact mappings, ambiguity detection, missing-field detection, and abstention
- [ ] Future mapper implementations can be plugged into the contract
- [ ] The scoring favors “do not hallucinate” behavior

#### [docs] Task 3.2: Integrate the dataset story into the event-delivery platform docs

**Status:** todo

**Depends:** Task 3.1

Document how the mapper dataset fits the platform story:

- why this feature fits a unified-API platform
- why these data sources were chosen
- why the mapper is suggestion-only

**Files:**

- Modify: `README.md`
- Modify: `docs/event-delivery-platform.md`
- Create: `docs/ai/payload-mapper.md`

**Steps (TDD):**

1. Write a docs-format and content-presence check for the new section/page.
2. Run validation — verify FAIL.
3. Add the dataset + mapper docs.
4. Re-run validation — verify PASS.

**Acceptance:**

- [ ] Repo docs explain the mapper feature honestly
- [ ] Dataset choice is explained as schema/mapping truth + realism + gold tasks
- [ ] No overclaiming about autonomous mapping or production trust

### Phase 4: Final hardening [Complexity: S]

#### [qa] Task 4.1: Verify blueprint readiness and parallel safety

**Status:** todo

**Depends:** Task 3.1, Task 3.2

Run the final refinement audit on the dataset blueprint output itself:

- every file path exists or is intentionally planned
- every task is self-contained
- task dependencies are honest
- no same-wave file conflicts

**Files:**

- Modify: `blueprints/planned/integration-payload-mapper-dataset/_overview.md`

**Steps (TDD):**

1. Audit the blueprint against this repo and fix any stale assumptions.
2. Run: `pnpm exec prettier --check blueprints/planned/integration-payload-mapper-dataset/_overview.md docs/templates/blueprint.md`
3. Run any lightweight structure check created for blueprint docs.

**Acceptance:**

- [ ] Blueprint is self-contained and execution-ready
- [ ] Exact dataset design is frozen
- [ ] Mapping task examples are present and consistent with the task schema

## Verification Gates

| Gate        | Command                                                                                                                     | Success Criteria                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Formatting  | `pnpm exec prettier --check blueprints/planned/integration-payload-mapper-dataset/_overview.md docs/templates/blueprint.md` | Clean                                                                   |
| Root checks | `pnpm lint`                                                                                                                 | No new lint failures introduced by helper scripts/docs if any are added |
| Type safety | `pnpm check-types`                                                                                                          | No type errors introduced by dataset helpers/tests                      |
| Tests       | `pnpm test` or targeted Vitest commands                                                                                     | Dataset schema + task validation passes                                 |

## Cross-Plan References

| Type       | Blueprint                                      | Relationship                               |
| ---------- | ---------------------------------------------- | ------------------------------------------ |
| Upstream   | `deep-interview-integration-node-pubsub` spec  | Clarified interview framing                |
| Downstream | Future payload-mapper implementation blueprint | This dataset/eval plan is the prerequisite |

## Edge Cases and Error Handling

| Edge Case                                      | Risk                           | Solution                                           | Task     |
| ---------------------------------------------- | ------------------------------ | -------------------------------------------------- | -------- |
| ATS field exists in one source but not another | Hallucinated mapping           | Require missing-field output                       | 2.2, 3.1 |
| Custom field value is nested object/list       | Mapper oversimplifies          | Preserve raw value shape in schema + eval          | 1.1, 2.1 |
| Candidate identifiers are unstable             | Incorrect “primary key” advice | Add explicit unstable-ID adversarial tasks         | 2.2      |
| Public ATS source lacks HRIS fields            | False completeness             | Add synthetic HRIS subset with explicit provenance | 2.3      |
| Alias mapping hides ambiguity                  | Overconfident answers          | Score ambiguity detection separately               | 1.3, 3.1 |

## Non-goals

- Building the actual LLM mapper runtime in this blueprint
- Fine-tuning or training a custom model
- Full HRIS/payroll dataset collection across many vendors
- Autonomous production payload mutation
- A giant generic HR data lake

## Risks

| Risk                                                           | Impact | Mitigation                                                    |
| -------------------------------------------------------------- | ------ | ------------------------------------------------------------- |
| Dataset overfits to ATS jobs and underrepresents HRIS payloads | Medium | Add synthetic HRIS subset from documented vendor concepts     |
| Mapper looks like a toy because tasks are too easy             | High   | Include ambiguity, missing-field, and unstable-ID tasks       |
| Public sources drift over time                                 | Medium | Pin small repo-local samples instead of live-fetch-only demos |
| The feature overshadows platform reliability story             | High   | Keep the mapper suggestion-only and small                     |

## Technology Choices

| Component          | Technology / Source          | Version / State     | Why                                                              |
| ------------------ | ---------------------------- | ------------------- | ---------------------------------------------------------------- |
| Public ATS realism | `edwarddgao/open-apply-jobs` | live public dataset | Best public Ashby/Greenhouse/Lever realism source                |
| Schema truth       | Unified-API vendor docs      | live docs           | Most relevant source for unified keys and custom-field semantics |
| HRIS examples      | Synthetic JSONL              | repo-local          | Better than generic CSVs for mapping tasks                       |
| Eval format        | JSONL + JSON Schema          | repo-local          | Easy to validate and diff                                        |

## Refinement Summary

| Metric                      | Value   |
| --------------------------- | ------- |
| Findings total              | 10      |
| Critical                    | 0       |
| High                        | 5       |
| Medium                      | 3       |
| Low                         | 2       |
| Fixes applied in plan       | 10/10   |
| Cross-plan references added | 2       |
| Edge cases documented       | 5       |
| Risks documented            | 4       |
| Parallelization score       | C       |
| Critical path               | 4 waves |
| Max parallel agents         | 3       |
| Total tasks                 | 7       |
| Blueprint compliant         | Yes     |

## Refinement Summary (2026-04-22 pass)

Findings:

- All `Files:` paths resolve against the repo root (`data/payload-mapper/` is intentionally created by Task 1.1).
- Product-wedge anchor: **the AI capstone surface** in `VISION.md` + first-consumer file `apps/api-server/src/platform/services/payloadMapper.ts` (future file referenced by blueprint — acceptable since blueprint explicitly creates it).
- Cross-plan references point to `deep-interview-*` which does not exist under `blueprints/`; marked as _upstream conversational context_, not a blueprint dependency.

Fixes applied in this pass:

- Acceptance bullets already carry proving commands or artifact checks (prettier, schema-validation tests).
- Added VISION.md anchor confirming this is the AI capstone.

**Blueprint compliant: Yes.** Execution-ready.
