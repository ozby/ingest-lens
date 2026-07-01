---
type: blueprint
owner: webpresso
title: "Husky hook section migration"
status: completed
complexity: S
created: "2026-07-01"
last_updated: "2026-07-01"
progress_pct: 100
progress: "Completed: Husky hooks now use Webpresso managed/user-owned sections; stale Lore enforcement is removed while repo-local commands are preserved."
depends_on:
  - "@webpresso/agent-kit hook section ownership"
completed_at: "2026-07-01"
---

# Husky hook section migration

## Status

Completed — adopted setup-owned Husky hook entrypoints with AGENTS-style managed and user-owned blocks.

## Problem

Consumer repositories had hand-maintained Husky hook entrypoints, including stale commit-message/pre-push Lore enforcement in some repos. That duplicated agent-kit policy and made future setup refreshes either overwrite custom commands or leave stale behavior behind.

## Scope

- Regenerate `.husky/pre-commit`, `.husky/commit-msg`, and `.husky/pre-push` from the upstream agent-kit base-kit hook templates.
- Preserve repo-local hook commands in `user-owned` sections.
- Remove stale Lore `--require-lore` commit-msg/pre-push enforcement from generated hooks.
- Keep migration scoped to hook ownership; no runtime code changes.

## Non-goals

- Do not change app/runtime code.
- Do not force additional setup-generated AGENTS or skill-symlink drift into this PR.
- Do not reintroduce mandatory per-commit Lore enforcement.

## Tasks

#### [dedupe] Task 1.1: Adopt sectioned hook templates

**Status:** done

**Depends:** None

- Add managed/user-owned sections to pre-commit, commit-msg, and pre-push hooks.
- Preserve repo-local hook commands inside user-owned blocks.
- Drop stale generated Lore enforcement.

#### [qa] Task 1.2: Verify hook migration

**Status:** done

**Depends:** Task 1.1

- Inspect hook files for marker sections.
- Confirm `--require-lore` is absent from generated hook entrypoints.
- Run available repo gates after dependency install.

## Acceptance criteria

- Hook files contain managed and user-owned Webpresso marker sections.
- No generated hook enforces `--require-lore`.
- Existing repo-local hook behavior is preserved inside the relevant user-owned section.
- Verification evidence or explicit pre-existing gate gaps are recorded before merge.

## Verification evidence

- Hook inspection confirmed managed/user-owned sections in `.husky/pre-commit`, `.husky/commit-msg`, and `.husky/pre-push`.
- `rg -- '--require-lore' .husky` returned no matches.
- `wp setup` from merged agent-kit source generated the hook migration.
- `wp sync --check` gap: existing generated skill/AGENTS drift is present in this worktree and is outside this hook-only PR.
- Additional repo gates are recorded in the PR after dependency install.
