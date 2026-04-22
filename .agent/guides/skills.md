---
type: core
last_updated: 2026-04-22
---

# Agent Skills Notes

This file is retained as a short note only.

Skill inventories drift fast. Instead of maintaining a static catalog, rely on
the actual skill directories under `.agent/skills/` as the source of truth.

## Current Rule

Use the actual skill directories under `.agent/skills/` as the source of
truth. Each skill owns its own `SKILL.md`; open that file and follow it
instead of relying on a summary document.

For command behavior while using skills:

- prefer repo-owned task-runner recipes (`just`, `pnpm`, `turbo`, make) for
  development, verification, and task-running workflows
- use the escape-hatch recipe when the repo expects wrapped CLI execution
- do not treat older tool-specific skill paths or legacy slash-command
  inventories as current guidance

## Related Files

- `.agent/skills/README.md`
- `.agent/skills/`
- `.agent/guides/agent-guardrails.md`
- `AGENTS.md`
