---
type: blueprint
title: Adopt the finalized public Webpresso CI secret surfaces
status: completed
complexity: M
created: "2026-05-23"
last_updated: "2026-06-01"
progress: "100% (public CI helper adoption verified and lane closed on 2026-06-01)"
owner: ozby
depends_on: []
cross_repo_depends_on:
  - repo: webpresso/agent-kit
    slug: secret-aware-worker-tail-mcp
    require_status: completed
tags:
  - ci
  - secrets
  - webpresso
  - runtime
  - act
---

# Adopt the finalized public Webpresso CI secret surfaces

## Architecture governance

Architecture docs:

- [`docs/architecture.md`](../../../docs/architecture.md)
- [`docs/architecture.contract.json`](../../../docs/architecture.contract.json)

## Architecture before

The repo had local CI helper scripts, but this blueprint still framed the work
as waiting on future public Webpresso secret surfaces. The architecture
contract therefore treated public CI adoption as active planned work rather
than completed downstream adoption.

## Architecture after

The public CI helper boundary is closed: repo workflows continue to own local
profiles and orchestration, while secret-aware execution remains delegated to
the shared Webpresso surfaces (`wp`, `with-secrets`, and the act wrapper
contract). The architecture contract now links the completed blueprint record.

**Goal:** finish the IngestLens-side adoption onto the finalized public helper
contract now that the local repo already uses `act-with-webpresso` and
`with-secrets` as its durable contributor surfaces.

## Current facts (checked 2026-05-31)

- root scripts already route `act:ci`, `act:e2e`, `act:cleanup`, and `act:list`
  through `scripts/act-with-webpresso.ts`
- local development already uses `with-secrets -- vp run dev`
- the stale part of this blueprint was the old “wait for future helper shape”
  framing; the remaining work is downstream adoption and docs/preset cleanup

## Tasks

1. keep local code limited to preset/profile ownership while consuming the
   finalized public helper surface
2. preserve workflow/profile parity through focused helper tests
3. align active contributor guidance with `wp_*`, `wp config secrets`,
   `with-secrets`, and `act-with-webpresso`

## Verification gates

| Gate                  | Command / proof                              | Success criteria |
| --------------------- | -------------------------------------------- | ---------------- |
| Helper contract proof | focused `scripts/act-with-webpresso.test.ts` | pass             |
| Docs/frontmatter      | `wp audit docs-frontmatter`                  | pass             |
| Blueprint lifecycle   | `wp audit blueprint-lifecycle`               | pass             |

## Acceptance

- [x] Upstream dependency now points at the completed helper-contract slug.
- [x] The lane reflects current local helper reality instead of the older Doppler-first framing.
- [x] Scope stays on downstream adoption and docs/preset cleanup.
