---
type: guide
last_updated: "2026-05-23"
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

- AI suggestions are constrained by deterministic validation and review paths
- delivery semantics are described as explicit guarantees, failure modes, and operator behaviors

### 4) What proves this is engineered rather than narrated?

Use these proof surfaces:

- [Execution roadmap](./ROADMAP.md) — how major waves landed and what is active now
- [Project records](./README.md) — links to roadmap and historical housekeeping
- [`blueprints/in-progress/system-clarity-hardening/_overview.md`](../../blueprints/in-progress/system-clarity-hardening/_overview.md)
- [`apps/workers/src/tests/`](../../apps/workers/src/tests/) — route and runtime behavior coverage
- [`apps/client/src/services/`](../../apps/client/src/services/) — client/Worker transport seam and contract tests
- [`apps/lab/`](../../apps/lab/) + [Lab architecture](../lab-architecture.md) — measurement and comparison harnesses

### 5) What should you inspect in code?

If you want one quick code path, inspect:

- Worker ownership/runtime seams in [`apps/workers/src/routes/`](../../apps/workers/src/routes/)
- client transport seam in [`apps/client/src/services/`](../../apps/client/src/services/)

The active simplification wave is making those boundaries thinner and more explicit:

- [`blueprints/in-progress/system-clarity-hardening/_overview.md`](../../blueprints/in-progress/system-clarity-hardening/_overview.md)

## What this project is trying to show

- **System boundaries are explicit.** Cross-cutting behavior should have one owner.
- **Docs and verification matter as much as features.** Trust comes from architecture clarity plus evidence.
- **Operational honesty beats demo polish.** Guarantees, retries, review paths, and failure handling are treated as first-class product behavior.

## If you only read three things

1. [README](../../README.md)
2. [System architecture](../system-architecture.md)
3. [Delivery guarantees](../delivery-guarantees.md)
