# Migration: Turbo → Vite Plus

Date: 2026-04-22

## What changed

| Before                                 | After                                 |
| -------------------------------------- | ------------------------------------- |
| `turbo run <task>`                     | `vp run <task>`                       |
| `turbo.json` task graph                | pnpm workspace deps + `vp run --deps` |
| `"turbo": "^2.4.4"` devDep             | `"vite-plus": "0.1.19"` devDep        |
| `eslint-plugin-turbo` in config-eslint | removed                               |

## Timing baseline

Cold-run benchmarks were not available pre-migration. Run the following after
deploying to record the new baseline:

```bash
time pnpm build 2>&1 | tail -5
time pnpm test  2>&1 | tail -5
```

## Rollback recipe

1. `git revert <this-commit-sha>` — restores `turbo.json`, reverts all
   `vp run` → `turbo run` script replacements, and restores `turbo` devDependency.
2. `pnpm install` — reinstalls turbo.
3. Verify: `pnpm build && pnpm test`.

No data migrations or database changes; rollback is purely a config revert.

## Accepted trade-offs

- No remote cache equivalent to Turbo remote caching in vite-plus v0.1.x.
  Add Nx remote cache or similar only if cold-start regression is measured.
- `vite-plus` is pre-1.0 (v0.1.19). API stability risk acknowledged; pinned
  exactly in catalog (`vite-plus: 0.1.19`).
