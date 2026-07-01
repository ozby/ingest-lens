---
type: blueprint
owner: webpresso
status: planned
complexity: S
created: "2026-07-01"
last_updated: "2026-07-01"
title: "Adopt setup-owned Husky hook sections"
---

# Adopt setup-owned Husky hook sections

## Goal

Align consumer Husky hook entrypoints with the upstream agent-kit section contract so Webpresso-managed hook behavior is refreshed by setup while repo-local custom commands remain in preserved user-owned blocks.

## Scope

- Regenerate `.husky/pre-commit`, `.husky/commit-msg`, and `.husky/pre-push` from the upstream agent-kit base-kit hook templates.
- Preserve real repo-local hook commands in `user-owned` sections.
- Remove stale Lore `--require-lore` commit-msg/pre-push enforcement from generated hooks.
- Keep migration scoped to hook ownership; no runtime code changes.

## Acceptance criteria

- Hook files contain managed and user-owned Webpresso marker sections.
- No generated hook enforces `--require-lore`.
- Existing repo-local hook behavior is preserved inside the relevant user-owned section.
- `wp sync --check`, blueprint audit, typecheck/lint/tests where available pass or any environment-only gap is documented.

## Verification plan

- Inspect migrated hook files for marker sections and absence of stale Lore enforcement.
- Run `wp sync --check` and blueprint lifecycle/trust audit.
- Run repo typecheck, lint, and tests through `vp`/`wp` where configured.
