---
type: blueprint
owner: ozby
title: "Docs template dedupe"
status: in-progress
complexity: S
created: "2026-07-01"
last_updated: "2026-07-01"
progress_pct: 25
progress: "Blueprint created; implementation will remove consumer-owned copies of setup-owned docs templates."
depends_on:
  - "@webpresso/agent-kit catalog/docs/templates"
---

# Docs template dedupe

## Status

In progress — consumer migration away from hand-maintained `docs/templates/*` copies that are already shipped and scaffolded by Webpresso setup.

## Problem

This consumer still commits generic documentation and blueprint templates under `docs/templates/`. The current Webpresso toolchain already owns canonical templates in `@webpresso/agent-kit` (`catalog/docs/templates/*`) and materializes them through setup/init, with `docs/templates.local/` reserved for consumer-owned overrides. Keeping identical or near-identical consumer copies creates drift without adding repo-specific behavior.

## Scope

- Remove generic consumer-owned `docs/templates/*` template files that match the shared Webpresso template contract.
- Add those setup-owned paths to the local ignore list so `wp setup` materializations do not become consumer-maintained source again.
- Update repo-local docs that point at committed template files to describe the setup-owned generated template surface or `wp blueprint` flow instead.
- Keep any genuinely repo-specific docs or template overrides out of scope unless they live in `docs/templates.local/`.

## Architecture governance

- [`docs/architecture.md`](../../docs/architecture.md)
- [`docs/architecture.contract.json`](../../docs/architecture.contract.json)

## Architecture before

Generic docs templates were committed as consumer source even though the shared Webpresso setup/catalog already owns the template contract.

## Architecture after

The consumer keeps only repo-owned documentation. Generic docs templates are generated/setup-owned from the Webpresso catalog, and consumer-specific template overrides belong under `docs/templates.local/`.

## Non-goals

- No changes to existing authored docs, ADRs, blueprints, or runbooks.
- No changes to the upstream template content in this consumer PR.
- No new dependencies.

## Tasks

#### [dedupe] Task 1.1: Remove committed generic docs templates

**Status:** in progress

**Depends:** None

- Delete committed generic `docs/templates/*` copies.
- Ignore setup-owned generated template paths.
- Preserve docs guidance by pointing users at setup-owned templates and `wp blueprint` commands.

#### [qa] Task 1.2: Verify setup and docs contracts

**Status:** in progress

**Depends:** Task 1.1

- Run docs, blueprint, sync, typecheck/lint, and any repo-specific architecture checks.
- Prove `wp setup`/`wp sync --check` does not leave tracked duplicate template copies.
- Collect outside approval before merge if CI requires landing.

## Acceptance criteria

- No committed generic `docs/templates/*` template files remain in this consumer.
- Repo docs do not link to deleted committed template files as if they were source-owned.
- `wp audit docs-frontmatter`, `wp audit blueprint-lifecycle`, `wp sync --check`, TPH, typecheck/lint, and relevant repo-specific governance gates pass or are documented with evidence.
