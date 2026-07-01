---
type: blueprint
owner: ozby
title: "Base-kit actrc dedupe"
status: completed
complexity: S
created: "2026-07-01"
last_updated: "2026-07-01"
progress_pct: 100
progress: "Completed: .actrc is setup-owned/ignored and reproducible via wp setup; .editorconfig remains tracked for pre-setup CI/editor formatting."
depends_on:
  - "@webpresso/agent-kit catalog/base-kit .editorconfig/.actrc templates"
completed_at: "2026-07-01"
---

# Base-kit actrc dedupe

## Status

Completed — migrated exact repeated `.actrc` from consumer-owned source to Webpresso setup-owned base-kit materialization. `.editorconfig` was investigated but remains tracked because CI/editor formatting can run before setup materialization.

## Problem

All four consumers commit byte-identical `.actrc` files. Webpresso already owns the default in `@webpresso/agent-kit` base-kit templates and `wp setup` materializes it. Keeping the copies in each consumer creates generic config drift without repo-specific behavior. `.editorconfig` is also duplicated, but it must remain tracked because CI/editor formatting may run before setup materialization.

## Scope

- Remove committed `.actrc` copies.
- Ignore the setup-owned materialized `.actrc` locally.
- Keep `.editorconfig` tracked for pre-setup formatting/CI compatibility.
- Run `wp setup` to prove the files are reproducible and ignored.
- Keep repo-specific formatter/lint/tool behavior unchanged.

## Non-goals

- Do not change formatter settings or act runner settings.
- Do not remove tracked `.editorconfig` in this wave.
- Do not touch package scripts, dependencies, or unrelated root config files.
- Do not force divergent consumers onto any non-identical config.

## Tasks

#### [dedupe] Task 1.1: Remove setup-owned act config copy

**Status:** done

**Depends:** None

- Delete tracked `.actrc`.
- Add `.actrc` to `.gitignore` near other Webpresso setup-owned surfaces.
- Leave `.editorconfig` tracked.

#### [qa] Task 1.2: Verify setup materialization and gates

**Status:** done

**Depends:** Task 1.1

- Run `wp setup` and confirm `.actrc` materializes as an ignored file.
- Run sync, docs/blueprint audits, TPH, typecheck, lint, and tests.

## Acceptance criteria

- No tracked `.actrc` remains in this consumer.
- Tracked `.editorconfig` remains in this consumer.
- `wp setup` regenerates `.actrc` and leaves no tracked dirt.
- Local gates and CI pass before merge.

## Verification evidence

- `wp setup` regenerated `.actrc` as an ignored setup-owned file.
- No tracked `.actrc` remains.
- `.editorconfig` remains tracked for pre-setup formatter/CI compatibility.
- Local sync, governance, typecheck, lint, and test gates passed before merge.
