---
type: rule
paths: ["blueprints/**/*.md"]
last_updated: "2026-04-21"
---

# Blueprint scoping — product-wedge anchor required

Every new blueprint that touches enabling-layer infrastructure (runtime,
delivery engine, schema, agent fabric, observability plane, CI/CD
pipeline) **must name a product-wedge in the current product vision that
directly consumes the new capability**. Blueprints without that anchor
stay under `blueprints/draft/` or move to `blueprints/archived/`.

## Why

Infra-empire blueprints — written against hypothetical consumers — are
the most common failure mode in this class of repo. They tend to be
**right about invariants and wrong about scope**: ~80% of what they
propose eventually lands via narrower, product-driven paths, leaving the
XL blueprint as a fossil. The scoping rule is the cheapest available
check against that outcome.

## Fields required in `_overview.md`

- **Product-wedge** — a one-line description of the product surface that consumes this capability on day one. Not "operators will benefit." Not "cleaner runtime." A specific feature, route, event, workflow, or dashboard.
- **First consumer file** — the path of the file that imports/uses the new capability in its first delivered form.
- **Failure behavior if deferred** — what breaks for the product-wedge if this blueprint slips a quarter.

If you cannot fill all three, the blueprint is premature. Either:

1. Convert it into a fact-check note under `blueprints/draft/<slug>/` that
   explicitly blocks on a product-wedge anchor; or
2. Mine its findings into a narrower blueprint that has one.

## Qualifying vs non-qualifying wedges

| Qualifying                                    | Non-qualifying       |
| --------------------------------------------- | -------------------- |
| A live deployment path a customer can trigger | "Cleaner runtime"    |
| A user journey measurable in a dashboard      | "Simpler fabric"     |
| A webhook the receiver depends on             | "Better patterns"    |
| A KPI that moves on a sprint timeline         | "Future flexibility" |

Pure-infra wedges qualify **only** when paired with one of the above and
delivered in the same blueprint.

## When an exception applies

The only exception is a documented **forced-move blueprint** — a
security CVE, a vendor EOL, or a production SEV-1 remediation. Mark it
with `forced-move: true` in the frontmatter and cite the forcing event.
