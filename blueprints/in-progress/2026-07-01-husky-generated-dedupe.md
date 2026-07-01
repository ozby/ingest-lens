---
type: blueprint
owner: ozby
title: "Husky generated shim dedupe"
status: in-progress
complexity: S
created: "2026-07-01"
last_updated: "2026-07-01"
progress_pct: 20
progress: "Blueprint created; implementation will stop tracking generated Husky dispatcher files while preserving repo-owned hook policy."
depends_on:
  - "husky v9 generated .husky/_ dispatcher surface"
---

# Husky generated shim dedupe

## Status

In progress — remove committed generated Husky dispatcher/shim files from `.husky/_` while preserving repo-owned hooks such as `.husky/pre-commit`, `.husky/commit-msg`, and `.husky/pre-push`.

## Problem

All four consumers commit byte-identical `.husky/_/*` files. Husky v9 generates that directory during `husky`/`prepare`, including `.husky/_/.gitignore` and dispatcher scripts. Keeping generated dispatcher output in consumers creates duplicate maintenance without repo-specific behavior.

## Scope

- Delete committed `.husky/_/*` files.
- Add `.husky/_/` to the repo ignore list so generated dispatcher files stay untracked.
- Preserve repo-owned hook entrypoints outside `_`.
- Verify `wp sync`, commit hooks, typecheck/lint/tests, and hook behavior still work.

## Non-goals

- Do not change hook policy in `.husky/pre-commit`, `.husky/commit-msg`, or `.husky/pre-push`.
- Do not remove Husky itself or the `prepare` script.
- Do not touch `.editorconfig` or `.actrc` in this wave.

## Tasks

#### [dedupe] Task 1.1: Remove generated Husky dispatcher copies

**Status:** in progress

**Depends:** None

- Remove tracked `.husky/_/*` files.
- Ignore `.husky/_/` in `.gitignore`.

#### [qa] Task 1.2: Verify setup and hooks

**Status:** in progress

**Depends:** Task 1.1

- Run `husky`/setup regeneration smoke where available.
- Run sync, docs/blueprint audits, TPH, typecheck, lint, and tests.
- Confirm repo-owned hook files outside `.husky/_` remain tracked.

## Acceptance criteria

- No tracked `.husky/_/*` files remain.
- `.husky/_/` generated files do not appear as untracked after Husky setup.
- Repo-owned hook files outside `.husky/_` are unchanged.
- Local gates and CI pass before merge.
