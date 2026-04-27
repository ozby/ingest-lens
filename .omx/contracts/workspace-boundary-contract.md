# Workspace boundary contract

## Workspace classifications

### Product applications

- `apps/client` — browser UI and route-level user workflows.
- `apps/workers` — Cloudflare Worker HTTP/API runtime, auth, queue/topic flows, and intake endpoints.
- `apps/e2e` — repo-owned end-to-end journey runner and live HTTP workflow surface.

### Supporting services

- `apps/api-server` — Node service surface retained for local/service workflows outside the Worker runtime.
- `apps/notification-server` — notification-focused Node service surface.

### Shared packages

- `packages/db` — shared database helpers and contracts.
- `packages/logger` — shared logging utilities.
- `packages/neon` — ephemeral Neon branch lifecycle helpers for E2E and CI.
- `packages/test-utils` — shared test support and regression checks for portable surfaces.
- `packages/types` — shared type contracts.
- `packages/ui` — shared UI primitives and browser-safe components.
- `packages/config-typescript` — shared TS config surface.

### Infrastructure and planning

- `infra` — Pulumi infrastructure code and deployment/test helpers.
- `blueprints` — executable planning artifacts tracked by lifecycle state.
- `.agent` / `.codex` — agent workflow and skill surfaces.
- `.omx/contracts` — durable workspace and planning contracts.
- `.omx/plans` — durable PRD and test-spec artifacts.
- `.omx/state/lifecycle` — durable lifecycle state for tracked plans.

## Boundary rules

1. `apps/client` consumes shared browser-safe code from `packages/ui`, `packages/types`, and public client-facing service layers; it must not import Worker-only runtime code from `apps/workers`.
2. `apps/workers` owns HTTP/API behavior, queue/topic delivery, auth, and intake normalization; browser-only code stays out of the Worker runtime.
3. `apps/e2e` is the canonical repo-owned E2E orchestration surface and may invoke app/package scripts, but product behavior remains implemented in the owning workspace.
4. Shared packages should stay framework-appropriate: browser-safe code in `packages/ui`, runtime-agnostic helpers in `packages/logger` / `packages/types`, and E2E-specific infrastructure in `packages/neon` / `packages/test-utils`.
5. Changes that move ownership between applications, shared packages, or infrastructure/planning surfaces must update this contract in the same change.
