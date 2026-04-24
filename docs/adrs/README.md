---
type: adr
last_updated: "2026-04-24"
---

# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the
IngestLens showcase and its underlying delivery platform. ADRs capture the
_why_ behind significant decisions so future maintainers (including future you)
understand the reasoning, not just the outcome.

## Public naming note

Public docs and UI should use **IngestLens**. The Cloudflare Worker resource
name in `apps/workers/wrangler.toml` intentionally remains
`node-pubsub-workers` for now so the rebrand does not quietly change deployed
runtime identifiers. Treat that as an explicit internal-name deferment, not the
public product name.

## What belongs here

An ADR is warranted when:

- A non-obvious design choice was made (e.g., in-process vs. durable queue)
- An alternative was seriously considered and rejected
- The decision has meaningful reversibility cost

Routine implementation choices do not need an ADR.

## What does NOT belong here

ADRs record **decisions**. Blueprints track **execution**. Both coexist:

- Blueprint: "we will migrate auth to JWTs — here are the tasks and timeline"
- ADR: "we chose API-key auth for v1 because X, Y, Z — JWT is the documented upgrade path"

## Format

Use `docs/templates/adr.md` as the canonical template. Every ADR must
include `Status`, `Context`, `Decision`, `Consequences`, and
`Alternatives considered`.

## Index

| ADR                                                 | Title                                | Status   |
| --------------------------------------------------- | ------------------------------------ | -------- |
| [0001](./0001-event-delivery-signing-model.md)      | Event Delivery Signing Model         | accepted |
| [0002](./0002-pubsub-in-process-vs-durable.md)      | Pub/Sub In-Process vs. Durable Queue | accepted |
| [0003](./0003-auth-story.md)                        | Auth Story (v1 API Keys)             | accepted |
| [0004](./0004-ingestlens-ai-intake-architecture.md) | IngestLens AI Intake Architecture    | accepted |

## Lifecycle

```
proposed → accepted → superseded | deprecated
```

When superseding an ADR, update the old record's `Status` field to
`superseded by ADR-MMMM` and create the new ADR referencing the old one.
