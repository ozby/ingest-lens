---
type: blueprint
status: planned
complexity: M
created: "2026-05-30"
last_updated: "2026-05-31"
progress: "35% (root/package script migration is in flight; metadata normalized to current upstream state)"
depends_on: []
cross_repo_depends_on:
  - repo: webpresso/agent-kit
    slug: 2026-05-30-cross-project-wp-execution-map
    require_status: completed
  - repo: webpresso/agent-kit
    slug: 2026-05-30-agent-kit-base-wp-core
    require_status: completed
tags:
  - wp
  - ingest-lens
  - thin-consumer
  - tooling
---

# IngestLens: `wp`-first thin-consumer migration

## Architecture governance

Architecture docs:

- [`docs/architecture.md`](../../docs/architecture.md)
- [`docs/architecture.contract.json`](../../docs/architecture.contract.json)

**Goal:** finish the repo's move to the shipped base-`wp` contract without
absorbing framework-specific behavior and without treating stale absolute
blueprint paths as active upstream truth.

## Current facts (checked 2026-05-31)

- root `package.json` already routes `setup:agent` and `postinstall` through
  `wp setup`
- root audit surfaces already use `wp audit ...`, and package-local test scripts
  are being moved onto `wp test` where the upstream surface exists
- the existing E2E contract test now expects `@webpresso/agent-kit` to stay as a
  shared config dependency rather than a package-local wrapper dependency
- the remaining stale part of this blueprint was its old absolute-path
  dependency metadata, not the repo direction

## Desired end state

```text
developer/CI
  -> wp setup / wp lint / wp test / wp audit ...
  -> with-secrets and act-with-webpresso only where repo-local CI policy remains necessary
  -> no framework-owned command behavior
```

## Tasks

1. finish the active public command-surface migration to the shipped base `wp`
   lanes
2. keep package-local generic tooling cleanup downstream of passing wrapper
   checks
3. preserve the thin-consumer boundary: shared generic workflows upstream,
   app/runtime/deploy specifics local

## Verification gates

| Gate                | Command / proof                                                          | Success criteria     |
| ------------------- | ------------------------------------------------------------------------ | -------------------- |
| `wp` contract proof | focused contract tests such as `apps/e2e/src/global-wp-contract.test.ts` | pass                 |
| Blueprint lifecycle | `wp audit blueprint-lifecycle --legacy-omx`                              | passes               |
| Architecture drift  | repo architecture-drift check                                            | no touched-doc drift |

## Acceptance

- [x] Upstream dependency metadata now points at completed slugs instead of stale absolute planned paths.
- [x] The repo remains a base-`wp` thin consumer, not a framework consumer.
- [x] Current partial script migration progress is captured explicitly.
