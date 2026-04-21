---
type: blueprint
status: planned
complexity: L
created: "2026-04-21"
last_updated: "2026-04-22"
progress: "0% (drafted)"
depends_on:
  - doppler-secrets
  - workers-hono-port
tags:
  - infra
  - cloudflare
  - pulumi
  - workers
---

# Cloudflare infrastructure managed by Pulumi

**Goal:** Introduce an `infra/` workspace that provisions Cloudflare
account-level resources (Workers, DNS, Hyperdrive, Zero Trust) via Pulumi
while leaving per-Worker code + bindings under `wrangler.toml`.

## Planning Summary

- **Why two tools:** Pulumi manages stateful, account-level resources (DNS records, Zero Trust tokens, Hyperdrive bindings, Neon projects). `wrangler.toml` remains the source of truth for per-Worker code deploys. Splitting responsibilities keeps code deploys fast while keeping infra changes auditable.
- **Why Pulumi over Terraform:** TypeScript stacks align with the rest of the monorepo, live under pnpm workspaces, and can share types with `packages/*`.
- **Reference:** `[reference repo]` uses this exact split.

## Architecture Overview

```text
infra/
  Pulumi.yaml                     # project metadata (runtime: nodejs, tsx)
  Pulumi.<stack>.yaml             # per-stack config (dev-<user>, preview, preview-pr-*, prd)
  package.json                    # @pulumi/cloudflare, @pulumi/pulumi, @pulumiverse/doppler, @pulumi/neon
  src/
    resources/
      main.ts                     # stack entrypoint
      exports-workers.ts          # Worker routes + custom domains
      exports-dns.ts              # DNS records
      exports-storage.ts          # R2, D1, KV
      exports-database.ts         # Neon project + Hyperdrive binding
      observability.ts            # Logpush, analytics
      config.ts                   # stack-local config resolver
    deploy/
      deploy.ts                   # wrangler wrapper for code deploys
      wrangler-config.ts          # generates wrangler.toml from infra outputs
      preview-urls.ts
      list-stale.ts
  tsconfig.json
  vitest.config.ts

apps/workers/*/wrangler.toml      # per-Worker code + bindings (generated/checked)
```

## Fact-Checked Findings

| ID  | Severity | Claim                                          | Reality                                                                                                                                  | Fix                                                           |
| --- | -------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| F1  | HIGH     | Pulumi can manage everything Cloudflare offers | Mostly yes via `@pulumi/cloudflare ^6.x`, but per-Worker routes still change often enough that wrangler-managed code deploys are faster. | Keep wrangler for Worker code; Pulumi owns account resources. |
| F2  | HIGH     | Pulumi stacks can be anonymous per-PR          | Yes — reference repo uses `preview-pr-<n>` stacks created by CI.                                                                         | Mirror the naming + lifecycle.                                |
| F3  | MEDIUM   | Secrets live inside Pulumi state               | No — secrets stay in Doppler; Pulumi reads them via the `@pulumiverse/doppler` provider at plan time.                                    | Doppler blueprint must land first.                            |

## Evidence Base

- `[reference repo]` (`runtime: nodejs`, `nodeargs: --import tsx`, `packages.neon: terraform-provider kislerdm/neon 1.0.2`).
- `[reference repo]` (dependency list).
- `[reference repo]` (Pulumi vs. wrangler split, Canonical Preview Naming, Doppler config inheritance).

## Task Pool

### Phase 1: Scaffold [Complexity: M]

#### [infra] Task 1.1: Create `infra/` workspace

**Status:** todo **Depends:** None

**Files:**

- Create: `infra/package.json`
- Create: `infra/tsconfig.json`
- Create: `infra/Pulumi.yaml`
- Create: `infra/src/resources/main.ts`
- Create: `infra/src/resources/config.ts`
- Create: `infra/vitest.config.ts`
- Modify: `pnpm-workspace.yaml` (add `- infra`)

**Acceptance:**

- [ ] `pnpm --filter @repo/infra exec pulumi preview --stack dev-local` runs without unresolved references.

### Phase 2: Account resources [Complexity: L]

#### [infra] Task 2.1: Provision DNS + Workers routing

**Status:** todo **Depends:** Task 1.1

**Files:**

- Create: `infra/src/resources/exports-dns.ts`
- Create: `infra/src/resources/exports-workers.ts`

**Acceptance:**

- [ ] Preview stack produces the expected DNS + route records.

#### [infra] Task 2.2: Provision Hyperdrive + Neon + R2 + KV

**Status:** todo **Depends:** Task 1.1

**Files:**

- Create: `infra/src/resources/exports-database.ts`
- Create: `infra/src/resources/exports-storage.ts`

**Acceptance:**

- [ ] Hyperdrive binding declared for each environment.
- [ ] Neon project + branch provisioned per stack.

### Phase 3: Deploy wiring [Complexity: M]

#### [infra] Task 3.1: Generate wrangler.toml from Pulumi outputs

**Status:** todo **Depends:** Task 2.1, Task 2.2

**Files:**

- Create: `infra/src/deploy/wrangler-config.ts`
- Create: `infra/src/deploy/deploy.ts`
- Create: `infra/src/deploy/preview-urls.ts`

**Acceptance:**

- [ ] Generated `wrangler.toml` for each Worker matches the Pulumi outputs.
- [ ] `pnpm --filter @repo/infra deploy --stack preview-pr-123` deploys a preview cleanly.

## Verification Gates

| Gate            | Command                                                   | Success          |
| --------------- | --------------------------------------------------------- | ---------------- |
| Pulumi preview  | `pulumi preview --stack dev-local`                        | Clean plan       |
| Wrangler parity | `pnpm --filter @repo/infra test -- deploy-parity`         | All suites green |
| Preview deploy  | `pnpm --filter @repo/infra deploy --stack preview-pr-<n>` | Exit 0           |

## Cross-Plan References

| Type       | Blueprint         | Relationship                                    |
| ---------- | ----------------- | ----------------------------------------------- |
| Upstream   | `doppler-secrets` | Pulumi reads secrets via `@pulumiverse/doppler` |
| Downstream | `ci-hardening`    | CI provisions `preview-pr-<n>` stacks           |

## Non-goals

- Migrating existing Railway/Render-style deploys.
- Pulumi-managed Worker source code (wrangler owns that).

## Risks

| Risk                                           | Impact | Mitigation                                                              |
| ---------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| Stack state drift from manual CF console edits | High   | Enable Pulumi drift detection on a schedule                             |
| `@pulumi/neon` community provider stall        | Medium | Pinned to `kislerdm/neon 1.0.2`; fall back to direct Neon API if needed |
| Cost blowout from per-PR stacks                | Medium | Auto-destroy on PR close (CI hook)                                      |

## Technology Choices

| Component  | Technology                          | Version | Why                                        |
| ---------- | ----------------------------------- | ------- | ------------------------------------------ |
| IaC        | `@pulumi/pulumi`                    | ^3.220  | TypeScript stacks live inside the monorepo |
| Cloudflare | `@pulumi/cloudflare`                | ^6.1    | Official provider                          |
| DB         | `@pulumi/neon` (terraform-provider) | 1.0.2   | Neon branch lifecycle                      |
| Secrets    | `@pulumiverse/doppler`              | ^0.9    | Pull secrets at plan time                  |

## Refinement Summary (2026-04-22 pass — updated)

**Status: COMPLIANT — execution-ready after `workers-hono-port` lands.**

Findings:

- **Runtime target confirmed: Cloudflare Workers.** `workers-hono-port` blueprint is the preceding migration that makes the app Worker-compatible. This blueprint is gated on it.
- Phase 1 (scaffold `infra/`) and Phase 2.2 (Neon/R2/KV) are viable immediately — no Workers runtime dependency.
- Phase 2.1 (Worker routes + DNS) and Phase 3 (wrangler-config generation) depend on `workers-hono-port` completing first.
- `depends_on` updated to include `workers-hono-port`.
- Cross-plan reference to `doppler-secrets` is honest and unchanged.

Fixes applied:

- Resolved runtime-target Q — Workers confirmed.
- Added `workers-hono-port` to `depends_on`.
- Phased execution: Phases 1 + 2.2 can start now; Phases 2.1 + 3 gate on workers-hono-port merge.

**Blueprint compliant: Yes.**
