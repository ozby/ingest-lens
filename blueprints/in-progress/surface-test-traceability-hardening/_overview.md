---
type: blueprint
title: Surface test traceability hardening
status: in-progress
complexity: L
owner: ozby
created: 2026-05-23T00:00:00.000Z
last_updated: '2026-06-03'
progress: "75% (claim inventory, E2E proof-gap closure, and docs traceability links landed; widened verification matrix still in progress)"
---

## Product wedge anchor

- **Stage outcome:** `docs/project/ROADMAP.md` reviewer-first proof surfaces for AI-assisted intake, delivery guarantees, and operational clarity.
- **Consuming surface:** Root `README.md`, `docs/project/REVIEWER-GUIDE.md`, supporting architecture docs, and the executable journeys in `apps/e2e/journeys/*`.
- **New user-visible capability:** A reviewer can move from every shipped product claim to at least one executable E2E proof point without guessing where evidence lives.

## Architecture governance

Architecture docs:

- [`docs/architecture.md`](../../../docs/architecture.md)
- [`docs/architecture.contract.json`](../../../docs/architecture.contract.json)

## Summary

Spawn a coordinated team to audit the repo’s externally visible product surfaces, tighten unit/integration/E2E coverage where proof is thin, and add durable docs traceability so every shipped claim points to at least one E2E test file.

Zero-`.mjs` baseline note: as of 2026-06-03 the repo has no tracked first-party
`.mjs` files, so adoption here is enforcement-only through the shared
`wp audit no-first-party-mjs --root .` surface.

## Tasks

#### Task 1.1: [audit] Build the claim-to-surface inventory

**Status:** done
**Wave:** 0
**Lane:** docs
**Files:**

- README.md
- docs/project/REVIEWER-GUIDE.md
- docs/architecture.md
- docs/system-architecture.md
- docs/delivery-guarantees.md
- docs/lab-architecture.md
- apps/e2e/src/e2e-suite-manifest.ts
- apps/e2e/journeys/

**Acceptance:**

- [x] Shipped claims in reviewer-facing docs are inventoried by surface and truth state.
- [x] Each claim is mapped to an existing E2E journey or flagged as an evidence gap.
- [x] The inventory distinguishes shipped claims from aspirational or partial language per docs policy.

#### Task 1.2: [testing] Close missing E2E proof gaps on critical surfaces

**Status:** done
**Wave:** 1
**Lane:** e2e
**Files:**

- apps/e2e/journeys/
- apps/e2e/src/e2e-suite-manifest.ts
- apps/e2e/README.md
- apps/client/src/
- apps/workers/src/

**Acceptance:**

- [x] Every critical shipped surface claim has at least one executable E2E journey.
- [x] New or changed E2E coverage is added to the suite manifest with the narrowest sensible suite.
- [x] Supporting unit/integration coverage is added or tightened where new E2E behavior depends on lower-level invariants.

#### Task 1.3: [docs] Link claims directly to executable E2E evidence

**Status:** done
**Wave:** 1
**Lane:** docs
**Files:**

- README.md
- docs/project/REVIEWER-GUIDE.md
- docs/architecture.md
- docs/system-architecture.md
- docs/delivery-guarantees.md
- docs/testing/

**Acceptance:**

- [x] Reviewer-facing docs link each shipped claim to at least one E2E test file or suite entry.
- [x] A durable traceability document explains how claims map to journeys and suites.
- [x] Docs stay concise and use workspace-relative links that survive repo moves.

#### Task 1.4: [verify] Prove the tightened matrix still passes

**Status:** in_progress
**Wave:** 2
**Lane:** verify
**Files:**

- apps/e2e/
- apps/client/
- apps/workers/
- docs/
- package.json

**Acceptance:**

- [ ] Targeted unit/integration suites pass for touched surfaces.
- [ ] Relevant E2E suites pass for every linked claim surface.
- [ ] Docs validation, lint, and typecheck pass for touched areas.

**Progress note:** `vp run e2e -- --suite client` passes as of 2026-05-24, including healthy local Worker + client startup and the `journeys/client-surfaces.spec.ts` Playwright proof. Remaining targeted lint/typecheck/docs verification for the widened traceability surface is still pending.
