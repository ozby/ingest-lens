---
type: rule
paths: ["**/*.ts", "**/*.tsx"]
last_updated: "2026-04-21"
---

# TypeScript coding conventions

Principal-level non-negotiables. Most are enforced via oxlint; the rest are
enforced by review and by the commit-msg + pre-push hooks.

## Type safety

- **Zero `any`** — not in source, not in tests, not in `// @ts-ignore` comments. Use `unknown` + a narrowing step, or a real type.
- **No non-null assertions (`!`)** unless paired with a comment that explains the invariant. Prefer a runtime check.
- **No TypeScript `enum`** — use `as const` objects + union literals. Enums produce runtime code and defeat tree shaking.
- **No `namespace`** — ES modules only.
- **Prefer `type` over `interface`** for non-extended shapes; use `interface` only when declaration merging is genuinely needed.
- **Readonly by default** — `readonly T[]` for array params that aren't mutated; `Readonly<T>` for object params; `as const` for literal maps.

## Control flow and complexity

- **Max cognitive complexity 8** (oxlint). Break out early returns; extract helpers.
- **No `var`**. `const` everywhere; `let` only when reassigned.
- **No `alert` / `confirm` / `prompt`** in app/worker code.
- **No default exports** in new code. Named exports improve refactors, renames, and auto-imports.
- **No `any`-typed catch bindings** — `catch (error: unknown)` then narrow.

## Imports and module boundaries

- **No `../../../..` relative ladders**. Use the nearest workspace alias (`@repo/<package>/<surface>`).
- **No cross-package deep imports** — import only from a package's public entry points. If you need something internal, export it or add it to the public surface deliberately.
- **No import cycles**. Oxlint flags them.
- **One-line imports only** for `type` — `import type { Foo } from "…"` — not `import { type Foo } from "…"` unless other non-type names are already there.
- **No side-effect imports** outside a small allowlist (polyfills, CSS). Tree-shaking breaks otherwise.

## Async and errors

- **No `async` without `await`**.
- **Every Promise resolves or is explicitly `void`ed** — unhandled-promise lint is on.
- **Never `throw` a non-Error** — throw `new Error(...)` or a domain error class.
- **Don't swallow errors** to satisfy a handler contract. Log with context, re-throw, or convert to a typed `Result`.
- **No bare `setTimeout`/`setInterval`** without a cleanup path (abort, clearTimeout in finally, structured concurrency).

## Logging

- Structured logs only via the repo logger (`@repo/logger`). No `console.log` in app code.
- Log `level`, `msg`, and a structured context object — never string-concatenate.
- Redact secrets at the logger boundary.

## Tests

- **Every test file sits next to its subject** (`foo.ts` → `foo.test.ts`), except integration/e2e tests which live under `tests/`.
- **Test file names include the suite level**: `foo.test.ts`, `foo.integration.test.ts`, `foo.e2e.test.ts`.
- **No `.skip` / `.only`** checked in. Hook blocks these.
- **Assertions are strict**: `expect(value).toStrictEqual(...)`, not `.toMatchObject` unless intentional.
- **One behavior per test**. If you need `&& expect`, split the test.

## Files that are off-limits

See `generated-code-governance.md`. Do not edit generated code, lockfiles,
or vendored SDKs by hand.
