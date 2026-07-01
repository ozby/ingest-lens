---
type: blueprint
owner: ozby
title: "Consumer duplication upstreaming"
status: in-progress
complexity: M
created: "2026-06-30"
last_updated: "2026-06-30"
progress_pct: 80
progress: "Release tooling deduped to upstream wp release-metadata commands; root quality scaffold placeholders removed; remaining smoke Playwright scaffold and runtime-env extraction gated on upstream package release."
depends_on:
  - "webpresso/monorepo: consumer duplication upstreaming"
---

# Consumer duplication upstreaming

## Goal

Remove or thin local copies of generic Webpresso scaffolding, release tooling, and Playwright baseline config so this consumer depends on upstream-owned public/setup surfaces instead of hand-maintained duplicate files.

## Scope

- Adopt generator/setup-owned scaffolding for repeated docs/templates, agent README placeholders, smoke spec, and quality sample files where this repo matches the shared contract.
- Replace duplicated release/version sync scripts with upstream shared tooling wrappers.
- Adopt shared Playwright baseline config where repo behavior matches the extracted trio contract.
- For `aksaprocess.tr`, align only where current behavior already matches or can trivially conform.

## Architecture governance

Architecture docs:

- [`docs/architecture.md`](../../docs/architecture.md)
- [`docs/architecture.contract.json`](../../docs/architecture.contract.json)

## Architecture before

- This consumer hand-maintained duplicated release metadata scripts in `scripts/release-publish.ts` and `scripts/sync-release-metadata-version.ts`.
- Root `src/quality-sample.ts` and `src/quality-sample.test.ts` existed as generic setup/template scaffold placeholders rather than repo-specific application behavior.
- Remaining setup/template and runtime-env candidates were not yet guarded by an upstream regeneration/package contract, so moving them wholesale would risk policy drift.

## Architecture after

- Release metadata behavior is consumed through the upstream `wp release-metadata sync` and `wp release-metadata prepare` command surface, with only package-script configuration left in this repo.
- Generic root quality-sample placeholders are no longer manually maintained in this consumer.
- Non-trivial setup/template and runtime-env extraction remains explicitly blocked on the upstream Webpresso CLI/setup release so repo-specific policy does not move blindly.

## Tasks

#### [tooling] Task 1.1: Replace duplicated release tooling with upstream command wrappers

**Status:** done

**Depends:** None

Replace local release/version metadata scripts with package scripts that call the upstream `wp release-metadata sync` and `wp release-metadata prepare` command surface.

**Acceptance:**

- [x] `package.json` uses `changeset version && wp release-metadata sync` for `version`.
- [x] `package.json` uses `wp release-metadata prepare` for `release:publish`.
- [x] Local duplicated release helper scripts are removed.

#### [scaffold] Task 1.2: Remove duplicated root quality-sample placeholders

**Status:** done

**Depends:** Task 1.1

Remove root `src/quality-sample.ts` and `src/quality-sample.test.ts` scaffold placeholders from consumers where they were generic duplicated setup/template artifacts.

**Acceptance:**

- [x] Generic root quality-sample files are no longer hand-maintained in this consumer.
- [x] Repo-specific app/package tests remain untouched.

#### [qa] Task 1.3: Verify migration contract and record follow-up boundaries

**Status:** blocked

**Blocked:** Waiting for upstream Webpresso CLI PR `webpresso/monorepo#101` to land and publish the `wp release-metadata` command surface before consumer PRs can safely merge.

**Depends:** Task 1.1, Task 1.2

Run the targeted release-contract/static checks for this consumer, record the upstream landing dependency, and leave non-trivial setup/template/runtime-env extraction as explicit follow-up rather than moving repo policy blindly.

**Acceptance:**

- [x] Targeted consumer test evidence is recorded below.
- [x] Landing order documents the dependency on the upstream Webpresso CLI PR.
- [x] Deferred smoke Playwright scaffold and runtime-env extraction boundaries are called out explicitly.

#### [scaffold] Task 1.4: Remove setup-owned placeholder documentation

**Status:** done

**Depends:** Task 1.2

Delete generic agent README placeholders, docs template YAML copies, and template-only changelog boilerplate where present. These surfaces are setup/package-owned and should not be hand-maintained in consumers.

**Acceptance:**

- [x] `agent-skills/README.md` and `agent-rules/README.md` are no longer duplicated consumer files.
- [x] `docs/templates/core-doc.yaml` and `docs/templates/guide.yaml` are no longer duplicated consumer files.
- [x] Template-only `CHANGELOG.md` boilerplate is removed where this repo carried it.

## Acceptance criteria

- Generic repeated behavior no longer lives as full per-consumer copies.
- Repo-specific values remain local and explicit.
- Regeneration/setup checks can restore setup-owned files without manual edits.
- Any intentional divergence is documented as an exception rather than silent drift.

## Implementation update — 2026-06-30

- Replaced duplicated local release/version-sync scripts with thin package scripts that call the upstream `wp release-metadata sync` and `wp release-metadata prepare` surfaces.
- Deleted the root `src/quality-sample.ts` and `src/quality-sample.test.ts` scaffold placeholders.
- Updated release contract tests to pin the new upstream command surface.
- Removed setup-owned agent README placeholders, docs-template YAML copies, and template-only changelog boilerplate. File-based Playwright smoke specs remain until `@webpresso/agent-config/playwright/quality-scaffold` is published and consumers can import it safely.
- Runtime-env package extraction remains a follow-up for `ingest-lens`; current local code includes secret-manager/profile policy and should not be moved blindly.
- `webpresso/agent-kit#332` now owns the future Playwright quality-scaffold package surface; consumer smoke file deletion waits for that package release.

## Verification evidence

- Static verification script confirmed all four consumers point `version` to `changeset version && wp release-metadata sync`, point `release:publish` to `wp release-metadata prepare`, and no longer contain the deleted duplicate release/quality-sample files.
- `ingest-lens`: `tsx --test test/reusable-deploy-workflows.test.ts` passed (5 tests).
- `edge-matte`: `tsx --test test/reusable-deploy-workflows.test.ts` passed (6 tests).
- `aksaprocess.tr`: `vitest run --config /tmp/consumer-empty-vitest.config.mjs test/release-contract.test.ts` passed (2 tests).
- `ozby.dev`: after `pnpm install --ignore-scripts`, `pnpm exec vitest run --config /tmp/consumer-empty-vitest.config.mjs infra/src/deploy/deploy-contract.test.ts` passed (11 tests).

## Landing order

Consumer PRs must land after the upstream Webpresso CLI PR that introduces `wp release-metadata`.
