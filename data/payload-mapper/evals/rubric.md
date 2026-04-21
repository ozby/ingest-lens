# Payload Mapper Eval Rubric

## Scope

This rubric governs evaluation of the integration payload mapper — a **suggestion-only** LLM assistant
that maps source ATS/HRIS payloads to a unified target contract. The mapper is **not** an autonomous
transform engine; it surfaces suggestions, ambiguities, and missing fields for operator review.

## Guardrails (Non-negotiable)

- The mapper MUST NOT autonomously mutate production delivery payloads.
- The mapper MUST surface a confidence summary alongside every mapping suggestion.
- The mapper MUST explicitly list fields it cannot map (`missing_fields`).
- The mapper MUST explicitly list fields with uncertain mappings (`ambiguous_fields`).
- The mapper MUST abstain (return `expected_mapping: {}`) when no confident mapping exists.
- The mapper MUST NOT hallucinate source field paths that do not exist in the payload.

## Scoring Dimensions

### 1. Exact Mapping Accuracy (0–40 pts)

Score the fraction of target fields where the suggested source path exactly matches the gold mapping.

| Condition | Points |
|-----------|--------|
| Exact match on all mapped fields | 40 |
| ≥90% of mapped fields exactly correct | 36 |
| ≥75% of mapped fields exactly correct | 28 |
| ≥50% of mapped fields exactly correct | 20 |
| <50% correct | 0 |

Exact match means the `expected_mapping` field value (source path expression) is identical to the gold label.

### 2. Missing-Field Detection (0–20 pts)

Score whether the mapper correctly identifies target fields that cannot be populated from the source.

| Condition | Points |
|-----------|--------|
| All missing fields correctly identified, no false positives | 20 |
| All missing fields identified, ≤1 false positive | 16 |
| ≥50% of missing fields identified | 8 |
| Missing fields not reported or all false positives | 0 |

### 3. Ambiguity Detection (0–20 pts)

Score whether the mapper correctly flags uncertain or multi-interpretation mappings.

| Condition | Points |
|-----------|--------|
| All ambiguous fields flagged, no false flags on clear mappings | 20 |
| All ambiguous fields flagged, ≤1 false flag | 16 |
| ≥50% of ambiguous fields flagged | 8 |
| No ambiguity detection or excessive false flags | 0 |

### 4. Non-Hallucination / Abstention (0–20 pts)

Score whether the mapper abstains correctly when no confident mapping exists and avoids fabricating source paths.

| Condition | Points |
|-----------|--------|
| Correct abstention on all adversarial/unknown cases; zero hallucinated paths | 20 |
| Correct abstention on ≥75% of adversarial cases; ≤1 hallucinated path | 15 |
| Correct abstention on ≥50% of adversarial cases | 8 |
| Mapper hallucinated paths or mapped unknown fields with false confidence | 0 |

### 5. Reasoning Summary Quality (0–10 pts, qualitative)

Score the quality of the mapper's reasoning/explanation output.

| Condition | Points |
|-----------|--------|
| Clear reasoning for each mapping decision; caveats noted for type conversions and ambiguities | 10 |
| Partial reasoning; major decisions explained | 6 |
| Minimal or absent reasoning | 0 |

**Total: 110 points maximum (100 weighted + 10 qualitative bonus)**

## Pass Thresholds

| Evaluation Set | Minimum Score | Gate |
|----------------|---------------|------|
| `eval.jsonl` (standard) | ≥75/100 | Required for merge |
| `adversarial.jsonl` | ≥60/100 | Required for merge |
| Non-hallucination dimension | ≥15/20 | Hard gate; must pass independently |

## Adversarial Scoring Rules

On `adversarial.jsonl`, the following behaviors are **rewarded**:

- Returning `expected_mapping: {}` when no mapping is confident
- Flagging `candidate_id` as ambiguous due to potential deduplication instability
- Detecting alias collisions (multiple remote fields aliasing the same unified key with different values)
- Detecting type mismatches (e.g. Unix ms vs ISO 8601) without silently dropping the field
- Detecting empty array access risks (e.g. `departments[0].name` on an empty array)

The following behaviors are **penalized heavily** on adversarial cases:

- Mapping `T-Shirt Size` to `tax_id` or `cost_center` (semantic hallucination)
- Treating an unstable `candidate_id` as a stable progression reference
- Silently selecting one alias when a collision exists
- Applying a numeric timestamp directly to an ISO 8601 field without flagging conversion

## Evaluation Protocol

1. Load eval tasks from `mapping_tasks/eval.jsonl` and `mapping_tasks/adversarial.jsonl`.
2. For each task, run the mapper with the `source_payload` and `target_fields`.
3. Compare mapper output to `expected_mapping`, `missing_fields`, and `ambiguous_fields`.
4. Score each dimension independently per task.
5. Report aggregate scores per eval set and per dimension.
6. Flag any task where the non-hallucination score is 0 for manual review.
