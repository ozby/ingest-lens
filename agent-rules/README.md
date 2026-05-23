# agent-rules/

This directory holds consumer-owned **agent rules** — the canonical source
of behavioural guidelines that get projected into per-tool surfaces
(`.agent/rules/`, `.cursor/rules/`, `.windsurf/rules/`, etc.) by
`wp sync`.

## Authoring

- Add a new rule with `wp rule new <slug>`.
- Each rule is a markdown file with frontmatter (`title`, `scope`).
- Edit files here — never the projected copies under `.agent/` etc.

## Lifecycle

- Files in `agent-rules/` are committed.
- Projected surfaces (`.agent/rules/`, `.cursor/rules/`, …) are gitignored.
- Run `wp sync` after editing to refresh derived surfaces.
