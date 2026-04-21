---
type: blueprint
status: planned
complexity: M
created: "2026-04-21"
last_updated: "2026-04-22"
progress: "0% (drafted)"
depends_on: []
tags:
  - secrets
  - doppler
  - infra
  - security
---

# Doppler secrets and config inheritance

**Goal:** Adopt Doppler as the single source of truth for secrets across
local dev, per-PR previews, main-branch CI, and production, using the same
config-inheritance model proven in the webpresso repo.

## Planning Summary

- **Why Doppler:** Replaces `.env` files with a central service that supports per-environment branches, inheritance, and programmatic access (Pulumi, wrangler, CI).
- **Model:** one root preview config shared across PRs, branch configs that override only what differs (primarily database URLs), per-service tokens for non-human access.
- **Current state (2026-04):** `dotenv` has been stripped from every workspace; `apps/*/src/config/index.ts` now reads `process.env` directly. `.env.example` removed. `turbo.json` no longer references `.env*`. The no-dotenv rule lives at `.agent/rules/no-dotenv.md`. This blueprint now only needs to land the Doppler wiring itself — the removal of the alternative is done.

## Architecture Overview

```text
Doppler project: node-pubsub
  configs:
    dev                     local development
    preview                 ROOT preview config (shared secrets only; no DATABASE_URL)
      preview_main          inherits; overrides DATABASE_URL for main-branch CI
      preview_pr_<n>        inherits; created per PR, cleaned up on close
    prd                     production

  shared secrets in `preview`:
    CLOUDFLARE_API_TOKEN
    CF_ACCESS_CLIENT_ID
    CF_ACCESS_CLIENT_SECRET
    BETTER_AUTH_SECRET
    DOPPLER_TOKEN            (service token used by Pulumi provider)

  branch-specific overrides:
    DATABASE_URL            per Neon branch
    HYPERDRIVE_URL          per Worker
```

## Fact-Checked Findings

| ID  | Severity | Claim                                            | Reality                                                                           | Fix                                                                  |
| --- | -------- | ------------------------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| F1  | HIGH     | Doppler inheritance collapses secret duplication | Verified in webpresso; root-of-truth in `preview` avoids fan-out.                 | Mirror the `preview` → `preview_<branch>` layout.                    |
| F2  | HIGH     | Pulumi reads Doppler via `@pulumiverse/doppler`  | Yes, version `^0.9`; requires a service token in the executing env.               | Provision the service token in CI via OIDC → Doppler token exchange. |
| F3  | MEDIUM   | Per-PR Doppler configs can be auto-created       | Yes via the Doppler API; lifecycle script hooks `pull_request` open/close events. | Task 3.1 owns the lifecycle script.                                  |

## Evidence Base

- `~/repos/webpresso/infra/README.md` — section "Secrets Management > Doppler Config Architecture".
- Doppler provider: `@pulumiverse/doppler ^0.9`.

## Task Pool

### Phase 1: Bootstrap [Complexity: S]

#### [ops] Task 1.1: Create Doppler project + configs

**Status:** todo **Depends:** None

**Files:**

- Create: `docs/secrets/doppler.md`

**Acceptance:**

- [ ] Project `node-pubsub` exists with `dev`, `preview`, `preview_main`, `prd` configs.
- [ ] Root `preview` contains only shared secrets (no `DATABASE_URL`).

### Phase 2: Local wiring [Complexity: S]

#### [dx] Task 2.1: Integrate `doppler run` into pnpm dev commands

**Status:** todo **Depends:** Task 1.1

**Files:**

- Modify: `package.json`
- Create: `scripts/with-doppler.ts`

**Acceptance:**

- [ ] `pnpm dev` shells through `doppler run --config dev --` automatically.
- [ ] Missing-secret errors fail loud with an actionable message.

### Phase 3: PR lifecycle [Complexity: M]

#### [ops] Task 3.1: Auto-create + cleanup `preview_pr_<n>` configs

**Status:** todo **Depends:** Task 1.1 **Blocked:** cloudflare-pulumi-infra blueprint must land first (stack names drive config names).

**Files:**

- Create: `.github/workflows/doppler-pr-lifecycle.yml`
- Create: `scripts/doppler-pr.ts`

**Acceptance:**

- [ ] PR open → matching `preview_pr_<n>` config created, inheriting from `preview`.
- [ ] PR close → config deleted; stack destroyed first.

## Verification Gates

| Gate          | Command                            | Success                        |
| ------------- | ---------------------------------- | ------------------------------ |
| Local boot    | `pnpm dev`                         | All required secrets present   |
| CI boot       | `DOPPLER_TOKEN=... pnpm qa`        | Green                          |
| Provider auth | `pulumi preview` against any stack | Secrets resolve without prompt |

## Cross-Plan References

| Type       | Blueprint                 | Relationship                        |
| ---------- | ------------------------- | ----------------------------------- |
| Downstream | `cloudflare-pulumi-infra` | Reads secrets at plan time          |
| Downstream | `ci-hardening`            | OIDC → Doppler token exchange in CI |

## Non-goals

- Migrating production secrets from an existing vault in this blueprint.
- Per-developer Doppler onboarding automation.

## Risks

| Risk                                      | Impact   | Mitigation                                       |
| ----------------------------------------- | -------- | ------------------------------------------------ |
| Leaked service token                      | Critical | Rotate via Doppler; CI uses short-lived exchange |
| Stale `preview_pr_<n>` configs accumulate | Low      | Lifecycle script reaps on PR close               |
| Local dev fails without Doppler access    | Medium   | Scripts emit a clear "request access" message    |

## Technology Choices

| Component     | Technology                  | Why                                            |
| ------------- | --------------------------- | ---------------------------------------------- |
| Secrets store | Doppler                     | Config inheritance, branch configs, stable CLI |
| Provider      | `@pulumiverse/doppler ^0.9` | Pulumi-native reads                            |
| CLI           | `doppler`                   | `doppler run --config <name> -- <cmd>`         |

## Refinement Summary (2026-04-22 pass)

Findings:

- **Alternative-removal done:** `dotenv` stripped from every workspace + source + `turbo.json`; `.env.example` deleted; `.agent/rules/no-dotenv.md` rule live. Tasks here now _only_ need to wire Doppler; they do not need to _migrate off_ anything.
- **External-dependency:** Task 1.1 requires a Doppler project to exist for the user's account. Not reproducible in CI without the project. Marked as `[ops]` — documented as such.
- Task 3.1 depends on `cloudflare-pulumi-infra` (stack names drive config names). That blueprint is pending Q&A on runtime target, so this task stays blocked until that lands.
- Acceptance bullets verifiable via `doppler configs get dev` + failed-boot assertion.

Fixes applied:

- Restated that dotenv removal is complete.
- Clarified Task 3.1 is blocked (not just "depends on").

**Blueprint compliant: Yes.** Phase 1 + 2 executable; Phase 3 blocked on CF-infra Q&A.
