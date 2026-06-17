---
type: blueprint
status: draft
complexity: L
created: '2026-06-17'
last_updated: '2026-06-17'
progress: '0% (drafted for separate PR lane)'
depends_on: []
tags:
  - consumer
  - package-surface
  - breaking-change
  - framework
---

# Framework package consumer cutover

**Goal:** migrate `ingest-lens` from `@webpresso/webpresso` to `@webpresso/framework` with no compatibility bridge, preserving the facade-first consumer contract.

## Current facts

- `ingest-lens` is the main external framework + agent-kit consumer.
- Prior completed blueprints and baselines still reference `@webpresso/webpresso`.
- This repo is the external proof that the hard cut works for a real consumer.

## Key decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Consumer migration style | same-wave hard cut | Matches the no-bridge policy. |
| Surface model | keep facade-first | Consumer should still install one framework umbrella package plus agent-kit. |
| Scope | manifests, imports, baselines, docs, gates | A half-cut would leave release-proof ambiguous. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort |
| --- | --- | --- | --- | --- |
| **Wave 0** | 1.1, 1.2 | None | 2 agents | XS-S |
| **Wave 1** | 2.1, 2.2 | Wave 0 | 2 agents | S |
| **Critical path** | 1.1 → 2.1 | — | 2 waves | L |

### Phase 1: Consumer inventory and manifest cutover [Complexity: S]

#### [inventory] Task 1.1: Lock the real framework usage surface

**Status:** todo

**Depends:** None

Inventory every live `@webpresso/webpresso` dependency/import/baseline in this repo so the cut is explicit and testable.

**Files:**

- Modify: `blueprints/draft/framework-package-consumer-cutover.md`
- Modify: any local package-surface or baseline fixtures used to lock the migration

**Acceptance:**

- [ ] Every live framework reference is classified as code, manifest, test, or docs-only

#### [manifests] Task 1.2: Rename dependency edges to `@webpresso/framework`

**Status:** todo

**Depends:** None

Update consumer manifests and package-surface baselines to the new framework package name.

**Files:**

- Modify: `package.json`
- Modify: `pnpm-workspace.yaml` or equivalent catalog/baseline files if needed
- Modify: `package-surface.json`

**Acceptance:**

- [ ] No manifest/baseline entry still points at `@webpresso/webpresso`

### Phase 2: Import and verification cutover [Complexity: S]

#### [imports] Task 2.1: Migrate live imports and tests

**Status:** todo

**Depends:** Task 1.1, Task 1.2

Rewrite all live consumer imports/tests to `@webpresso/framework`.

**Files:**

- Modify: touched source and test files using the framework package

**Acceptance:**

- [ ] No live source/test import remains on `@webpresso/webpresso`

#### [verify] Task 2.2: Re-prove external consumer readiness

**Status:** todo

**Depends:** Task 2.1

Run the normal consumer package-surface/install/typecheck/test proof so this repo remains the external reference consumer.

**Acceptance:**

- [ ] Consumer verification gates pass on `@webpresso/framework`

## Verification Gates

| Gate | Command | Success Criteria |
| --- | --- | --- |
| Package surface | repo package-surface proof | pass |
| Typecheck/lint/tests | repo standard gates | pass |
| Install proof | consumer install/fresh-clone check | pass |
| Blueprint audit | `~/.vite-plus/bin/wp audit blueprint-lifecycle blueprints/draft/framework-package-consumer-cutover.md` | passes |

## Cross-Plan References

| Type | Blueprint | Relationship |
| --- | --- | --- |
| Upstream | framework package identity cutover and surface reduction | consumer follows the new package identity |
| Upstream | monorepo framework package cutover and surface enforcement | external proof should match monorepo policy/doctrine |
| Upstream | framework package surface alignment and policy convergence | package-surface guidance should agree with agent-kit |

## Non-goals

- A long compatibility window for the old package name
- Re-expanding back to leaf framework packages
- Touching repos with docs-only stale references but no live framework dependency
