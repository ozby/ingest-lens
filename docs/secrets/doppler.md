# Doppler Secret Management Runbook

This runbook covers the complete setup for the `node-pubsub` Doppler project.
All commands require the [Doppler CLI](https://docs.doppler.com/docs/install-cli) and a Doppler account with access to the project.

---

## 1. Create the `node-pubsub` Project in Doppler

1. Log in to [dashboard.doppler.com](https://dashboard.doppler.com).
2. Select your workspace (or create one).
3. Click **+ New Project** → name it `node-pubsub`.
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

1. In the `node-pubsub` project, click **+ Add Config**.
2. Name it `preview` (type: **Branch**).
3. Add `preview_main` as a branch config under `preview`.
4. `preview_pr_<n>` configs are created dynamically in Phase 3 (not yet implemented).

---

## 3. Required Secrets per Config

| Secret              | `dev`                           | `preview` (root / inherited) | `prd`                        |
| ------------------- | ------------------------------- | ---------------------------- | ---------------------------- |
| `MONGODB_URI`       | `mongodb://localhost:27017/dev` | connection string per env    | Atlas production URI         |
| `JWT_SECRET`        | any local secret string         | set at `preview` root        | strong random 64-char string |
| `NODE_ENV`          | `development`                   | `development`                | `production`                 |
| `API_PORT`          | `3001`                          | `3001`                       | `3001`                       |
| `NOTIFICATION_PORT` | `3002`                          | `3002`                       | `3002`                       |

**Rules:**

- `MONGODB_URI` must be set in every config individually — it is never shared.
- `JWT_SECRET` should be set once at the `preview` root and inherited by child configs; override in `prd` with a separate value.
- `NODE_ENV`, `API_PORT`, and `NOTIFICATION_PORT` can be set at `preview` root and overridden per-child as needed.

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

### 4c. Link the local directory to the project

Run once from the repo root (saves `.doppler` config to the directory):

```bash
doppler setup
# Select workspace → node-pubsub → dev
```

This writes a `.doppler` directory entry (already in `.gitignore`). You can also pass flags for non-interactive setup:

```bash
doppler setup --project node-pubsub --config dev
```

### 4d. Start the dev server

```bash
pnpm dev
# expands to: doppler run --config dev -- turbo run dev
```

To skip Doppler injection (e.g., CI where secrets are pre-loaded into the environment):

```bash
pnpm dev:no-doppler
```

---

## 5. CI Service Token Setup

**Never use a personal token in CI.** Use a service token scoped to the specific config.

1. In the Doppler dashboard, go to `node-pubsub` → **Access** → **Service Tokens**.
2. Click **+ Generate** → select the config (e.g., `preview_main`) → set an expiry.
3. Copy the token (shown once).
4. Add it as a secret in your CI provider (GitHub Actions: `Settings → Secrets → DOPPLER_TOKEN`).

In CI, inject secrets via the Doppler CLI:

```yaml
- name: Inject secrets
  run: doppler run --token "$DOPPLER_TOKEN" --config preview_main -- pnpm test
  env:
    DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN }}
```

Or use the official [Doppler GitHub Action](https://github.com/DopplerHQ/doppler-action):

```yaml
- uses: DopplerHQ/doppler-action@v3
  with:
    token: ${{ secrets.DOPPLER_TOKEN }}
    inject-env: true
```

---

## 6. Quick Reference

| Task                       | Command                                           |
| -------------------------- | ------------------------------------------------- |
| Link local directory       | `doppler setup`                                   |
| Run dev with secrets       | `pnpm dev`                                        |
| Run dev without Doppler    | `pnpm dev:no-doppler`                             |
| Print all secrets (dev)    | `doppler secrets --config dev`                    |
| Set a secret               | `doppler secrets set KEY=value --config dev`      |
| Download secrets as `.env` | `doppler secrets download --no-file --format env` |

---

## 7. Phase 3 (Blocked)

Per-PR Doppler config lifecycle (`preview_pr_<n>`) requires Cloudflare infrastructure provisioned via `cloudflare-pulumi-infra`. This is tracked in `blueprints/planned/doppler-secrets/_overview.md` and not yet implemented.
