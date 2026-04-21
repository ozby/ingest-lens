---
type: docs-index
last_updated: "2026-04-21"
---

# Documentation

Cross-cutting repository documentation lives under `docs/`. Agent-
operational material lives under `.agent/`; package- and app-specific
material lives in the owning workspace's `README.md`. Implementation
plans live under `blueprints/`.

## Structure

```text
docs/
├── guides/          # how-to guides, tutorials, patterns
├── system/          # architecture, infrastructure, decisions, rules
├── research/        # audits, evaluations, product vision
├── runbooks/        # on-call procedures, incident playbooks
├── postmortem/      # incident retrospectives
├── adrs/            # architecture decision records
├── migrations/      # migration notes for tooling/infra changes
├── secrets/         # how to access secrets; never the secrets themselves
├── templates/       # doc templates per type
└── README.md
```

Not every folder exists today. Create them as the corresponding material
lands. Do not describe a folder as existing before it does.

## Placement rules

| Content                                          | Correct location                             |
| ------------------------------------------------ | -------------------------------------------- |
| How-to guides, tutorials, cookbook patterns      | `docs/guides/`                               |
| Architecture, infrastructure, runtime invariants | `docs/system/`                               |
| Audits, evaluations, product vision              | `docs/research/`                             |
| On-call procedures, operational playbooks        | `docs/runbooks/`                             |
| Incident retrospectives                          | `docs/postmortem/`                           |
| Architecture decision records                    | `docs/adrs/`                                 |
| Tooling/infra migration notes                    | `docs/migrations/`                           |
| Agent instructions and workflows                 | `.agent/`                                    |
| Codex/OMX hook wiring and local hook entrypoints | `.codex/`                                    |
| Package-specific behavior                        | `packages/<name>/README.md`                  |
| App- or worker-specific behavior                 | `apps/<name>/README.md`                      |
| Implementation plans                             | `blueprints/<lifecycle>/<slug>/_overview.md` |

## Strict rules

1. Every `.md` under `docs/` has frontmatter with `type` and `last_updated`.
2. Allowed `type` values: `guide`, `system`, `research`, `runbook`, `postmortem`, `adr`, `migration`, `template`, `docs-index`.
3. `type` must match the parent folder.
4. File names are lowercase kebab-case.
5. No duplicate sources of truth. Link, don't copy.
6. Package- and app-specific behavior lives in the owning `README.md`, not here.
7. When describing capabilities, label truth state explicitly: **shipped**, **partial**, **aspirational**. Mixed-maturity surfaces are normal; pretending they aren't is what rots docs.
8. Docs that depend on another doc's path must survive a rename. Use workspace-relative references, not absolute filesystem paths.

## Frontmatter template

```yaml
---
type: guide | system | research | runbook | postmortem | adr | migration | template
last_updated: "YYYY-MM-DD"
---
```

Templates per type live under `docs/templates/`. Start every new doc
from the matching template.

## Linting

Run via `pnpm lint:docs`:

- **markdownlint-cli2** — `.markdownlint.json` at repo root. Installed as a devDependency.
- **lychee** — `lychee.toml` at repo root. `lychee` is a Rust binary, not an npm package. Install locally with `brew install lychee` (macOS) or from a CI action; `pnpm docs:links` invokes it directly from `$PATH` and will no-op with a warning if the binary is missing.
- **prettier** — `pnpm format:check` covers markdown formatting.
- **frontmatter check** — `bun ./scripts/check-docs-frontmatter.ts` enforces rules 1–3 above.

## Key entry points

- `AGENTS.md` — top-level operating contract (principal layer + generated).
- `README.md` — project README.
- `.agent/rules/README.md` — mechanically enforced rules index.
- `.agent/guides/README.md` — agent-operational guide index.
- `blueprints/README.md` — implementation plan index and lifecycle.
- `docs/system/` — architecture and runtime invariants (stable).
- `docs/guides/` — patterns and how-tos (stable).
