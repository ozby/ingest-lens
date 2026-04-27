---
paths:
  - '**/*.ts'
  - '**/*.tsx'
  - '**/*.test.ts'
---

# Repository Restriction Guide

> How restrictions are enforced across the monorepo.
> When adding a new restriction, follow the enforcement layers below.

## Enforcement Layers (Priority Order)

| Layer                      | Mechanism                                                      | When It Runs                    | Catches                                       |
| -------------------------- | -------------------------------------------------------------- | ------------------------------- | --------------------------------------------- |
| **1. Linter**              | Built-in rules + plugins (e.g. oxlint, eslint)                 | `lint`, pre-commit, CI          | Import paths, code patterns, safety, perf     |
| **2. Pre-commit Hook**     | Husky / repo pre-commit script                                 | Every `git commit`              | Lint, typecheck, drift, quality               |
| **3. Agent Hooks**         | Agent-tool pretool guard (Claude Code / Cursor / etc.)         | Every Write/Edit in agent tool  | Forbidden commands, test quality, conventions |
| **4. Agent Instructions**  | `AGENTS.md`, `.agent/rules/*.md`, `.agent/guides/*.md`         | Agent context loading           | Soft enforcement for all AI agents            |
| **5. CI Workflows**        | `.github/workflows/*.yml` or equivalent                        | PRs and pushes                  | Full QA, security, drift detection            |
| **6. Boundaries Lint**     | `eslint-plugin-boundaries` or similar tier enforcer            | `lint-boundaries`               | Architectural tier violations                 |

## Import Path Restrictions

Most monorepos benefit from a small set of path restrictions enforced by a
linter plugin. Typical bans:

### `../src/` Imports → Use `#` (or package subpath)

Within-package deep relative imports into a sibling `src/` tree are brittle;
they break whenever files move or when the package is consumed by source
export from another package. Prefer Node.js subpath imports (`#`) that resolve
via the declaring package's `package.json` `imports` field.

### Cross-Package Relative Imports

`../../other-package/src/foo` imports bypass the package boundary and break
path resolution across workspaces. Ban them; require the package name.

### `vi.mock()` Relative Paths

`vi.mock('../../services/auth')` breaks when vitest projects use
`extends: false` or when test files sit at different directory depths.
Always match the source code's import style.

### `../` Parent Imports → Prefer `#`

Any cross-directory import that reaches outside the current directory
generally wants a subpath import instead.

### Cross-Package Path Traversal via `__dirname`

`resolve(__dirname, '../../..')` patterns to find "repo root" or to reach
into another package are fragile. Provide a repo-utility helper (e.g.
`findProjectRoot()`) and ban the raw traversal patterns.

## Adding a New Restriction

### Step 1: Choose the Right Mechanism

| What You Want to Ban                        | Use This                                |
| ------------------------------------------- | --------------------------------------- |
| Import path pattern (`from 'xxx'`)          | Linter plugin                           |
| Structural code pattern (AST node matching) | Linter plugin                           |
| String content in function args             | Linter plugin + agent instructions      |
| Command execution pattern                   | Agent hooks (forbidden-commands)        |
| File naming / placement                     | Agent hooks + pre-commit                |

### Step 2: Implement

#### For Linter Plugins

1. Add the rule to an existing plugin or create a new one in a plugin package.
2. Register the rule in the lint config and add the plugin to the active set.
3. Add overrides if certain file patterns need exemptions.

#### For Agent Hooks

Edit the pretool-guard validators:

- Add validation logic in a new or existing validator
- Register it in the pretool runner
- Scope it to the agent tools that need it

#### For Agent Instructions

Edit the appropriate file:

- `.agent/rules/agent-guide.md` — import / path / schema rules (all agents)
- `AGENTS.md` — cross-platform agent rules
- `.agent/guides/agent-guardrails.md` — agent-operational guidance and
  current repo surfaces

### Step 3: Document

- Update this file with the new restriction.
- Add examples to agent instructions showing correct alternatives.

## Common Active Restrictions

### Linter Built-in Rules (Always Enforced)

- Zero `any` types
- Bounded cognitive complexity (e.g. ≤ 8)
- Ban `alert()` / `confirm()` / `prompt()`
- Ban TypeScript enums
- Use let / const (no var)
- Import cycle detection, duplicate imports

### Linter Plugin Rules (Always Enforced)

**Import hygiene**:

- `no-relative-parent-imports` — ban `../` imports (use `#`)
- `no-src-path-imports` — ban `../src/` imports (use `#`)
- `no-relative-mock-paths` — ban `vi.mock('../')` (use `#` or package name)

**Monorepo paths**:

- `no-hardcoded-repo-root` — ban `__dirname` / `import.meta.dirname` + `../../`
  for repo root
- `no-cross-package-paths` — ban `__dirname` + traversal into other packages

**Testing quality**:

- `no-weak-assertions` — ban `toBeTruthy()` / `toBeFalsy()` / `toBeDefined()`
  / `toBeUndefined()` / `toBeTypeOf()`
- `no-bare-spy-assertions` — ban `toHaveBeenCalled()` without args
- `no-internal-mocks` — ban mocking internal workspace packages
- `no-real-timers-in-tests` — ban `setTimeout` in `Promise` constructor

**Code safety**:

- `as-any-audit` — audit unsafe `as any` casts
- `no-swallowed-errors` — ban catch blocks that only `console.error`

### Architectural Tier Enforcement

Use a boundaries plugin (e.g. `eslint-plugin-boundaries`) or dependency-cruiser
rules to prevent tier inversions (e.g. feature → app, package → feature).

### Agent Hooks (Agent-Tool Only)

- Forbidden commands (suggest wrapped recipe equivalents)
- Package import deduplication
- Test quality validation
- Blueprint / docs governance
- File conventions

### Pre-commit Hook (All Developers)

- Format + lint auto-fix
- Typecheck affected packages
- Generated file drift detection
- Schema drift detection
- Blueprint format validation
