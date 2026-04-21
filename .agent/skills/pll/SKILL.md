---
name: pll
description: Parallel Lane Launch — execute one or more blueprints simultaneously, each in its own git worktree, committing once per lane after /verify passes. Invoke as `$pll <slug1> [slug2 …]`.
---

# PLL — Parallel Lane Launch

`$pll` fans out blueprint execution across isolated git worktrees so that
multiple blueprints can progress simultaneously without touching each other's
staging area or branch state.

## When to invoke

- The user says `$pll <slug>` or `/pll <slug>`.
- You need to execute one or more planned blueprints and want each isolated.
- After `$plan-refine` has stamped **Blueprint compliant: Yes** on every target slug.

Do NOT invoke `$pll` on blueprints that are still `draft` or that carry an
open `**Q:**` requiring user decision.

## Pre-flight checklist

For each `<slug>` in the argument list:

1. `blueprints/planned/<slug>/_overview.md` exists and `status: planned`.
2. `$plan-refine <slug>` has been run (Refinement Summary present, **Blueprint compliant: Yes**).
3. No task in Phase 1 of the blueprint has an unresolved `**Blocked:**` annotation.
4. No two slugs in the same `$pll` invocation write to the same file in Wave 1 (same-wave conflict check).

If any check fails, stop and surface the issue to the user before creating worktrees.

## Worktree protocol

For each lane `<slug>`:

```bash
# From the main checkout root:
git worktree add .worktrees/<slug> -b pll/<slug>
```

- **Worktree path:** `.worktrees/<slug>/`
- **Branch name:** `pll/<slug>`
- **Base:** HEAD of `main` at the moment `$pll` is invoked.
- All file edits, installs, and test runs happen inside the worktree.
- The main checkout is never touched during lane execution.

## Execution model

Each lane runs as an independent background agent with the following contract:

1. **Navigate** into the worktree (`cd .worktrees/<slug>`).
2. **Execute** the blueprint tasks in wave order (Phase 1 → Phase 2 → …).
3. **Verify** by running the blueprint's Verification Gates table in full.
4. **Commit** exactly once if and only if all gates are green:

```text
<type>(<scope>): <summary matching the blueprint goal>

Blueprint: blueprints/planned/<slug>/_overview.md

- key change 1
- key change 2
- key change 3
```

No `Co-Authored-By` trailers. No `🤖 Generated with Claude Code` footers.
Commits are authored as the repo owner.

5. **Report** back: `{ worktree, branch, commitSha, filesTouched, verifyStatus }`.

If any Verification Gate is red, do NOT commit. Surface the failures in the
lane report instead.

## Commit message rules

- Follow conventional-commit format: `<type>(<scope>): <summary>`.
- Body bullet points: 3–5, each describing a concrete change.
- `Blueprint:` trailer line (required).
- No AI authorship lines of any kind.

## Parallelism rules

- Lanes that share no files in Wave 1 may run fully in parallel.
- Lanes that share a file must be serialized: the later lane must wait for
  the earlier lane's commit before starting.
- If a slug's blueprint lists `depends_on` pointing at another slug in the
  same `$pll` invocation, serialize them in dependency order.

## After all lanes complete

1. Each lane's worktree stays alive until the user merges or rebases the branch.
2. Report a summary table:

| Lane     | Branch       | Status      | Commit      |
| -------- | ------------ | ----------- | ----------- |
| `<slug>` | `pll/<slug>` | green / red | `<sha>` / — |

3. Suggest cleanup commands once the user confirms merge:

```bash
git worktree remove .worktrees/<slug>
git branch -d pll/<slug>
```

## What $pll does NOT do

- Merge branches into `main` — the user decides.
- Open pull requests — the user decides.
- Rebase or squash across lanes — each lane is its own commit history.
- Skip Verification Gates for any reason.
