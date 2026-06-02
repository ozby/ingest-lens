---
type: blueprint
status: in-progress
complexity: S
created: "2026-06-02"
last_updated: "2026-06-02"
progress: "Implemented preview-main, preview-pr, cleanup, and release-gated prd lane contract; awaiting final review gate."
depends_on: []
tags:
  - cloudflare
  - deploy
  - preview
  - production
---

# IngestLens: preview and release-gated production lanes

## Architecture governance

Architecture docs:

- [`docs/architecture.md`](../../docs/architecture.md)
- [`docs/architecture.contract.json`](../../docs/architecture.contract.json)

## Architecture before

IngestLens had Cloudflare Workers and Pulumi deploy scripts for `dev` and `prd`,
and `agent-kit.config.ts` named preview lanes, but the executable repo contract
was incomplete:

- no GitHub workflow deployed `main` to a stable preview-main lane;
- no PR workflow deployed and cleaned up ephemeral preview lanes;
- production deploys could be invoked through the generic `prd` deploy script
  without an explicit version/release metadata gate;
- the deployment topology in `docs/architecture.md` did not say where a `main`
  commit without a version was expected to land.

## Architecture after

`main` deploys to `preview-main`, PRs deploy `preview-pr-<n>` and destroy that
lane on PR close, and production deploys require the production workflow to pass
a semantic release version matching `infra/release-metadata.production.json`.

```text
push main
  -> deploy.preview.yml
  -> preview-main
  -> https://preview-main.ingest-lens.ozby.dev
  -> https://api.preview-main.ingest-lens.ozby.dev

pull_request #123 open/sync/reopen
  -> deploy.preview.yml
  -> preview-pr-123
  -> https://preview-pr-123.ingest-lens.ozby.dev
  -> https://api.preview-pr-123.ingest-lens.ozby.dev

pull_request #123 closed
  -> deploy.preview.yml destroy
  -> wrangler delete client/API Workers
  -> pulumi destroy preview-pr-123

workflow_dispatch deploy.production.yml release_version=1.2.3
  -> validate version_pr metadata releaseVersion=1.2.3
  -> deploy prd
  -> https://ingest-lens.ozby.dev
```

## Tasks

- [x] Add executable deploy-lane tests for the config, workflows, preview URLs,
      cleanup, and release metadata gate.
- [x] Align `agent-kit.config.ts` with the two-Worker topology and `prd`
      release gate.
- [x] Add preview deploy/destroy script for dynamic preview-main and
      preview-pr lanes, sharing lane resolution with the config surface.
- [x] Add production deploy wrapper that validates version metadata and blocks
      direct ungated `prd` deploys.
- [x] Document the lane contract in `docs/architecture.md`,
      `docs/architecture.contract.json`, and `README.md`.

## Verification

- `wp test --file src/deploy-lane-contract.test.ts`
- `wp lint` / `wp typecheck` / `wp test` through the final quality gate
- `python3 scripts/check_architecture_drift.py`
- `wp audit architecture-drift --root .`
- `wp audit blueprint-lifecycle --legacy-omx`
