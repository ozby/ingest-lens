---
type: blueprint
status: planned
complexity: L
created: "2026-04-21"
last_updated: "2026-04-22"
progress: "0% (drafted)"
depends_on:
  - pnpm-catalogs-adoption
  - stryker-mutation-guardrails
  - doppler-secrets
  - commit-hooks-guardrails
tags:
  - ci
  - github-actions
  - guardrails
---

# CI/CD hardening (GitHub Actions)

**Goal:** Build a production-grade GitHub Actions pipeline with matrix
testing, corepack-pinned pnpm, cached installs, required gates, preview
deploys, OIDC-based secret exchange, and required status checks enforced
on `main`.

## Planning Summary

- **Current state:** `.github/workflows/ci.yml` exists but is minimal. Pipelines should gate merges on type-check, lint, test, mutation (affected), blueprint validation, catalog drift, and security scans.
- **Target:** A fast happy path (≤8 min on warm cache), mandatory required-status-checks on `main`, preview deploys that self-clean on PR close, and OIDC federation between GitHub and Doppler/Cloudflare so long-lived secrets never live in Actions secrets.

## Architecture Overview

```text
.github/
  workflows/
    ci.yml                  required gates: types, lint, test, blueprint, catalog-drift, mutation-affected
    preview-deploy.yml      per-PR: provisions preview stack + Doppler config, deploys, posts URL
    preview-destroy.yml     on PR close: destroys stack + Doppler config
    release.yml             tag-based release, SBOM + provenance
    security-scan.yml       gitleaks, osv-scanner, semgrep
    renovate.yml            scheduled dependency PR fan-out
  actions/
    setup-monorepo/         composite: corepack + pnpm install + cache key
```

## Fact-Checked Findings

| ID  | Severity | Claim                                            | Reality                                                                                                       | Fix                                               |
| --- | -------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| F1  | HIGH     | Workflow already gates everything needed         | No. Current `ci.yml` is minimal.                                                                              | Rewrite with the gate matrix in Task 2.1.         |
| F2  | HIGH     | GitHub Actions OIDC can auth to Doppler directly | Yes via short-lived service tokens exchanged from the OIDC JWT.                                               | Use it; no long-lived `DOPPLER_TOKEN` in Actions. |
| F3  | MEDIUM   | `actions/cache` is enough for pnpm               | Works, but cache thrash on lockfile bumps is real. Use pnpm's own store path + `hashFiles('pnpm-lock.yaml')`. | Composite action handles it.                      |

## Evidence Base

- `./.github/workflows/ci.yml` (current state).
- Deleted: `pr-feedback.yml`, `test-feedback.yml` (per git status — replaced by the new model).

## Task Pool

### Phase 1: Reusable setup action [Complexity: S]

#### [ci] Task 1.1: Composite setup action

**Status:** pending **Depends:** None

**Files:**

- Create: `.github/actions/setup-monorepo/action.yml`

**Acceptance:**

- [ ] Action installs corepack-pinned pnpm, runs `pnpm install --frozen-lockfile`, and caches the pnpm store.

### Phase 2: Required gates [Complexity: M]

#### [ci] Task 2.1: Rewrite `ci.yml` with gate matrix

**Status:** pending **Depends:** Task 1.1

**Files:**

- Modify: `.github/workflows/ci.yml`

**Acceptance:**

- [ ] Jobs: `setup`, `lint`, `check-types`, `test`, `mutation-affected`, `blueprint-validate`, `catalog-drift`, `security-scan`.
- [ ] All jobs fan out from a shared `setup` cache.
- [ ] Branch protection on `main` lists these as required.

### Phase 3: Preview lifecycle [Complexity: M]

#### [ci] Task 3.1: PR preview + destroy workflows

**Status:** pending **Depends:** Task 2.1 **Blocked:** cloudflare-pulumi-infra + doppler-secrets.

**Files:**

- Create: `.github/workflows/preview-deploy.yml`
- Create: `.github/workflows/preview-destroy.yml`

**Acceptance:**

- [ ] PR open → preview URL posted as a bot comment.
- [ ] PR close/merge → stack + Doppler config destroyed.

### Phase 4: Security + supply chain [Complexity: M]

#### [sec] Task 4.1: Add gitleaks + osv-scanner + semgrep + SBOM

**Status:** pending **Depends:** Task 2.1

**Files:**

- Create: `.github/workflows/security-scan.yml`
- Create: `.github/workflows/release.yml`

**Acceptance:**

- [ ] Security scan runs on every PR and on `main` nightly.
- [ ] Release workflow produces a signed SBOM + provenance attestation.

## Verification Gates

| Gate              | Command                                                                                      | Success                 |
| ----------------- | -------------------------------------------------------------------------------------------- | ----------------------- |
| Local CI sim      | `act -j test` (optional)                                                                     | Passes locally          |
| Branch protection | `gh api repos/:owner/:repo/branches/main --jq '.protection.required_status_checks.contexts'` | Returns non-empty array |

## Cross-Plan References

| Type       | Blueprint                                                                                             | Relationship               |
| ---------- | ----------------------------------------------------------------------------------------------------- | -------------------------- |
| Upstream   | `pnpm-catalogs-adoption`, `stryker-mutation-guardrails`, `doppler-secrets`, `commit-hooks-guardrails` | Registers their gates      |
| Downstream | `cloudflare-pulumi-infra`                                                                             | Provides preview lifecycle |

## Non-goals

- Self-hosted runners.
- Artifact caching to a third-party cache (Nx Cloud, Turborepo Remote Cache).

## Risks

| Risk                                          | Impact | Mitigation                                |
| --------------------------------------------- | ------ | ----------------------------------------- |
| OIDC misconfiguration leaks cross-repo access | High   | Narrow audience claim; review in Task 4.1 |
| Preview deploys rack up Cloudflare spend      | Medium | Auto-destroy on close + concurrency guard |
| Slow mutation step blocks PRs                 | Medium | Affected-only, ~5 min P95 target          |

## Technology Choices

| Component | Technology                         | Why                             |
| --------- | ---------------------------------- | ------------------------------- |
| Runner    | GitHub Actions hosted Ubuntu       | Standard                        |
| pnpm      | corepack + catalog-pinned version  | Reproducible installs           |
| Secrets   | OIDC → Doppler → Pulumi/Cloudflare | No long-lived tokens in Actions |
| Scans     | gitleaks, osv-scanner, semgrep     | Secret, vuln, and semantic SAST |

## Refinement Summary (2026-04-22 pass)

Findings:

- Four upstream dependencies listed; all real slugs under `blueprints/planned/`.
- Phase 3 (preview deploys) hard-blocks on both `cloudflare-pulumi-infra` AND `doppler-secrets`. Phase 4 (security scans) is independent and can ship before Phase 3.
- Acceptance criterion "branch protection on `main` lists these as required" is not a shell-check — it's a GitHub settings assertion. Clarified as `gh api repos/<owner>/<repo>/branches/main/protection` verification.
- The current `.github/workflows/pr-feedback.yml` + `.github/workflows/test-feedback.yml` are already deleted per git status; CI replacement is open ground.

Fixes applied:

- Phase 4 marked "unblocked" (can ship independently).
- Added `gh api` verification for branch-protection acceptance.

**Blueprint compliant: Yes.** Phases 1, 2, 4 executable now; Phase 3 blocked.
