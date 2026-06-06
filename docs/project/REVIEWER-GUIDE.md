---
type: guide
last_updated: "2026-06-05"
---

# Reviewer guide

This repo is easiest to evaluate as a **systems project**, not as a single feature app.

The most useful questions to bring to it are:

1. **Can the system make ambitious behavior reviewable?**  
   AI-assisted mapping, delivery guarantees, replay, and operator flows are framed as explicit constraints rather than hidden magic.
2. **Are the tradeoffs documented, not implied?**  
   The architecture, ADRs, and guarantees docs describe what the system optimizes for and what it intentionally does not promise.
3. **Does the repo prove engineering judgment, not just throughput?**  
   The consistency lab, Worker tests, and blueprint/ADR surfaces are meant to show measurement, verification, and architectural restraint.

For a direct doc-to-proof map, use the [claim ↔ E2E traceability guide](../guides/claim-e2e-traceability.md).

## 15-minute path

### 1) What is the project?

Start with the root [README](../../README.md). It gives the shortest summary of the product shape, proof points, and repo map.

### 2) How is the system divided?

Read [System architecture](../system-architecture.md) next.

Focus on:

- Worker API as the central request/runtime boundary
- Postgres + Hyperdrive as the durable data plane
- Queues and Durable Objects as operational/runtime coordination tools
- the Consistency Lab as a **measurement harness**, not part of the main production path

### 3) Where does the “AI” story stay honest?

Read [AI intake + mapping flow](../architecture.md) and then [Delivery guarantees](../delivery-guarantees.md).

These are the two most important design claims:

- AI suggestions are constrained by deterministic validation and review paths ([E2E proof](../../apps/e2e/journeys/intake-mapping-flow.e2e.ts), [self-healing proof](../../apps/e2e/journeys/self-healing-intake.e2e.ts), [browser proof](../../apps/e2e/journeys/intake-heal-ui.spec.ts))
- delivery semantics are described as explicit guarantees, failure modes, and operator behaviors ([queue proof](../../apps/e2e/journeys/queue-message-flow.e2e.ts), [topic proof](../../apps/e2e/journeys/topic-publish-flow.e2e.ts), [hardening proof](../../apps/e2e/journeys/ownership-hardening.e2e.ts))

### 4) What proves this is engineered rather than narrated?

Use these proof surfaces:

- [Execution roadmap](./ROADMAP.md) — how major waves landed and what is active now
- [Claim ↔ E2E traceability](../guides/claim-e2e-traceability.md) — reviewer-facing claim map to executable proof
- [Project records](./README.md) — links to roadmap and historical housekeeping
- [`blueprints/completed/system-clarity-hardening/_overview.md`](../../blueprints/completed/system-clarity-hardening/_overview.md) — completed simplification program
- [`blueprints/completed/surface-test-traceability-hardening/_overview.md`](../../blueprints/completed/surface-test-traceability-hardening/_overview.md) — shipped claim/proof hardening for reviewer-facing surfaces
- [`blueprints/completed/2026-06-02-ingest-lens-preview-production-lanes.md`](../../blueprints/completed/2026-06-02-ingest-lens-preview-production-lanes.md) — shipped deploy-lane contract and production gating proof
- [`apps/workers/src/tests/`](../../apps/workers/src/tests/) — route and runtime behavior coverage
- [`apps/client/src/services/`](../../apps/client/src/services/) — client/Worker transport seam and contract tests
- [`apps/lab/`](../../apps/lab/) + [Lab architecture](../lab-architecture.md) — measurement and comparison harnesses

### 5) What should you inspect in code?

If you want one quick code path, inspect:

- Worker ownership/runtime seams in [`apps/workers/src/routes/`](../../apps/workers/src/routes/)
- client transport seam in [`apps/client/src/services/`](../../apps/client/src/services/)

The active simplification wave is making those boundaries thinner and more explicit:

- [`blueprints/completed/system-clarity-hardening/_overview.md`](../../blueprints/completed/system-clarity-hardening/_overview.md)

## What this project is trying to show

- **System boundaries are explicit.** Cross-cutting behavior should have one owner.
- **Docs and verification matter as much as features.** Trust comes from architecture clarity plus evidence.
- **Operational honesty beats demo polish.** Guarantees, retries, review paths, and failure handling are treated as first-class product behavior. ([E2E proof](../guides/claim-e2e-traceability.md#shipped-claim-matrix))

## If you only read three things

1. [README](../../README.md)
2. [System architecture](../system-architecture.md)
3. [Delivery guarantees](../delivery-guarantees.md)
