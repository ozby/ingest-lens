---
type: guide
last_updated: "2026-04-21"
---

# Agent guardrails

When an agent is running autonomously in this repo, these guardrails take
precedence over any task-level instruction.

## Hard stops (ask first, always)

- **Destructive git operations** on shared branches: `push --force`, `reset --hard` on `main`, `branch -D` of an unmerged branch, rewriting published history.
- **`rm -rf`** on any directory that includes user-authored content or could include it (e.g. a worktree root, `blueprints/`).
- **External side-effects**: sending messages (Slack, email), creating/closing issues or PRs, publishing packages, rotating tokens, modifying CI secrets.
- **Infra changes**: `pulumi up`, `wrangler deploy --env production`, DNS edits, Doppler production config edits.
- **Database schema changes** in a production-reachable environment.
- **Anything touching `.github/workflows/` on `main`** without an explicit go-ahead.

A one-time human approval for an action does **not** generalize to other
actions in other contexts. Ask again when the scope changes.

## Soft stops (pause and summarize)

- Any task that cannot be completed without bypassing a documented rule.
- Any tool failure that a retry would not plausibly fix (auth, permissions, quota).
- Any discovery that changes the plan's acceptance criteria.

Summarize what you found, what you tried, and what the human must decide.
Do not fabricate "success" or silently narrow the task.

## Operating principles

1. **Measure twice, cut once.** Read before writing. If a change affects more than three files, write a one-line intent first and confirm it against the blueprint before editing.
2. **Prefer reversibility.** A new file is safer than editing an existing one; a feature flag is safer than a direct swap; a PR branch is safer than a direct push.
3. **Small, honest units.** One logical change per commit. If your commit message contains "and also", split the commit.
4. **Cite, don't recall.** When stating a fact about the repo, reference `path/to/file:line` or a command output. Never state "the codebase does X" from memory.
5. **Close the loop.** Every action taken must leave evidence (commit, test, log line). If you can't show you did it, you didn't.

## Do-not patterns

- **No `--no-verify`.** Hooks exist for a reason. Fix the cause.
- **No "I'll fix it later" TODOs** committed to `main` without a linked blueprint or issue.
- **No dependency bumps bundled into feature PRs.** Dependency changes are their own PR.
- **No silent error suppression** (`catch {}` with no log, no re-throw, no typed `Result`).
- **No checked-in fixtures** that contain real production data, real customer names, or real tokens (even expired ones).

## When in doubt

Write one sentence describing what you're about to do, and confirm before
executing if any of these apply:

- It costs money.
- It affects a system you do not personally own.
- A mistake would be visible outside the repo.
- The user phrased the task as exploratory ("what could we do...", "how should we...").
