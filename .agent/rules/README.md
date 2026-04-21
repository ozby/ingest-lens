---
type: rules-index
last_updated: "2026-04-21"
---

# Agent rules

Durable rules that apply to every change made in this repo. Rules are
terse, imperative, and enforced wherever possible (lint, CI, hooks). Each
rule lives in its own file so it can be cited, diffed, and evolved
independently.

## Index

| Rule                                                           | Purpose                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------- |
| [ts-coding-conventions.md](./ts-coding-conventions.md)         | TypeScript style and type-safety non-negotiables                    |
| [cmd-execution.md](./cmd-execution.md)                         | Bookend QA rule and canonical command surface                       |
| [repo-restrictions.md](./repo-restrictions.md)                 | Oxlint + CI-enforced restrictions summary                           |
| [blueprint-scoping.md](./blueprint-scoping.md)                 | New blueprints need a named product-wedge                           |
| [generated-code-governance.md](./generated-code-governance.md) | Generated artifacts are read-only                                   |
| [no-raw-scripts.md](./no-raw-scripts.md)                       | Use `pnpm <script>` / `bun ./scripts/*.ts` — never raw `node`/`npx` |
| [no-dotenv.md](./no-dotenv.md)                                 | Secrets flow through Doppler — dotenv is forbidden                  |

## How rules are enforced

1. **Oxlint** — syntactic rules (zero `any`, cognitive complexity ≤8, no enums, let/const, import cycles).
2. **CI** — gates on `pnpm qa`, `pnpm blueprint:validate`, `pnpm lint:docs`.
3. **Commit hooks** — fast fail on style, commit structure, secrets.
4. **Agent self-enforcement** — agents read these files before editing and treat them as hard constraints.

If a rule conflicts with a task, stop and update the rule in the same PR
rather than silently bypassing it.
