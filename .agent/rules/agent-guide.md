---
paths:
  - "schema/**/*.yaml"
  - "**/*.ts"
  - "**/*.tsx"
  - "justfile"
---

# Agent Rules

> Generic agent rules for a monorepo using agentkit. Cross-platform rules live
> in `AGENTS.md` (auto-loaded).

## Entity / Schema System (YAML SSOT)

If your project uses a YAML-declared entity / schema system:

- **Source of truth**: `schema/*.yaml` (or `entities/*.yaml`)
- **Entity name = filename** (e.g., `agent_tasks.yaml` → `entity: agent_tasks`)
- **DB table preserved** via an explicit `database.table` field
- **Leading `_` = external** (skipped in compilation)
- **Never edit compiled metadata** directly

## Before Modifying Entities

- Validate with your repo's schema-check recipe (runs static + runtime checks)
- Dry-run compile before apply

## Field Types (Typical)

`text`, `text[]`, `integer`, `bigint`, `boolean`, `timestamp`, `date`, `jsonb`,
`numeric`, `uuid`

## Reference Format

```yaml
references:
  table: projects
  column: id
  onDelete: cascade
```

## Naming Convention

Entity / table prefixes carve out domains. Typical examples:

| Prefix           | Domain                                          |
| ---------------- | ----------------------------------------------- |
| `agent_*`        | AI Agent personas, scheduling, suggestions      |
| `ai_*`           | AI Agent sessions and usage tracking            |
| `billing_*`      | Billing, invoices, and ledger                   |
| `blueprint_*`    | Blueprint definitions and execution             |
| `deployment_*`   | Deployment management                           |
| `meta_*`         | Platform metadata (entities, fields, roles)     |
| `notification_*` | Notification system and preferences             |
| `project_*`      | Project-level resources and configuration       |
| `task_*`         | Task tracking, labels, and analysis             |
| `user_*`         | User profiles, activity, and preferences        |
| `workflow_*`     | Workflow definitions, execution, and scheduling |

Adapt the prefix list to your domain; the rule that matters is that the
prefix → domain mapping is stable and checked in.

## Import Aliases (`#`)

**Universal `#` import aliases are configured across the monorepo.**

### Rules

- **Use `#` for all cross-directory imports** within a package.
- **`#` maps to `src/`** for packages, `app/` for pages apps.
- **Keep `./` for same-directory imports** (e.g., `from './types'`).
- **Never use `../` for imports** within `src/` — always use `#`.
- **Never use `../src/` in imports** — this is always wrong; use `#` instead.
- **`vi.mock()` paths must use `#`** — never use relative `../` paths in
  `vi.mock()` calls. Relative mock paths break when vitest projects use
  `extends: false` or when test files are at different directory depths.
  Always match the source code's import style.

### Why `#` Instead of `~/`?

**The Problem**: TypeScript `paths` (`~/`) resolve relative to the tsconfig
doing the typechecking. In monorepos with source exports, when package A
typechecks package B's source, `~/` resolves against package A's tsconfig,
causing `Cannot find module '~/...'` errors.

**The Solution**: Node.js **subpath imports** (`#`) are package-scoped. They
resolve via the **declaring package's** `package.json` `imports` field,
regardless of which package is typechecking.

### Configuration Required

**Every package** using `#` imports MUST have BOTH:

1. **`package.json`** `imports` field (for Node.js runtime + cross-package
   typechecking):

```json
{
  "imports": {
    "#*": "./src/*.ts"
  }
}
```

2. **`tsconfig.json`** `paths` field (for TypeScript within the package):

```json
{
  "compilerOptions": {
    "paths": {
      "#*": ["./src/*"]
    }
  }
}
```

**Both are required.** The `package.json` field enables cross-package
resolution; the `tsconfig.json` paths enable within-package typechecking.

### Examples

```typescript
// ✅ Cross-directory imports with #
import { foo } from "#lib/utils";
import { bar } from "#services/auth";
import { baz } from "#database/schema";

// ✅ Same-directory imports with ./
import { helpers } from "./helpers";
import type { User } from "./types";

// ❌ Wrong - relative parent imports
import { bar } from "../../services/auth";

// ✅ vi.mock with # alias (matches source imports)
vi.mock("#services/auth", () => ({
  /* ... */
}));
vi.mock("#database", () => ({
  /* ... */
}));

// ❌ Wrong - relative vi.mock paths (may not match resolved module ID)
vi.mock("../../services/auth", () => ({
  /* ... */
}));
vi.mock("../src/database", () => ({
  /* ... */
}));
```

### Infrastructure

- `vite-tsconfig-paths` plugin configured in vitest and vite for runtime `#`
  resolution.
- All packages use `paths` with relative values in `tsconfig.json` (no
  `baseUrl` — removed for TS7 / tsgo compatibility).
- All packages export source directly (`exports` pointing to `./src/*.ts`),
  making `#` the only viable solution for cross-package typechecking.

## Isolated Validation for Structural Changes

**Before modifying infrastructure, bundler config, or cross-package resolution
in production packages**, validate the change in the smallest affected
package first.

- **Use a narrow scope**: prefer the smallest package that exercises the
  target behavior.
- **Use it to**: test build-tool upgrades, plugin compatibility, module
  resolution changes, new export conditions, and `#` alias behavior in
  isolation.
- **Why**: production packages have large module graphs and long startup
  times, so isolating the change first keeps debugging cost bounded.

## Repo Restrictions

See [repo-restrictions.md](repo-restrictions.md) for the complete enforcement
guide — how to add new restrictions via linter plugins, hooks, and agent
instructions.

## Deterministic External Boundaries

When code talks to an external boundary — subprocesses, sockets, workers, HTTP
services, WebSocket handshakes, file-system locks, or polling-based readiness
checks — the behavior must be deterministic.

### Rules

- **Every external async boundary must have an explicit deadline or bounded
  polling policy.**
- **Timeout ownership belongs to the caller or config layer**, not hidden
  transport internals.
- **Prefer shared helpers** such as `withDeadline` and `pollUntil` from your
  shared utilities package over ad hoc `Promise.race(...)`,
  `Date.now() + timeoutMs`, or local timeout wrappers.
- **Use fake timers for timeout unit tests** and attach rejection handlers
  before advancing timers.
- **Use real timers only for runtime integration tests** where the goal is to
  prove actual subprocess, socket, or network behavior.

### Anti-patterns

- Inline `Promise.race([work, timeoutPromise])` helpers duplicated per package
- Unbounded `while (...)` polling loops driven by `Date.now()` arithmetic
- Environment-variable-only timeout policy for library code
- Timeout tests that rely on wall-clock sleeps when fake timers would prove
  the same behavior faster and more reliably

## Network Resilience

Retry logic belongs in the **HTTP / data-access layer**, not in React hooks
or components.

- Put retries in the function that makes the network call, not in
  `useCallback` or `useEffect`.
- Stacking retries at multiple layers creates cascading delay budgets and
  uncoordinated retry storms.
- Use `sleep` and `isRetryableError` (or equivalent) from your shared
  utilities — never roll a raw
  `new Promise(resolve => setTimeout(resolve, ms))`.
- Retry only idempotent, retryable error codes (ECONNREFUSED, ETIMEDOUT,
  ECONNRESET). Non-retryable errors (4xx, auth) must break immediately.

## Environment Variables & Secret Injection

Runtime environment variables and secrets are **never** stored in `.dev.vars`,
`.env` files, or any file on disk. They are resolved at runtime by the
repo's secret manager wrapper (e.g. Doppler, 1Password, AWS Secrets Manager).

### Rules

- **Never suggest creating `.dev.vars`** — it is not part of this workflow.
- **Never suggest creating `.env` files** for secrets.
- **Always use the repo's secret-bearing command wrapper** when a command
  needs repo-managed environment injection.
- **Prefer a dedicated recipe over an escape-hatch wrapper** when the workflow
  is repo-owned and repeatable.
- **Do not ask the user to manually export** `DATABASE_URL` or other secret
  env vars for normal repo commands.
- If required env vars are missing at runtime, the fix is: ensure the command
  runs through the secret-bearing wrapper, **not** to create config files.
- Secret manager setup is manager-driven and should go through the repo
  workflow first. Treat the active secret manager as one implementation under
  an abstraction, not a hardcoded repo-wide assumption.
- Do not tell the user to paste secrets onto disk or create local
  `.env` / `.dev.vars` fallbacks.

## File & Path Rules

### Scripts Location

- **Never** create a root-level `/scripts/` folder if the repo has a
  dedicated scripts package (e.g. `apps/scripts/src/`).
- All scripts go in the dedicated scripts package.
- Run with the repo's script-runner recipe.

### Finding Repo Root

- **Never** use `resolve(import.meta.dirname, '../..')` or any hardcoded `..`
  chain to find repo root.
- **Always** use a repo-provided helper like `findProjectRoot()` from a
  shared utility package.
- Packages live at varying depths — hardcoded relative paths break when files
  move.

## Commit messages

Prefer subjects that name area and intent (see `AGENTS.md`); avoid opaque
one-word subjects for platform-wide changes.

## E2E Coverage Contract

When changing or adding a user-facing feature, agents must classify browser
coverage explicitly instead of treating all Playwright tests as
interchangeable.

### Suites

- `apps/e2e/tests/journeys/` (or equivalent): real persisted critical user
  workflows.
- `apps/e2e/tests/smoke/`: route health, accessibility canaries, quarantined
  flows, and non-persistent checks.
- Sibling feature suites (e.g. `admin/`, `notifications/`): domain-specific
  browser coverage that still must follow the same realism rules.

### When a new feature needs a journey test

Add or extend a journey-grade E2E test when the change affects any of these:

- creation, update, delete, or role/permission changes
- multi-step wizards or workflows
- persistence after reload or re-entry
- list-to-detail-to-save flows
- auth, session, consent, analytics, or redirect behavior
- user-visible error recovery on a critical path

### When smoke coverage is enough

Smoke-only coverage is acceptable for:

- route availability
- access control canaries
- accessibility checks without mutation
- temporary quarantine coverage for product paths that are not yet viable as
  real journeys

Smoke coverage must not be counted as equivalent to journey coverage.

### Journey rules

- use real browser login and Playwright `storageState`; do not use cookie or
  session injection
- reach pages through visible UI navigation when that is part of the real path
- mutate state through the UI or real browser-origin requests only
- verify persistence after reload, revisit, or downstream navigation
- fail on visible backend errors instead of treating them as alternate success
- do not use in-test `skip` for required seed data
- do not claim an E2E feature is complete until focused checks and the full
  `journeys` plus `smoke` suites are green through the repo's task runner

### Forbidden shortcuts for browser tests

- synthetic analytics or DB inserts for the behavior under test
- direct-detail URL bypass when a visible list or CTA is the real path
- API or database cleanup standing in for the action being tested
- assertions that only prove a modal opened, a request fired, or a placeholder
  rendered

### Manual verification is not a deliverable

A blueprint task whose acceptance criteria says "manually verify in the
browser", "open the page and confirm", or equivalent is **incomplete**. Human
click-through verification degrades immediately: it is not repeatable, not
regression-safe, and cannot be run in CI.

**Rule**: if the only way to verify a task is to open a browser and look at
the page, write a Playwright E2E test instead. The test becomes the
acceptance evidence.

When you encounter this during blueprint execution:

1. Identify the page, route, or user interaction the manual step describes.
2. Write a `journeys/` or `smoke/` spec that automates that check.
3. Replace the manual acceptance item with a reference to the new spec file.
4. Mark the task done only after the spec is committed.

This also applies retroactively: if a blueprint task already marked `done`
has only manual evidence, raise it as a gap and add the missing spec.

### Coverage audit checklist

Before adding or reviewing browser coverage for a feature, verify these in
order:

- identify the real browser entrypoint from visible shell navigation, header
  CTAs, or in-product links
- confirm whether the surface uses real backend state or only local/mock data
- classify the surface as `journey`, `smoke`, or `not-yet-journeyable`
- if the route is backed by mock data or local-only state, do not fake a
  persisted journey; prefer integration tests and document the product gap
- if the route is read-only and already covered by adjacent journeys, prefer
  smoke or route-health coverage over shallow duplicated journeys

### Verification for shared E2E changes

If you touch shared E2E auth, setup, runtime-state wiring, or other
cross-suite infra, do not stop at a focused spec.

- run the focused spec you changed
- run the full `journeys` suite
- run the full `smoke` suite
- run the relevant typecheck or targeted test command for touched app
  packages

## Test Organization (Colocated Pattern)

**Policy**: All test files use the **colocated pattern** — tests live next to
the source files they test.

### Rules

- **Test files next to source**: `src/auth.ts` + `src/auth.test.ts`
- **No `__tests__/` directories** — prohibited by policy
- **Fixtures allowed**: `src/__fixtures__/` for test data
- **Helpers allowed**: `src/test-helpers/` for test utilities

### Naming Conventions

| Test Type         | Pattern                 | Example                  |
| ----------------- | ----------------------- | ------------------------ |
| Unit tests        | `*.test.ts`             | `auth.test.ts`           |
| Integration tests | `*.integration.test.ts` | `db.integration.test.ts` |
| E2E tests         | `*.e2e.ts`              | `graphql-auth.e2e.ts`    |
| Playwright specs  | `*.spec.ts`             | `login.spec.ts`          |

### Enforcement

- Pre-commit hook prevents new `__tests__/` directories.
- Policy documented alongside this file.
- Vitest automatically discovers colocated tests via `**/*.test.{ts,tsx}`.
