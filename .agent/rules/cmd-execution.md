---
type: rule
paths: ["**/*"]
last_updated: "2026-04-21"
---

# Command execution

The canonical command surface is the root `package.json` scripts plus
workspace-filtered `pnpm` commands. Scripts themselves are authored in
TypeScript and executed via **bun**.

## BOOKEND rule: `pnpm qa` runs exactly twice

`pnpm qa` is a **bookend** command.

- Run it **once at the START** of a non-trivial change to confirm a clean baseline.
- Run it **once at the END** to confirm the change landed green.
- **Never run it in between.** Running it mid-change burns CI time and obscures which step introduced the failure. Use targeted commands for inner-loop verification.

The QA bundle is `pnpm lint && pnpm check-types && pnpm test && pnpm build`.

`check-types` runs `tsgo --noEmit` (from `@typescript/native-preview`) in every
workspace — **not** `tsc`. `tsgo` is the Go-based TypeScript compiler; it is
roughly an order of magnitude faster than `tsc` and is the canonical
typecheck tool in this repo.

## Targeted inner-loop commands

| Want to verify             | Command                                                          |
| -------------------------- | ---------------------------------------------------------------- |
| A single file's types      | `pnpm --filter <workspace> exec tsgo --noEmit -p .`              |
| One workspace's tests      | `pnpm --filter <workspace> test`                                 |
| One file's tests           | `pnpm --filter <workspace> exec vitest run path/to/file.test.ts` |
| Lint the staged files only | the pre-commit hook (or `pnpm exec lint-staged`)                 |

## Script execution

- Repo scripts live under `scripts/` as `*.ts` files with a `#!/usr/bin/env bun` shebang.
- Invoke them via `bun ./scripts/<name>.ts` or a `pnpm` script wrapper.
- **Do not** author `.mjs` or `.cjs` scripts. Bun runs TypeScript natively — there is no reason to reach for a plain-ESM sidecar.
- **Do not** use `npx` for one-off invocations in documentation. Use `pnpm exec <tool>` or add a script.

## Background and long-running processes

- Prefer `pnpm dev` (root) over per-workspace `pnpm --filter <name> dev` when multiple workspaces should start together.
- Kill stragglers before re-running. Port collisions are a top debugging trap.
- Long builds and test runs should use `&` + a log file only when running unattended; otherwise keep them in the foreground so failures aren't hidden.

## Forbidden patterns

- `pnpm install --force` outside of a declared recovery procedure.
- `git push --force` on shared branches.
- `git commit --no-verify` — hooks are the first guardrail. If a hook is wrong, fix the hook.
- `pnpm qa` inside a test watch loop.
- `rm -rf node_modules` as a debug step before filing a reproducible issue.
