# Blueprints

This directory is the canonical home for implementation plans (blueprints).
Each subdirectory represents a lifecycle state:

- `draft/` — early-stage sketches. Expect churn; move to `planned/` once scoped.
- `planned/` — committed-to specs, ready to pick up.
- `in-progress/` — actively being executed. Exactly one blueprint per lane.
- `completed/` — execution finished and verified. Kept for reference.
- `parked/` — intentionally paused. Include a reason in the spec's frontmatter.
- `archived/` — superseded or abandoned. Not deleted — the record matters.

## Authoring

- Use `wp blueprint new` or the setup-owned Webpresso blueprint template as the starting point.
- Blueprint metadata is validated by `wp audit blueprint-lifecycle` against the shared Webpresso blueprint contract.
- For iterative refinement, load the `plan-refine` skill
  (`.agent/skills/plan-refine/SKILL.md`).

## Moving between states

- `draft → planned`: the spec passes the plan-audit checklist
  (`.agent/guides/plan-audit-checklist.md`).
- `planned → in-progress`: work has started in a worktree or a lane.
- `in-progress → completed`: all acceptance criteria verified.
- Any state → `archived`: when the work is dropped or replaced.

Move files with `git mv` so history follows the spec through its lifecycle.

## Current state (2026-06-11)

No `draft/`, `planned/`, `in-progress/`, or `parked/` blueprints are open right
now. The most recent completed lanes are:

| Blueprint                                 | Path                                                                                                                                                               | Purpose                                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Preview + production lanes                | [`completed/2026-06-02-ingest-lens-preview-production-lanes.md`](./completed/2026-06-02-ingest-lens-preview-production-lanes.md)                                   | Stable `preview-main`, ephemeral `preview-pr-<n>`, and release-gated `prd` lane contract.                                            |
| `wp` deploy adapter + toolchain isolation | [`completed/2026-06-02-ingest-lens-wp-deploy-adapter-toolchain-isolation.md`](./completed/2026-06-02-ingest-lens-wp-deploy-adapter-toolchain-isolation.md)         | Consumer adapter closure for the shared agent-kit deploy/toolchain contract.                                                         |
| Surface test traceability hardening       | [`completed/surface-test-traceability-hardening/_overview.md`](./completed/surface-test-traceability-hardening/_overview.md)                                       | Reviewer-facing claims now map to executable proof, with the widened verification matrix complete.                                   |
| System clarity hardening                  | [`completed/system-clarity-hardening/_overview.md`](./completed/system-clarity-hardening/_overview.md)                                                             | Completed documentation/runtime simplification lane covering reviewer spine, runtime-boundary cleanup, and final verification proof. |
| Runtime env public npm adoption           | [`completed/2026-06-07-runtime-env-public-npm-adoption.md`](./completed/2026-06-07-runtime-env-public-npm-adoption.md)                                             | Completed public-package/runtime-env adoption follow-through.                                                                        |
| Shared deploy workflow alignment cleanup  | [`completed/2026-06-09-ingest-lens-shared-reusable-deploy-workflow-alignment.md`](./completed/2026-06-09-ingest-lens-shared-reusable-deploy-workflow-alignment.md) | Completed truth-state cleanup for already-live shared deploy workflow callers, docs, and dependency ownership.                       |
