# agent-skills/

This directory holds consumer-owned **agent skills** — the canonical source
of executable skill definitions that get projected into per-tool surfaces
(`.agent/skills/`, `.cursor/skills/`, `.claude/skills/`, etc.) by
`wp sync`.

## Authoring

- Add a new skill with `wp skill new <slug>`.
- Each skill is a directory with a `SKILL.md` and optional supporting files.
- Edit files here — never the projected copies under `.agent/` etc.

## Lifecycle

- Files in `agent-skills/` are committed.
- Projected surfaces (`.agent/skills/`, `.claude/skills/`, …) are gitignored.
- Run `wp sync` after editing to refresh derived surfaces.
