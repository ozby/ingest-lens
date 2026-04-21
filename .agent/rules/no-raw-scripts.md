---
type: rule
paths: ["**/*"]
last_updated: "2026-04-21"
---

# No raw `node`, `npx`, or `.mjs` scripts

All repo scripting goes through one of two surfaces:

1. A `pnpm <script-name>` entry declared in the root or a workspace `package.json`.
2. A TypeScript file under `scripts/<name>.ts` executed via `bun ./scripts/<name>.ts`.

## Forbidden

- `.mjs` or `.cjs` script files for repo-owned workflows. Bun runs TypeScript directly; there is no excuse for a plain-JS sidecar.
- `node ./scripts/foo.ts` — use `bun ./scripts/foo.ts`. The TypeScript loader is a moving target; Bun is the one we have chosen.
- `npx <tool>` in documentation or CI. Add the tool to `devDependencies` (catalog-pinned) and call `pnpm exec <tool>`.
- Ad-hoc one-liners in `package.json#scripts` that wrap shell logic. If it's more than one command or branches on a condition, it belongs in `scripts/<name>.ts`.

## Allowed exceptions

- Third-party config files that **require** a specific extension by the tool author (for example, some loader fallbacks). Document the exception at the top of the file and prefer `.ts` first.
- Shell scripts under `scripts/` that wrap a single binary call (e.g. `scripts/preflight.sh`). TypeScript is still preferred; a shell script is OK only when the task is genuinely a pipeline of system commands.
- `node --eval` inside a CI step is acceptable for a one-line check. Anything longer becomes a committed `.ts` file.

## Script structure

```ts
#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";

async function main(): Promise<void> {
  // ...
}

await main();
```

- Use top-level `await` freely; Bun supports it.
- Prefer Node built-ins (`node:fs`, `node:path`) so the script also runs under tools that invoke via `node` as a fallback.
- Exit non-zero on failure; use `process.exitCode = 1` or `throw`.

## Enforcement

- `scripts/**/*.mjs` and `scripts/**/*.cjs` trigger a blueprint-validator warning.
- CI fails if `package.json#scripts` values contain `node ./scripts/`.
