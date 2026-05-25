---
type: guide
last_updated: "2026-05-23"
---

# Claim ↔ E2E traceability

This guide is the reviewer-facing evidence map for **shipped** product claims.
Use it when a doc says the system can do something and you want the fastest
path to executable proof.

## Canonical claim surfaces

- [README](../../README.md)
- [Reviewer guide](../project/REVIEWER-GUIDE.md)
- [Architecture](../architecture.md)
- [System architecture](../system-architecture.md)
- [Delivery guarantees](../delivery-guarantees.md)
- [Lab architecture](../lab-architecture.md)

## Shipped claim matrix

| Shipped claim                                                                                                  | Primary docs surface                                                                                                        | Executable proof                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adaptive intake repair is AI-assisted but deterministic, confidence-gated, and reviewable.                     | [README](../../README.md), [Architecture](../architecture.md), [Reviewer guide](../project/REVIEWER-GUIDE.md)               | [`apps/e2e/journeys/intake-mapping-flow.e2e.ts`](../../apps/e2e/journeys/intake-mapping-flow.e2e.ts), [`apps/e2e/journeys/self-healing-intake.e2e.ts`](../../apps/e2e/journeys/self-healing-intake.e2e.ts), [`apps/e2e/journeys/intake-heal-ui.spec.ts`](../../apps/e2e/journeys/intake-heal-ui.spec.ts)               |
| Delivery rails are shipped as queues, topic fan-out, push retries, and DLQ-aware failure handling.             | [README](../../README.md), [Delivery guarantees](../delivery-guarantees.md), [Architecture](../architecture.md)             | [`apps/e2e/journeys/queue-message-flow.e2e.ts`](../../apps/e2e/journeys/queue-message-flow.e2e.ts), [`apps/e2e/journeys/topic-publish-flow.e2e.ts`](../../apps/e2e/journeys/topic-publish-flow.e2e.ts), [`apps/e2e/journeys/public-fixture-demo-flow.e2e.ts`](../../apps/e2e/journeys/public-fixture-demo-flow.e2e.ts) |
| Reviewer-facing client surfaces are shipped for dashboard, queues, topics, metrics, intake, and intake review. | [README](../../README.md), [Reviewer guide](../project/REVIEWER-GUIDE.md), [System architecture](../system-architecture.md) | [`apps/e2e/journeys/client-surfaces.spec.ts`](../../apps/e2e/journeys/client-surfaces.spec.ts), [`apps/e2e/journeys/intake-heal-ui.spec.ts`](../../apps/e2e/journeys/intake-heal-ui.spec.ts)                                                                                                                           |
| Client branding and primary route story stay aligned to the IngestLens narrative.                              | [README](../../README.md)                                                                                                   | [`apps/e2e/journeys/ingestlens-branding.e2e.ts`](../../apps/e2e/journeys/ingestlens-branding.e2e.ts), [`apps/e2e/journeys/client-route-code-splitting.e2e.ts`](../../apps/e2e/journeys/client-route-code-splitting.e2e.ts)                                                                                             |
| Authenticated operator flows are real, not mocked.                                                             | [README](../../README.md), [Reviewer guide](../project/REVIEWER-GUIDE.md)                                                   | [`apps/e2e/journeys/auth-session.e2e.ts`](../../apps/e2e/journeys/auth-session.e2e.ts)                                                                                                                                                                                                                                 |
| Ownership boundaries are enforced across queue, dashboard, topic, and websocket surfaces.                      | [System architecture](../system-architecture.md), [Delivery guarantees](../delivery-guarantees.md)                          | [`apps/e2e/journeys/ownership-hardening.e2e.ts`](../../apps/e2e/journeys/ownership-hardening.e2e.ts)                                                                                                                                                                                                                   |
| Worker/runtime health is continuously provable.                                                                | [README](../../README.md), [System architecture](../system-architecture.md)                                                 | [`apps/e2e/journeys/worker-health.e2e.ts`](../../apps/e2e/journeys/worker-health.e2e.ts), [`apps/e2e/journeys/neon-branch-provider.e2e.ts`](../../apps/e2e/journeys/neon-branch-provider.e2e.ts)                                                                                                                       |
| Delivery-path correctness and latency claims are measured empirically, not narrated.                           | [README](../../README.md), [Delivery guarantees](../delivery-guarantees.md), [Lab architecture](../lab-architecture.md)     | [`apps/lab/scenarios/s1a-correctness/test/e2e/full-run.test.ts`](../../apps/lab/scenarios/s1a-correctness/test/e2e/full-run.test.ts), [`apps/lab/scenarios/s1b-latency/test/e2e/full-run.test.ts`](../../apps/lab/scenarios/s1b-latency/test/e2e/full-run.test.ts)                                                     |

## Suite map

- `foundation` → worker/runtime health
- `auth` → operator auth/session proof
- `messaging` → queues + topics delivery proof
- `hardening` → ownership and cross-tenant rejection proof
- `intake` → deterministic AI-assisted mapping approval proof
- `healing` → adaptive/self-healing + rollback proof
- `demo` → public fixture replay into delivery rails
- `client` → client build proof + browser navigation proof
- `intake-ui` → intake submission + admin review browser proof
- `full` → all Vitest journeys plus both Playwright browser suites

## Maintenance rule

When a reviewer-facing doc adds or strengthens a **shipped** capability claim,
update this matrix in the same change and link the claim to at least one
executable E2E file.
