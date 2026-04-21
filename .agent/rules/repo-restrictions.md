---
type: rule
paths: ["**/*"]
last_updated: "2026-04-21"
---

# Repo restrictions — enforced rules summary

This is the one-page reference of what is **mechanically enforced** in this
repo. If a rule is here, the CI gate, lint run, or commit hook will catch
violations before review.

## Oxlint built-in rules (always enforced)

- Zero `any` types.
- Max cognitive complexity: **8** per function.
- No `TypeScript enum` — use `as const` unions.
- Ban `alert()`, `confirm()`, `prompt()`.
- `let`/`const` only (no `var`).
- No duplicate imports.
- No import cycles.
- No non-null assertions without justification.
- Promise handling: no unhandled promises, no `await` on non-Promise.

**Config:** `oxlint.config.ts`.

## Oxlint custom rules (import hygiene) — planned

- **no-relative-parent-imports** — no `../../..` ladders. Use workspace aliases.
- **no-cross-package-deep-imports** — only public entry points.
- **no-generated-mirrors** — never import generated code through a package-local mirror path; always through the canonical generator output.
- **no-mocks-outside-module** — mock files must sit next to the module they mock.

**Status:** not yet installed. Will ship as a repo-local oxlint plugin
package (path to be chosen — likely `packages/oxlint-plugin-repo/`) as part
of the `ci-hardening` blueprint. Until then, these rules are **review-time**
conventions enforced by the code reviewer, not lint.

## Blueprint validator

`pnpm blueprint:validate` enforces:

- Every `blueprints/<lifecycle>/<slug>/` directory contains `_overview.md`.
- `_overview.md` frontmatter `status` matches its parent directory.
- `_overview.md` frontmatter declares `type: blueprint`.

## Commit hooks (planned, see `commit-hooks-guardrails` blueprint)

- **pre-commit:** `lint-staged` (oxlint + prettier on touched files); secretlint.
- **commit-msg:** commitlint + Lore trailer validator when `[lore]` tag is present.
- **pre-push:** `pnpm blueprint:validate` + affected-mutation (short).

## CI gates (see `ci-hardening` blueprint)

Required status checks on `main`:

- `lint` — oxlint + prettier check.
- `check-types` — `pnpm check-types`.
- `test` — `pnpm test`.
- `mutation-affected` — Stryker on affected packages only, threshold: `break: 65`.
- `blueprint-validate` — `pnpm blueprint:validate`.
- `catalog-drift` — no workspace declares a literal version for a catalog-tracked dep.
- `docs-lint` — `markdownlint-cli2` + `lychee` link check.
- `security-scan` — gitleaks + osv-scanner + semgrep.

## When a restriction is wrong

- Add a blueprint that proposes the change.
- Update the rule file in the same PR as the enforcement change.
- Never silence a rule at the call site with an inline comment unless the blueprint explicitly authorizes it.
