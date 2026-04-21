---
type: guides-index
last_updated: "2026-04-21"
---

# Agent guides

Agent-operational documentation. These files explain **how an agent should
operate** in this repo — they are not user-facing human reference.

## Placement rule

- If a doc is about **how agents should operate**, it lives here.
- If a doc is about **how the system works**, it lives in `docs/system/`.
- If a doc is about **how humans should do something**, it lives in `docs/guides/`.

## Contents

| Guide                                                | Purpose                                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| [agent-guardrails.md](./agent-guardrails.md)         | Safety guardrails when an agent is authorized to act autonomously |
| [parallel-execution.md](./parallel-execution.md)     | When to run tasks in parallel and how to bound the concurrency    |
| [plan-audit-checklist.md](./plan-audit-checklist.md) | Weekly audit that keeps the blueprint index honest                |

## How agents should consume these

- Load the relevant guide **before** taking any action it governs. Do not re-derive policy from memory.
- Cite the guide in the PR description when a decision hinges on it.
- If a guide conflicts with the task, stop and propose an update. Do not silently bypass.
