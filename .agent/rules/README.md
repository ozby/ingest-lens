---
type: core
last_updated: 2026-04-22
---

# Agent Rules Index

Rules are enforced agent-operational policies. They live under `.agent/rules/`
and load automatically for the tools that pick up this directory.

## Available Rules

- `agent-guide.md` — monorepo import aliases, entity / schema conventions,
  secret injection, E2E coverage contract, test organization
- `blueprint-scoping.md` — product-wedge anchor requirement for new
  infra-layer blueprints
- `cmd-execution.md` — bookend QA protocol, scoped command surface, log-file
  discipline
- `generated-code-governance.md` — authored source vs generated output,
  import surface for generated packages
- `repo-restrictions.md` — how restrictions are layered (linter, pre-commit,
  agent hooks, CI, agent instructions) and how to add a new one

Rules are tool-agnostic by default. If your repo uses `just`, `pnpm`, `turbo`,
or another task runner, the rule bodies reference that surface generically;
wire the concrete recipes in your repo's task runner of choice.
