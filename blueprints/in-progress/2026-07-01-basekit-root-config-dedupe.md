---
type: blueprint
owner: ozby
title: "Base-kit root config dedupe"
status: in-progress
complexity: S
created: "2026-07-01"
last_updated: "2026-07-01"
progress_pct: 20
progress: "Blueprint created; implementation will stop tracking setup-owned base-kit root config copies."
depends_on:
  - "@webpresso/agent-kit catalog/base-kit .editorconfig/.actrc templates"
---

# Base-kit root config dedupe

## Status

In progress — migrate exact repeated `.editorconfig` and `.actrc` files from consumer-owned source to Webpresso setup-owned base-kit materialization.

## Problem

All four consumers commit byte-identical `.editorconfig` and `.actrc` files. Webpresso already owns those defaults in `@webpresso/agent-kit` base-kit templates and `wp setup` materializes them. Keeping the copies in each consumer creates generic config drift without repo-specific behavior.

## Scope

- Remove committed `.editorconfig` and `.actrc` copies.
- Ignore those setup-owned materialized files locally.
- Run `wp setup` to prove the files are reproducible and ignored.
- Keep repo-specific formatter/lint/tool behavior unchanged.

## Non-goals

- Do not change formatter settings or act runner settings.
- Do not touch package scripts, dependencies, or unrelated root config files.
- Do not force divergent consumers onto any non-identical config.

## Tasks

#### [dedupe] Task 1.1: Remove setup-owned root config copies

**Status:** in progress

**Depends:** None

- Delete tracked `.editorconfig` and `.actrc`.
- Add `.editorconfig` and `.actrc` to `.gitignore` near other Webpresso setup-owned surfaces.

#### [qa] Task 1.2: Verify setup materialization and gates

**Status:** in progress

**Depends:** Task 1.1

- Run `wp setup` and confirm `.editorconfig`/`.actrc` materialize as ignored files.
- Run sync, docs/blueprint audits, TPH, typecheck, lint, and tests.

## Acceptance criteria

- No tracked `.editorconfig` or `.actrc` remains in this consumer.
- `wp setup` regenerates both files and leaves no tracked dirt.
- Local gates and CI pass before merge.
