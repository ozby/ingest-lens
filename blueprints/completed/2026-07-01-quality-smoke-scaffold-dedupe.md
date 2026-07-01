---
type: blueprint
owner: ozby
title: "Quality smoke scaffold dedupe"
status: completed
complexity: S
created: "2026-07-01"
last_updated: "2026-07-01"
completed_at: "2026-07-01"
progress_pct: 100
progress: "100% — generic root quality smoke scaffold duplication removed or replaced with the shared @webpresso/agent-config quality scaffold; local verification and outside review completed."
depends_on:
  - "@webpresso/agent-config@0.3.3"
---

# Quality smoke scaffold dedupe

## Status

Completed — consumer migration after `@webpresso/agent-config@0.3.3` published the shared Playwright quality scaffold.

## Problem

This consumer still carries generic root-level Playwright smoke scaffold files that are duplicated across Webpresso consumers. The upstream package now owns the reusable scaffold, so consumers should keep only repo-specific configuration and avoid manually maintaining identical smoke specs/fixtures.

## Scope

- Use the published `@webpresso/agent-config/playwright/quality-scaffold` surface when this repo's root Playwright config is only the generic quality scaffold.
- Delete local generic root `e2e/smoke.spec.ts` and `e2e/fixtures/smoke.html` copies when they are replaced by the upstream package or unused by this repo's app-specific Playwright config.
- Keep repo-specific E2E configuration untouched.

## Architecture governance

- [`docs/architecture.md`](../../docs/architecture.md)
- [`docs/architecture.contract.json`](../../docs/architecture.contract.json)

## Non-goals

- No application E2E behavior changes.
- No dependency additions.
- No changes to generated agent surfaces.

## Tasks

#### [dedupe] Task 1.1: Remove consumer-owned generic smoke scaffold

**Status:** done

**Depends:** None

- Replace repeated Playwright baseline config with the shared `@webpresso/agent-config/playwright/quality-scaffold` helper where behavior matches.
- Delete duplicated root `e2e/smoke.spec.ts`, `e2e/fixtures/smoke.html`, and placeholder `.gitkeep` files.
- Preserve repo-specific app E2E configuration and tests.

#### [qa] Task 1.2: Verify scaffold migration and land PR

**Status:** done

**Depends:** Task 1.1

- Prove the root Playwright config resolves the intended local or package-owned tests.
- Run blueprint lifecycle, TPH, sync, lint/typecheck, and CI checks.
- Collect at least two outside approvals before merge.

## Acceptance criteria

- Generic local smoke spec/fixture duplication is removed or replaced by the upstream package-owned scaffold.
- Repos with app-specific Playwright config keep that config intact.
- `wp sync --check`, TPH audit, typecheck/lint/format checks, and relevant Playwright smoke/list verification pass or any non-applicable check is documented with evidence.
- At least two outside reviewers approve before merge.
