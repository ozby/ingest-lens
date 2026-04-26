---
type: guide
last_updated: 2026-04-22
---

# Agent Guardrails

Current guardrails for agents working in a monorepo that uses agent-kit.

## Core Rule

Edit authored source files. Do not teach or rely on repo paths that do not
exist in the current checkout.

Typical authored source in an agent-kit-configured monorepo:

- entity / schema truth lives in the declared schema directory (e.g.
  `schema/*.yaml` or `entities/*.yaml`).
- the supported checked-in customer / app roots are documented in your
  repo's `docs/system/` (or equivalent).
- generated artifacts (e.g. under `.generated/`) are outputs, not authored
  source.

Agents should verify the actual authored roots in the checkout before
instructing the user to edit anything.

## Source of Truth

When changing repo-owned declarative inputs, prefer the current authored
roots. A typical set (adapt to your repo):

- `<repo>/config.yaml`
- `<repo>/entities/`
- `<repo>/workflows/`
- `<repo>/ui/pages/`
- `<repo>/endpoints/`
- `<repo>/jobs/`
- `blueprints/`
- `tech-debt/`

Optional supported checked-in roots may also be present:

- `<repo>/actions/`
- `<repo>/events/`
- `<repo>/permissions/`
- `<repo>/seeds/`
- `<repo>/types/`
- `<repo>/ui/navigation/`

Use your repo's `docs/system/` pages as the canonical contract docs when a
workflow or path is unclear.

## Generated Files

Do not manually edit generated payloads under output roots such as:

- `.generated/`
- `apps/docs-site/.generated/`
- deploy-time generated config files

Allowed exception:

- a tracked `package.json` stub inside the generated output root is a
  checked-in workspace package stub, not a generated payload.

If generated artifacts need to change, edit the authored source and
regenerate.

## Regeneration Paths

Use the narrowest regeneration path that matches the authored change. Typical
recipe surface:

```
schema-check
schema-compile
schema-codegen
schema-frontend
```

For docs-site generated content:

```
docs-build
```

Wire these to your task runner (`just`, `pnpm`, `turbo`, etc.). The rule
that matters is that each authored-source change maps to exactly one
regeneration command.

## Expected Agent Behavior

Agents working in this repo should:

1. discover the current authored source file first
2. edit source, not generated outputs
3. regenerate only the artifacts implied by that source change
4. verify the result with the relevant repo checks
5. avoid reviving removed or legacy paths as if they were current workflow

## Quick Checks

Before giving workflow guidance, verify these assumptions:

- the path exists in the current repo
- the command exists in the current repo
- the guidance matches your repo's contract docs for customer-facing roots

If a historical doc or audit mentions missing paths, treat that as stale
context, not current instruction.

## Related Files

- `.agent/rules/agent-guide.md`
- `.agent/rules/generated-code-governance.md`
- `.agent/rules/repo-restrictions.md`
