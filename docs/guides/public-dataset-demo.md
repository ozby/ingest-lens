---
type: guide
last_updated: "2026-04-24"
---

# Public dataset demo: pinned ATS intake demo

Use this guide to run the **public-dataset-demo-ingestion** slice and frame the public-dataset demo truthfully during review.

The demo is intentionally narrow: it proves the intake pipeline on a small, pinned,
public ATS dataset so the same flow can be observed deterministically across
machines.

## Public demo scope and provenance

- **Primary fixture path (required):**
  `data/payload-mapper/payloads/ats/open-apply-sample.jsonl`
- **Source:** `open-apply-jobs` public dataset extracts (Ashby, Greenhouse,
  Lever)
- **Scope:** 8 mapped job-posting payloads in a stable sample.
- **Status:** deterministic, replayable, and **no runtime filesystem dependency**
  for Worker execution.

This is not a live ATS connector. The dataset is a curated snapshot used for
review, mapping tasks, and deterministic walkthrough behavior.

## What the demo is and is not

- **Is:** a deterministic public-demo path for the intake flow and operator
  approval lifecycle.
- **Is not:** a private candidate stream, credentials-driven connector, or
  automated production mutation system.
- **Primary data policy:** only public, non-sensitive job-posting payloads are used in the demo lens.
- **Optional data policy extension:** if needed, any freshness step should stay
  explicit (pre-demonstration script or curated update) and never become the
  default runtime path.

## Demo API surface

The demo extends existing intake routes; there is no parallel demo backend.

- `GET /api/intake/public-fixtures`
  - returns fixture metadata only (id, source system/model, summary, source URL,
    contract hint)
- `GET /api/intake/public-fixtures/:fixtureId`
  - returns a single validated fixture payload for mapping suggestion input
- Existing approved path continues to be used:
  - `POST /api/intake/mapping-suggestions`
  - `GET /api/intake/mapping-suggestions/:id`
  - `POST /api/intake/mapping-suggestions/:id/approve`
  - `POST /api/intake/mapping-suggestions/:id/reject`

## Main flow (v1)

1. Open fixture catalog from `GET /api/intake/public-fixtures`.
2. Select one fixture and load payload with
   `GET /api/intake/public-fixtures/:fixtureId`.
3. Submit for mapping suggestion via
   `POST /api/intake/mapping-suggestions` (authenticated + rate-limited).
4. Review the suggestion result in the operator/admin flow and persist decision.
5. On approve: replay path creates normalized event and delivers through existing
   queue/topic rails.

## Fallback/extended path (not default)

- A pre-demo fixture refresh job may generate a new pinned fixture artifact in a
  local, explicit workflow.
- Even after refresh, runtime should still rely on **bundled fixtures** for the
  demo unless and until a separate admin-only live path is intentionally added.

## Why this docs slice matters

This is the public-facing provenance and boundary slice for the `public-dataset-demo-ingestion`
blueprint. It should match implementation state and avoid promising anything beyond
current shipped behavior.
