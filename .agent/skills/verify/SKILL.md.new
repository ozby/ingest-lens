---
name: verify
description: Post-implementation quality gate that verifies work is actually done, cleans up legacy/backward-compat/dead-code garbage left behind, and refreshes affected docs. Use after implementing a feature or fix, before claiming done, or when finalizing a blueprint. Triggers on `/verify <target>`, `verify this work`, `is this really done?`, or when a human asks for post-implementation review.
argument-hint: '<target> [--full] where target is: package|file|plan-slug|all'
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task, TodoWrite
---

# Verify

Post-implementation quality gate. Run after the implementation step, before claiming `done`.

## Iron law — evidence before claims

No completion claim without fresh verification evidence.

Before saying `done`, `fixed`, `passes`, or `clean`:

1. Identify the command that proves the claim.
2. Run it now, or cite a fresh log from the just-completed run.
3. Read the exit code and summary — do not infer from partial output.
4. State the actual result with a log path.
5. If another agent made the change, inspect the diff yourself before repeating the claim.

Not sufficient: "should pass", "looks correct", partial checks, lint-only evidence for build claims, agent success reports without independent verification.

## Usage

```bash
/verify <target>           # Fast verify (phases 0-8)
/verify <target> --full    # Also run phase 9 (mutation testing)
```

`<target>` is a file path, package name, blueprint slug, or `all`.

Quality commands auto-save logs under `logs/DD-MM-YYYY/HH-MM-SS_*.log` (if your runner supports it). Reuse fresh logs instead of re-running.

> Note: `just <recipe>` commands in this skill assume a [just](https://github.com/casey/just)-based task runner. Substitute your own runner (`make`, `npm run`, `pnpm run`, etc.) where needed. The `ak run` abstraction layer is planned in a later phase.

---

## Phase 0 — Scope and evidence map

1. Identify target type (file / package / blueprint slug / all).
2. Map each claim you plan to make to the exact command that proves it.
3. If target is a blueprint slug:

```bash
ak blueprint show <slug>
ak blueprint audit <slug> --strict
```

Record task IDs and acceptance checkboxes that still need proof.

## Phase 1 — Governance gates

Run only what applies to the diff:

- Any repo SSOT (schema/config/blueprint) change → your repo's dedicated check
- Any `docs/**` change → `just docs` (or `just lint-md <paths>` for targeted checks, or your markdown linter)
- Blueprint slug target → `ak blueprint audit <slug> --strict`

Hard stop on any failure.

### Blueprint / planning-artifact verification

> Never pass `.md` files to `just test --file` — that command is for TypeScript tests only.

```bash
ak blueprint show <slug>
just lint-md blueprints/<status>/<slug>/_overview.md
# Parser/validator tests only when modifying blueprint structure logic:
# <run your blueprint parser/validator tests>
```

Success: CLI prints tasks/waves, markdown lint 0 errors, task headings use `#### [lane] Task X.Y: Title` or `#### Task X.Y: Title`, `**Status:**` is one of `todo|in_progress|blocked|done`.

## Phase 2 — Surface QA (logged)

```bash
just lint --package <target>       # auto-saves log
just typecheck --package <target>  # auto-saves log
just test --package <target>       # auto-saves log
```

Rules:

- Do not re-run long commands; read the auto-saved log path printed on completion.
- Never run `just test --package <pkg>` in parallel agents (memory constraint).

## Phase 3 — Cross-package impact scan

Changed a public API (renamed/removed export, renamed component mocked by consumers, shared type)?

```bash
# Find consumers of the changed symbols (including vi.mock targets)
rg -l 'OldSymbolName|AnotherOldName' -g '*.test.*' -g '*.spec.*'
```

Hard stop: any test file mocks a symbol no longer exported by the target package.

## Phase 4 — Test quality audit

Canonical check: `/tph --check` for the current diff, or `/tph <path>` scoped. Treat its findings as authoritative. The list below is an additional guardrail.

Weak-assertion ban (also enforced by oxlint `no_weak_assertions`):

```bash
rg 'toBeTruthy\(|toBeFalsy\(|expect\(true\)\.toBe\(true\)|expect\(\[\]\)\.toEqual\(\[\]\)' <target>
```

Mock abuse:

```bash
rg -c 'vi\.mock|jest\.mock' <target>
```

Only mock external boundaries (network, filesystem, time). Never internal logic. >3 mocks in one file = review.

Integration-test naming (enforced by GritQL rule `enforce-integration-test-naming.grit`):

```bash
# Integration patterns in files NOT named *.integration.test.ts
rg -l 'PGlite|createIntegrationContext|seedTestScenario' <target> \
  | grep -v '\.integration\.test\.'
```

E2E for command/feature changes, require each of:

- Routing test (command recognized).
- Real-execution test (no `dryRun: true`).
- Error/invalid-path coverage.
- Mixed / partial / graceful-degradation coverage.
- Recovery / UX assertions.

Also run `just audit-tph-e2e` (or your repo's E2E audit) to enforce E2E guidelines.

UX anti-pattern red flag: list/browse operations with only all-valid or all-invalid tests and no mixed-input integration test. Add the graceful-degradation case before claiming done.

## Phase 5 — Design, complexity, type safety

Complexity and suppressions — `just lint --package <target>` already enforces:

- Max cognitive complexity ≤ 8 (extract helpers if over).
- Zero lint-disable / ts-ignore / ts-expect-error / biome-ignore / prettier-ignore. Fix the code, not the linter.

Type safety:

```bash
rg '\bany\b' <target> --type ts
```

Zero `any` in production code. Use `unknown` + type guards. The `vi.fn<(...args: any[]) => unknown>` mock-typing idiom is the only exception and matches existing repo tests.

Testability smells (refactor before claiming done): functions > 50 lines, > 4 parameters, nesting > 3 levels, hidden closures.

## Phase 6 — Legacy, compat, and dead-code sweep

**Purpose:** catch the convenience helpers, stale aliases, and untested "just in case" surfaces that tend to slip in alongside real work. This phase is mandatory before marking a blueprint task `done`.

### 6.1 Grep the diff for garbage signals

```bash
rg -n 'deprecated|legacy|backward[- ]?compat|TODO|FIXME|HACK|XXX|temporary|compat shim' <changed-paths>
```

Any match in new code must be justified inline or removed.

### 6.2 Dead-code analysis via knip (repo recipes)

```bash
just analysis-dead-code    # full unused files/exports/deps sweep (auto-logs)
just deps-check-unused     # unused dependencies only
just analysis-knip-fix     # auto-delete clearly unused exports (review the diff)
```

Knip finds three classes of dead code:

- Unused files (nothing imports or references).
- Unused exports (exported but never consumed inside or outside the package).
- Unused dependencies (listed in `package.json` but never imported).

Knip false-positive categories that must be verified before deletion:

- Dynamic imports (`lazy(() => import(…))`).
- Barrel re-exports (`index.ts`).
- Generated React Router `+types/*`.
- Storybook stories, Pulumi resources, test utilities consumed only by tests.

### 6.3 New-surface justification

For every new exported symbol, helper, or subpath added in this change:

- Does at least one test or in-repo consumer exercise it?
- Does it add capability that `existing-primary-surface(...)` does not?
- Is it documented (README, surface ledger)?

If the answer to all three is no, **delete it**. Convenience wrappers that only duplicate an existing primary API are garbage.

### 6.4 Backward-compat shim check

If the change introduces a rename, move, or replacement, forbid:

- Deprecated aliases (`export { NewName as OldName }`) unless an explicit migration plan exists.
- Compat shims (`if (legacyFormat) …`) without a dated removal entry in a tech-debt registry.
- Parallel old/new code paths behind an unconfigured flag.

Hard cut whenever the repo owner has chosen one. No garbage left behind.

### 6.5 File lifecycle and git-index sanity

**Purpose:** catch the class of drift where new binary entrypoints, shebang scripts, or symlinks look correct on disk but are silently untracked, unexecutable, or clobbered by gitignore. This subphase is mandatory any time the change adds, moves, renames, deletes, or changes the executable bit of any file, *and* any time it touches `.gitignore`, `.claude/settings.json`, or other hook/launcher configs.

Run each check and record the result.

**6.5.1 Untracked new files that should be tracked**

```bash
# All untracked files in directories touched by this change
git status --porcelain
git ls-files --others --exclude-standard -- <touched-dirs>
```

Hard stop if any new source / config / shebang file is untracked. `git add` or add to `.gitignore` with explicit justification — never leave in limbo.

**6.5.2 Files silently masked by gitignore**

```bash
# Check each new file against ignore rules
git check-ignore -v <new-files...>
```

If a new file is ignored but should be tracked, either:

- Fix the gitignore allow-list (prefer narrow `!path/to/file` over broad rules), or
- Move the file to a non-ignored location.

Do not force-add (`git add -f`) — that hides the problem from every other contributor.

**6.5.3 Executable bits persisted in the index**

Any new file with a `#!/usr/bin/env …` shebang or any file invoked directly (not via `bun path/to/file` / `node path/to/file`) must be `100755` in the git index, not just on disk.

```bash
git ls-files -s <shebang-files...>
# Expect 100755 for shebang-invoked scripts
# Expect 120000 for symlinks
# Expect 100644 for files always invoked via an interpreter wrapper
```

If a file is 100644 on disk-executable, run `git update-index --chmod=+x <file>` and commit.

**6.5.4 Symlinks stored as symlinks**

```bash
# Git mode 120000 means symlink; 100644 with a text content of a path means symlink-as-text (broken)
git ls-files -s <symlinks...> | grep -v '^120000'
```

Hard stop if any intended symlink is 100644. Re-create with `ln -sf <target> <link>` then `git add`.

**6.5.5 Rename-without-delete (ghost files)**

When a file is renamed, moved, or replaced by a different implementation:

```bash
# Confirm the old path is actually gone from the index
git ls-files | grep -E 'old/path/pattern'
# Confirm it is also gone from disk
find . -path ./node_modules -prune -o -name 'old-file-name' -print | head -20
```

Hard stop if an old entry lingers in either index or working tree.

**6.5.6 Hook / launcher wiring end-to-end**

For changes that touch `.claude/settings.json`, `Procfile`, `justfile` recipes, or any `package.json#bin`:

1. Confirm the referenced entrypoint file actually exists: `ls -l <path-from-config>`.
2. Confirm the invocation mode matches the file (shebang + 100755, or interpreter + 100644).
3. Simulate the hook with a synthetic stdin payload matching the host contract (Claude Code hooks: JSON on stdin with `tool_name`, `tool_input`, `cwd`, etc.). Confirm exit 0 and valid JSON/empty stdout.

Example for Claude Code hooks:

```bash
export CLAUDE_PROJECT_DIR="$(pwd)"
echo '{"tool_name":"Edit","tool_input":{"file_path":"'"$CLAUDE_PROJECT_DIR"'/README.md"},"cwd":"'"$CLAUDE_PROJECT_DIR"'"}' \
  | <your-hook-interpreter> "$CLAUDE_PROJECT_DIR"/<path-to-hook>
```

Hard stop if any wired entrypoint cannot be simulated cleanly.

**6.5.7 Generated / per-machine files not committed**

Files regenerated per-machine by a local setup command (absolute install paths, lockfile side artifacts) must not be committed unless the tool explicitly supports a stable, portable form.

```bash
# Spot check: any user-specific absolute path in tracked files?
git grep -nE '/Users/|/home/[a-z]+|C:\\\\Users\\\\' -- ':!**/*.test.ts' ':!**/*.md' ':!pnpm-lock.yaml'
```

Hard stop on any match in a tracked file that is not a test fixture or docs example.

**6.5.8 Baseline guardrails**

If the change added or modified a repo-wide baseline (e.g. shell-script allowlist, secret-manager allowlist, tech-debt registry), re-run the guardrail command to prove the baseline still matches the working tree. Hard stop on baseline drift.

## Phase 7 — Docs refresh

For any change that alters a public surface (CLI verb, package export, supported workflow, behavior contract), verify each affected doc is updated in the same change:

- Public SDK / API README examples.
- Customer / supported-surface ledger.
- Affected package README.
- `AGENTS.md` / `CLAUDE.md` / `.agent/commands/**` — only if agent-visible behavior changed.
- Blueprint `_overview.md` acceptance checkboxes — tick only after their named check is fresh-green.

```bash
just lint-md <touched markdown files>
```

Blocking rule: claims in docs must be fact-checked against the diff right now, not inferred from memory.

## Phase 8 — Security and contract checks

- AuthZ / permissions: no privilege escalation; role rules respected.
- Secrets: via your secret-gate wrapper, never hardcoded.
- Schema / GraphQL contract: compatible or documented break, public examples updated.

Hard stop on any security regression or undocumented contract break.

## Phase 9 — Mutation testing (`--full` only)

```bash
just test --mutation --package <package>
```

Target ≥ 85 % mutation score for new code. Equivalent-mutant survivors (ArrayDeclaration when length is asserted, debug-log branches, optional-chaining where null is impossible) are acceptable; document them with file + mutant ID.

## Phase 10 — Evidence log

The final report must cite:

- Log paths from phases 1, 2, 6 (and 9 when `--full`).
- Blueprint validation output when the target was a plan slug.
- Markdown-lint output when docs changed.
- A concrete numeric or exit-code result per claim (`0 errors`, `364 passed`, `exit 0`).

Example report:

```
Status: complete | needs work
Verification:
- Lint: PASS (logs/…/…-lint.log)
- Typecheck: PASS (logs/…/…-typecheck.log)
- Tests: 364 passed (logs/…/…-test.log)
- Dead-code sweep: 0 unused files, 0 unused exports (logs/analysis-knip.log)
- File lifecycle: 0 untracked, 0 wrong-mode, 0 gitignore drift, hooks simulated (Phase 6.5)
- Docs: surface-ledger + README updated, lint-md 0 errors
- Mutation: 94 % (--full) | N/A
Changes:
- <high-signal summary, 1-3 bullets>
Garbage removed:
- <untested helper X deleted> | none
```

---

## Success criteria

A target passes verification when all hold:

- All tests green (cite count + log).
- Zero lint errors, zero typecheck errors.
- Max cognitive complexity ≤ 8.
- Zero `any` in production code.
- Zero lint-disable / ts-ignore suppressions.
- No weak assertions in new tests.
- Legacy / compat / dead-code sweep clean (Phase 6).
- File lifecycle clean (Phase 6.5): no stray untracked files, correct mode bits, no gitignore drift, no ghost renames, all wired hooks simulated exit 0.
- All affected docs refreshed in the same change (Phase 7).
- Mutation score ≥ 85 % when `--full`.

Only then claim `done`.

## Integration

After implementation:

1. Run `/verify <target>`.
2. Fix hard-stop findings.
3. Re-run `/verify` until clean.
4. For blueprint targets: `ak blueprint finalize <slug>`.
