---
type: blueprint
owner: ozby
title: "Framework package consumer cutover"
status: completed
complexity: L
created: "2026-06-17"
last_updated: "2026-07-02"
completed_at: "2026-07-02"
progress_pct: 100
progress: "Completed from fresh origin/main evidence: live package-surface truth already uses @webpresso/framework and no live @webpresso/webpresso manifests or imports remain."
depends_on: []
tags:
  - consumer
  - package-surface
  - framework
---

# Framework package consumer cutover

## Goal

Migrate `ingest-lens` from `@webpresso/webpresso` to `@webpresso/framework`
without keeping a compatibility bridge.

## Completion summary

Fresh `origin/main` truth on 2026-07-02 already satisfies this blueprint:

- `package-surface.json` records `@webpresso/framework` as the consumer-facing
  baseline.
- `rg -n '@webpresso/webpresso' --glob '!blueprints/**' .` returns no live
  manifest, source, or test references.
- The only live `@webpresso/framework` match is the package-surface baseline,
  which is the intended consumer contract.

No additional repo code changes were required; the remaining work was lifecycle
truth only.

## Verification evidence

- `rg -n '@webpresso/webpresso' --glob '!blueprints/**' .`
- `rg -n '@webpresso/framework' --glob '!blueprints/**' .`
- `wp audit blueprint-lifecycle`
