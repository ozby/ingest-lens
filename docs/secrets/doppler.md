---
type: runbook
last_updated: "2026-05-23"
---

# Doppler Secret Management Runbook

This runbook covers the complete setup for the `ingest-lens` Doppler project.
All commands require the [Doppler CLI](https://docs.doppler.com/docs/install-cli) and a Doppler account with access to both projects.

> **Current repo contract (authoritative):**
>
> - configure manager/workspace through `wp config secrets ...`
> - execute secret-scoped commands through `with-secrets -- <cmd>`
> - never persist `.env*` / `.dev.vars*` files
>
> Historical completed blueprints may still mention older provider-run examples;
> treat this runbook + repo scripts as the current source of truth.

> **Two Doppler projects are used:**
>
> - `ingest-lens` — application secrets (MongoDB URI, JWT, ports, etc.)
> - `ozby-shell` — infrastructure credentials (`CLOUDFLARE_API_TOKEN`, `PULUMI_ACCESS_TOKEN`, Neon DB connection strings). These are kept in a separate project because they are shared across multiple repos and scoped to an operator account rather than a single application.

---

## 1. Create the `ingest-lens` Project in Doppler

1. Log in to [dashboard.doppler.com](https://dashboard.doppler.com).
2. Select your workspace (or create one).
3. Click **+ New Project** → name it `ingest-lens`.
4. Doppler auto-creates three default configs: `dev`, `stg`, `prd`. Delete `stg` — we use `preview` instead.

---

## 2. Config Hierarchy

```
dev              ← local development (overrides only)
  └── preview    ← shared preview root (branch secrets)
        ├── preview_main      ← staging / main-branch preview
        └── preview_pr_<n>    ← per-PR ephemeral (Phase 3, blocked on CF infra)
prd              ← production
```

**How inheritance works:** child configs inherit all secrets from their parent and can override individual values. Set shared secrets at the highest applicable level to avoid duplication.

To create the `preview` root config and its children in the Doppler dashboard:

1. In the `ingest-lens` project, click **+ Add Config**.
2. Name it `preview` (type: **Branch**).
3. Add `preview_main` as a branch config under `preview`.
4. `preview_pr_<n>` configs are created dynamically in Phase 3 (not yet implemented).

---

## 3. Required Secrets per Config

### `ingest-lens` project

| Secret              | `dev`                           | `preview` (root / inherited) | `prd`                        |
| ------------------- | ------------------------------- | ---------------------------- | ---------------------------- |
| `MONGODB_URI`       | `mongodb://localhost:27017/dev` | connection string per env    | Atlas production URI         |
| `JWT_SECRET`        | any local secret string         | set at `preview` root        | strong random 64-char string |
| `NODE_ENV`          | `development`                   | `development`                | `production`                 |
| `API_PORT`          | `3001`                          | `3001`                       | `3001`                       |
| `NOTIFICATION_PORT` | `3002`                          | `3002`                       | `3002`                       |

### `ozby-shell` project (infrastructure credentials)

| Secret                  | `dev`                                         | `production`                                  |
| ----------------------- | --------------------------------------------- | --------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | scoped API token (deploy)                     | same or production token                      |
| `CLOUDFLARE_ACCOUNT_ID` | CF account ID                                 | same                                          |
| `CLOUDFLARE_ZONE_ID`    | CF zone for the domain                        | same                                          |
| `PULUMI_ACCESS_TOKEN`   | personal access token                         | CI service token                              |
| `DATABASE_URL`          | Neon dev branch URL                           | Neon production branch URL                    |
| `NEON_API_KEY`          | Neon API key for E2E / cleanup workflow       | Neon API key for E2E / cleanup workflow       |
| `NEON_PROJECT_ID`       | Neon project id for E2E / cleanup workflow    | Neon project id for E2E / cleanup workflow    |
| `NEON_PARENT_BRANCH_ID` | Neon parent branch for E2E / cleanup workflow | Neon parent branch for E2E / cleanup workflow |

The `infra/` workspace scripts resolve secrets through the repo-selected secret manager:

```bash
# Local preview
pnpm --filter @repo/infra preview
# expands to: with-secrets -- pulumi preview

# Deploy to production
pnpm --filter @repo/infra up:prd
# expands to: with-secrets -- pulumi up --yes
```

**Rules:**

- `MONGODB_URI` must be set in every config individually — it is never shared.
- `JWT_SECRET` should be set once at the `preview` root and inherited by child configs; override in `prd` with a separate value.
- `NODE_ENV`, `API_PORT`, and `NOTIFICATION_PORT` can be set at `preview` root and overridden per-child as needed.
- All Cloudflare and Pulumi credentials live exclusively in `ozby-shell` — never in `ingest-lens`.

---

## 4. Running Locally

### 4a. Install the Doppler CLI

```bash
brew install dopplerhq/cli/doppler
doppler --version
```

### 4b. Authenticate

```bash
doppler login
```

### 4c. Configure the repo secret manager

Run once from the repo root:

```bash
wp config secrets setup
```

### 4d. Start the dev server

```bash
with-secrets -- vp run dev
# expands to: with-secrets -- vp run dev
```

To skip Doppler injection for local/offline debugging (for example, when the
required values are already present in your shell environment):

```bash
vp run dev:offline
```

---

## 5. CI Service Token Setup

**Never use a personal token in CI.** Use a service token scoped to the specific config.

1. In the Doppler dashboard, go to `ingest-lens` → **Access** → **Service Tokens**.
2. Click **+ Generate** → select the config (e.g., `preview_main`) → set an expiry.
3. Copy the token (shown once).
4. Add it as a secret in your CI provider (GitHub Actions: `Settings → Secrets → DOPPLER_SERVICE_TOKEN`).

In CI, inject secrets through the same public contract:

```yaml
- name: Inject secrets
  run: with-secrets -- vp run test
  env:
    SECRET_MANAGER_TOKEN: ${{ secrets.DOPPLER_SERVICE_TOKEN }}
```

Or use the official Doppler secrets fetch action to hydrate subsequent steps:

```yaml
- uses: dopplerhq/secrets-fetch-action@v2.0.0
  with:
    doppler-token: ${{ secrets.DOPPLER_SERVICE_TOKEN }}
    inject-env-vars: true
```

The scheduled Neon cleanup workflow prefers this path. When
`SECRET_MANAGER_TOKEN` is present, it hydrates Neon control-plane secrets from
the selected manager without hardcoding provider commands into the workflow
YAML.

---

## 6. Quick Reference

| Task                       | Command                      |
| -------------------------- | ---------------------------- |
| Configure local secrets    | `wp config secrets setup`    |
| Run dev with secrets       | `with-secrets -- vp run dev` |
| Run dev without secrets    | `vp run dev:offline`         |
| Run local CI workflow      | `vp run act:ci`              |
| Run local E2E workflow     | `vp run act:e2e`             |
| Run local cleanup workflow | `vp run act:cleanup`         |
| Show selected config       | `wp config secrets show`     |
| Check secret-manager auth  | `wp config secrets status`   |

The local workflow scripts (`vp run act:ci`, `vp run act:e2e`, `vp run act:cleanup`,
and `vp run act:list`) expand through `scripts/act-with-webpresso.ts`, which:

- infers a least-privilege secret profile from the target workflow/job,
- only resolves managed secrets when that profile actually needs them,
- filters injected values to the profile allowlist,
- never forwards `DOPPLER_SERVICE_TOKEN` or `DOPPLER_TOKEN` into the `act` container,
- can opt into `GITHUB_PAT` → `GITHUB_TOKEN` mapping with `ACT_MAP_GITHUB_PAT=1`
  for the `github-api` profile,
- mounts absolute local `file:/...` package sources into the act job container,
- and injects the result into `act` via a temporary `--secret-file`.

The GitHub workflows themselves now use the Node 24-native action majors
(`actions/checkout@v6`, `actions/setup-node@v6`) and activate pnpm with
Corepack (`corepack prepare pnpm@10.33.0 --activate`) instead of
`pnpm/action-setup`. This removes the remaining Node 20 deprecation warning
path while keeping local `act` runs and hosted runners aligned.

Current `act` profiles:

| Profile              | Used by                                            | Allowed injected secrets                                   |
| -------------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| `none`               | `ci.yml`, `testing-e2e.yml`, `testing-e2e-act.yml` | none                                                       |
| `neon-control-plane` | `cleanup-stale-neon-e2e-branches.yml`              | `NEON_API_KEY`, `NEON_PROJECT_ID`, `NEON_PARENT_BRANCH_ID` |

Override inference explicitly when needed:

```bash
bun ./scripts/act-with-webpresso.ts \
  --secret-profile neon-control-plane \
  workflow_dispatch \
  -W .github/workflows/cleanup-stale-neon-e2e-branches.yml \
  -j cleanup
```

---

## 7. Phase 3 (Blocked)

Per-PR Doppler config lifecycle (`preview_pr_<n>`) requires Cloudflare infrastructure provisioned via `cloudflare-pulumi-infra`. See `blueprints/completed/doppler-secrets/_overview.md`. The infra workspace is complete; per-PR config creation requires wiring in CI once the Worker is deployed.
