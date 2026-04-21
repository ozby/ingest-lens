<!-- PRINCIPAL:START -->

# Operating Contract

This is the authoritative reference for every contributor — human or agent — working in this repo.
Read it before you touch a file. The rules are not guidelines.

## Plan first

Every non-trivial change starts as a blueprint. Blueprint specs live in
[`blueprints/planned/`](./blueprints/planned/) with lifecycle tracked in
[`blueprints/README.md`](./blueprints/README.md).

Use the skills in [`.agent/skills/`](./.agent/skills/):

- `$plan` — draft a blueprint spec
- `$plan-refine` — iterate the spec before execution
- `$pll <slug>` — launch parallel lanes, one worktree per slug on `pll/<slug>`

Parallel lanes commit **once**, after `/verify` is green. No incremental WIP commits on `pll/` branches.

## Implement

```sh
pnpm install                              # install deps
pnpm --filter <workspace> <script>        # scoped workspace commands
doppler run --config dev -- pnpm dev      # inject secrets, run local
bun ./scripts/<name>.ts                   # run repo scripts
```

Scripts are `.ts` executed via `bun`. Never `.mjs`. Never raw `node` or `npx`.

Type checking uses `tsgo` from `@typescript/native-preview`, not `tsc`.

## Verify

All four must pass before committing:

```sh
pnpm check-types          # tsgo --noEmit across all workspaces
pnpm lint                 # oxlint
pnpm test                 # vitest
pnpm catalog:check        # no version drift from pnpm workspace catalog
pnpm exec prettier --check .   # formatting gate
```

Never skip a gate. If a gate is broken by your change, fix it in the same PR.

## Communicate

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(api-server): add HMAC-signed delivery receipts
fix(db): scope idempotency key to tenant
docs(adrs): record auth strategy decision
```

The `commit-msg` hook enforces format. The Lore Commit Protocol applies to
architectural decisions — record them in [`docs/adrs/`](./docs/adrs/).

## Non-negotiables (hard stops)

- **Never `--no-verify`** on any git command. If a hook fails, fix the root cause.
- **No secrets in code.** Secrets flow through Doppler only. No `.env` files anywhere.
- **No `dotenv` package.** Remove it if you see it. See [`.agent/rules/no-dotenv.md`](./.agent/rules/no-dotenv.md).
- **No `.mjs` scripts.** Use `.ts` + `bun`.
- **No backwards-compat shims.** Delete legacy in the same PR as the replacement.
- **No feature flags** for migrations. Hard-cut, then verify.

## Do-not patterns

- Do not add `any` types — oxlint enforces this; a suppression comment is not an escape hatch.
- Do not pin dependency versions per-workspace when a catalog entry exists — use `catalog:`.
- Do not create new packages without a product-wedge blueprint — sprawl compounds fast.
- Do not re-derive policy from memory when a rule file exists — load the file.
- Do not commit generated artifacts by hand — CI regenerates them; manual edits get clobbered.
- Do not run `pnpm install` inside a workspace — always run from the monorepo root.
- Do not silently bypass a rule because it conflicts with a task — surface the conflict and fix the rule.

## Escalation map

When you are stuck or unsure, check in this order:

1. [`blueprints/README.md`](./blueprints/README.md) — is there an existing plan for this?
2. [`docs/adrs/`](./docs/adrs/) — was a decision already made?
3. [`.agent/guides/`](./.agent/guides/) — operational policy for agent behaviour
4. [`.agent/rules/`](./.agent/rules/) — specific enforced rules per topic
5. Source code — the implementation is the ground truth

If none of the above resolves it, open an ADR or blueprint before proceeding.

<!-- PRINCIPAL:END -->

<!-- omx:generated:agents-md -->

## Repository map

- `apps/client` — browser app
- `apps/api-server` — Node service
- `apps/notification-server` — Node service
- `packages/ui` — shared browser-safe UI package
- `packages/logger` — shared runtime utility package
- `packages/test-utils` — shared test-support package
- `packages/types` — shared type package
- `packages/config-eslint`, `packages/config-typescript` — shared config packages
- `.omx/` — durable planning, boundary, and lifecycle artifacts
- `.agent/` — repo-local skills, rules, and guides

## Durable planning surface

- PRDs: `.omx/plans/prd-<slug>.md`
- Test specs: `.omx/plans/test-spec-<slug>.md`
- Boundary contracts: `.omx/contracts/*.md`
- Lifecycle state: `.omx/state/lifecycle/<slug>.json`
- Session notes: `.omx/notepad.md`
- Project memory: `.omx/project-memory.json`

If work changes workspace ownership, build boundaries, or the `apps/client` ↔
`packages/ui` consumption mode, update `.omx/contracts/workspace-boundary-contract.md`
before claiming the plan is ready.

<!-- /omx:generated:agents-md -->
