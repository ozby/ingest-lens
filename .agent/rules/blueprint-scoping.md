# Blueprint scoping — product-wedge anchor required

New blueprints that extend or replace enabling-layer infrastructure (runtime,
schema engine, agent fabric, session storage, policy engine, workflow runner)
MUST name a product-wedge in the current roadmap stage that directly consumes
the new capability. Blueprints without that anchor stay in `draft/` or move to
`archived/`.

## Why

Infra-only blueprints that lack a product-wedge anchor tend to hit the same
failure mode — substantial infra scope, no direct consumer pull, and a large
share of the actual value lands via other paths. The findings are worth
preserving; the blueprints themselves over-scoped.

The fix is simple: before investing in infra, name the product surface that
will use it in the same cycle.

## How to apply

During `ak blueprint new` / refinement, the blueprint `_overview.md` must
include a **Product wedge anchor** subsection at the top of the summary. The
anchor must name:

1. The concrete roadmap outcome this work unblocks (cite the vision or
   roadmap document and the specific outcome).
2. The user-facing surface (route, UI component, CLI verb) that consumes the
   new capability **in the same blueprint or an already-in-progress one**.
3. What the product user can do after this lands that they cannot do today.

### Template

```markdown
## Product wedge anchor

- **Stage outcome:** <cite roadmap section + specific outcome>
- **Consuming surface:** <route / component / verb + path>
- **New user-visible capability:** <one sentence>
```

If you cannot fill all three, the blueprint is premature. Convert it to a
fact-check document under `blueprints/draft/` with a note that it blocks on a
product-wedge anchor, or mine its findings into a narrower blueprint that has
one.

## What counts as a product wedge

A wedge is something a roadmap-stage user can see or touch:

- An app they launched
- A live deployment flow they triggered
- A user they acquired via an acquisition loop
- A KPI signal they read off a dashboard
- A review decision they approved in the UI

Pure-infra wedges ("cleaner runtime", "simpler fabric") do not qualify on
their own. They qualify only when paired with one of the above.
