---
type: docs-index
last_updated: "2026-05-23"
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

| Content                                                   | Correct location                             |
| --------------------------------------------------------- | -------------------------------------------- |
| How-to guides, tutorials, cookbook patterns               | `docs/guides/`                               |
| Architecture, infrastructure, runtime invariants          | `docs/system/`                               |
| Audits, evaluations, product vision                       | `docs/research/`                             |
| On-call procedures, operational playbooks                 | `docs/runbooks/`                             |
| Incident retrospectives                                   | `docs/postmortem/`                           |
| Architecture decision records                             | `docs/adrs/`                                 |
| Tooling/infra migration notes                             | `docs/migrations/`                           |
| Agent instructions and workflows                          | `.agent/`                                    |
| Local agent/runtime surfaces (generated, never committed) | local dotdirs like `.omx/`, `.agent/`        |
| Package-specific behavior                                 | `packages/<name>/README.md`                  |
| App- or worker-specific behavior                          | `apps/<name>/README.md`                      |
| Implementation plans                                      | `blueprints/<lifecycle>/<slug>/_overview.md` |

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

Generic templates are setup-owned by Webpresso and can be materialized by `wp setup`; consumer-specific overrides belong in `docs/templates.local/`. Start every new doc from the matching setup-owned template.

## Linting

Current repo-owned docs checks are:

- **Vite+ formatter** — `wp run format:check` runs `vp fmt --check` for markdown and code formatting.
- **frontmatter check** — `wp run docs:check` enforces rules 1–3 above.

If markdown or link linting is added back as a scripted repo check, document the
exact package script here instead of referring to ad hoc commands.

## Key entry points

- [`../AGENTS.md`](../AGENTS.md) — top-level operating contract.
- [`../README.md`](../README.md) — project README.
- [`./project/REVIEWER-GUIDE.md`](./project/REVIEWER-GUIDE.md) — fastest repo orientation path.
- [`./guides/claim-e2e-traceability.md`](./guides/claim-e2e-traceability.md) — shipped reviewer-facing claims mapped to executable E2E proof.
- [`./project/README.md`](./project/README.md) — project-state and execution records.
- [`../.agent/guides/agent-guardrails.md`](../.agent/guides/agent-guardrails.md) — agent-operational guardrails.
- [`../.agent/workflows/README.md`](../.agent/workflows/README.md) — agent workflow index.
- [`../blueprints/README.md`](../blueprints/README.md) — implementation plan index and lifecycle.
- [`./system-architecture.md`](./system-architecture.md) — architecture and runtime invariants.
- [`./guides/`](./guides/) — patterns and how-tos.
