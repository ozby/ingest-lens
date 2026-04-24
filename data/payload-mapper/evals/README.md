# Payload Mapper Evals

This directory contains the evaluation contract, rubric, and metrics spec for the integration payload mapper.

## Files

| File                 | Purpose                                                                             |
| -------------------- | ----------------------------------------------------------------------------------- |
| `rubric.md`          | Human-readable scoring rubric with guardrails, dimensions, and pass thresholds      |
| `metrics.json`       | Machine-readable metric definitions with formulas, weights, and thresholds          |
| `eval-contract.json` | Executable contract: input/output format + scoring rules for mapper implementations |

## How to use

1. Load eval tasks from `../mapping_tasks/eval.jsonl` and `../mapping_tasks/adversarial.jsonl`.
2. For each task, produce one structured suggestion batch with a persisted `prompt_version`.
3. Validate mapper output against `eval-contract.json` (output_format schema).
4. Score output against gold labels using the rules in `eval-contract.json` (scoring_rules).
5. Aggregate scores per `metrics.json` definitions.
6. Check pass/fail against `pass_thresholds`.

Run the deterministic v1 harness with:

```bash
pnpm ai:eval
```

The current v1 harness is intentionally credential-free and deterministic. It
verifies the scoring pipeline, non-hallucination gate, and checked-in task
contract before any optional live-model eval is considered.

## Pass gates

| Gate                               | Threshold | Hard?                               |
| ---------------------------------- | --------- | ----------------------------------- |
| `eval.jsonl` weighted score        | ≥0.75     | Yes                                 |
| `adversarial.jsonl` weighted score | ≥0.60     | Yes                                 |
| Non-hallucination rate             | ≥0.75     | Hard gate — must pass independently |

## Design principles

- Reward correct abstention over confident-but-wrong mappings.
- Penalize hallucinated source field paths more heavily than missed mappings.
- Ambiguity detection is scored separately from missing-field detection.
- Future mapper implementations must satisfy the `eval-contract.json` input/output format.
