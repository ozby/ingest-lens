---
type: blueprint
status: completed
complexity: S
created: "2026-04-21"
last_updated: "2026-04-22"
progress: "0% (drafted)"
depends_on: []
tags:
  - dx
  - guardrails
  - husky
  - commitlint
---

# Commit-hook guardrails (husky + lint-staged + commitlint + secretlint)

**Goal:** Move the repo's first line of defence from "CI catches it" to
"your commit never leaves the machine" — without making the pre-commit hook
slow enough to tempt `--no-verify`.

## Planning Summary

- **Current state:** Husky is installed; `.husky/pre-commit` exists. There is no structured lint-staged, commitlint, or secretlint wiring.
- **Target:** lint-staged for fast per-file checks (oxlint, prettier); commitlint for conventional-commit style; secretlint to block accidental secret commits; a commit-msg hook that appends the repo's Lore Commit Protocol trailer template when a marker is present.

## Architecture Overview

```text
.husky/
  pre-commit        -> lint-staged
  commit-msg        -> commitlint + lore trailer injector
  pre-push          -> affected-mutation (short) + blueprint-validate

package.json
  lint-staged:
    "*.{ts,tsx,js,mjs,cjs}": oxlint --fix-dry-run --quiet + prettier --check
    "*.{json,md,yml,yaml}":  prettier --check

commitlint.config.ts
  extends: @commitlint/config-conventional
  rules:
    scope-enum: [2, "always", [workspace-slugs]]

.secretlintrc.json
  rules: ["@secretlint/secretlint-rule-preset-recommend"]
```

## Fact-Checked Findings

| ID  | Severity | Claim                                                 | Reality                                                                                            | Fix                                               |
| --- | -------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| F1  | HIGH     | Slow pre-commit hooks get bypassed with `--no-verify` | Well-documented pattern. Keep pre-commit under 3s P95.                                             | lint-staged only; no type-check, no tests.        |
| F2  | HIGH     | commitlint alone enforces structure                   | Scope enforcement (`scope-enum`) must list the actual workspaces, else devs pick arbitrary scopes. | Generate `scope-enum` from `pnpm-workspace.yaml`. |
| F3  | MEDIUM   | secretlint replaces gitleaks                          | No — they complement each other. secretlint runs pre-commit, gitleaks runs in CI on the full diff. | Keep both; Task 1.3 wires secretlint.             |

## Evidence Base

- `./.husky/pre-commit` (current).
- Lore Commit Protocol referenced by `AGENTS.md` (trailer vocabulary: `Constraint:`, `Rejected:`, `Confidence:`, etc.).

## Task Pool

### Phase 1: Fast pre-commit [Complexity: S]

#### [dx] Task 1.1: Wire lint-staged

**Status:** pending **Depends:** None

**Files:**

- Modify: `package.json`
- Modify: `.husky/pre-commit`

**Acceptance:**

- [ ] `git commit -m "foo"` on a 5-file change finishes under 3s (P95 on a modern laptop).

#### [dx] Task 1.2: Wire commitlint + scope-enum

**Status:** pending **Depends:** None

**Files:**

- Create: `commitlint.config.ts`
- Create: `.husky/commit-msg`
- Create: `scripts/commitlint-scopes.ts`

**Acceptance:**

- [ ] Non-conventional commits are rejected with a helpful message.
- [ ] `scope` must match a real workspace name.

#### [dx] Task 1.3: Wire secretlint pre-commit

**Status:** pending **Depends:** Task 1.1

**Files:**

- Create: `.secretlintrc.json`
- Modify: `package.json`

**Acceptance:**

- [ ] Committing a file containing a fake AWS-shaped secret is blocked locally.

### Phase 2: Pre-push guards [Complexity: S]

#### [dx] Task 2.1: Pre-push blueprint validation + affected mutation

**Status:** pending **Depends:** Task 1.1 **Blocked:** stryker-mutation-guardrails must pilot first.

**Files:**

- Create: `.husky/pre-push`

**Acceptance:**

- [ ] Push is blocked if `pnpm blueprint:validate` fails.
- [ ] Push is blocked if mutation score on affected packages drops below `break`.

## Verification Gates

| Gate       | Command                                   | Success            |
| ---------- | ----------------------------------------- | ------------------ |
| Hook smoke | `git commit --dry-run` on a staged change | Runs expected hook |
| Lint speed | `time git commit -m "ci: no-op"`          | ≤3s P95            |

## Cross-Plan References

| Type       | Blueprint                  | Relationship                                   |
| ---------- | -------------------------- | ---------------------------------------------- |
| Downstream | `ci-hardening`             | CI runs the same checks at scale               |
| Related    | `adr-lore-commit-protocol` | Trailer vocabulary shared with commit-msg hook |

## Non-goals

- Running tests or type-check pre-commit.
- Replacing IDE-level formatters.

## Risks

| Risk                                | Impact | Mitigation                                                |
| ----------------------------------- | ------ | --------------------------------------------------------- |
| Hooks slow enough to be bypassed    | High   | lint-staged per-file; no full-project commands pre-commit |
| `--no-verify` normalized culturally | Medium | CI repeats the checks; make the failure message helpful   |

## Technology Choices

| Component   | Technology                            | Why                     |
| ----------- | ------------------------------------- | ----------------------- |
| Hooks       | husky v9                              | Already installed       |
| Fast checks | lint-staged                           | Per-file fan-out        |
| Message     | @commitlint/cli + config-conventional | Standard                |
| Secrets     | secretlint                            | Fast, configurable, MIT |

## Refinement Summary (2026-04-22 pass)

Findings:

- **Partial execution landed already.** `.husky/pre-commit` + `.husky/commit-msg` + `.husky/pre-push` are wired via `scripts/check-commit-msg.ts` (conventional-commit + `[lore]` trailer validation). That covers Tasks 1.2 (basic) and Task 2.1 partially.
- **Still open:** lint-staged package install (Task 1.1 full), secretlint install (Task 1.3), `scope-enum` generator from `pnpm-workspace.yaml` (Task 1.2 full), affected-mutation wiring in pre-push (Task 2.1 — blocked on `stryker-mutation-guardrails`).
- Acceptance bullets carry proving commands: `time git commit -m "ci: no-op"` ≤ 3 s, staged secret blocks commit.
- `commitlint.config.ts` referenced in a prior pass; `@commitlint/cli` supports TS configs since v18.

Fixes applied:

- Clarified that the minimal hook stack is already live — this blueprint finishes the full stack.

**Blueprint compliant: Yes.** Execution-ready (Task 2.1 blocked by stryker blueprint).
