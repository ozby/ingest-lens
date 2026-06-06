# Turbo Surface Baseline

Captured: 2026-04-22

## turbo.json task graph

| Task          | dependsOn                | outputs                                         | cache | persistent |
| ------------- | ------------------------ | ----------------------------------------------- | ----- | ---------- |
| `build`       | `^build`                 | `build/**`, `.vercel/**`, `dist/**`, `.next/**` | true  | false      |
| `test`        | (none)                   | `coverage/**`                                   | true  | false      |
| `lint`        | `^build`, `^lint`        | (none)                                          | true  | false      |
| `check-types` | `^build`, `^check-types` | (none)                                          | true  | false      |
| `dev`         | `^build`                 | (none)                                          | false | true       |

Global env vars passed to all tasks: `MONGODB_URI`, `NODE_ENV`, `LOG_LEVEL`, `JWT_SECRET`,
`JWT_EXPIRES_IN`, `DEFAULT_RETENTION_PERIOD`, `CORS_ORIGIN`, `JEST_WORKER_ID`,
`NOTIFICATION_PORT`, `CLIENT_PORT`, `API_PORT`.

## Root package.json scripts referencing turbo

| Script           | Command                                           |
| ---------------- | ------------------------------------------------- |
| `build`          | `turbo run build`                                 |
| `clean`          | `turbo run clean`                                 |
| `dev`            | `bun ./scripts/with-doppler.ts dev turbo run dev` |
| `dev:no-doppler` | `turbo run dev`                                   |
| `lint`           | `turbo run lint`                                  |
| `test`           | `turbo run test`                                  |
| `check-types`    | `turbo run check-types`                           |

Root devDependencies: `"turbo": "^2.4.4"`

## Workspace package.json files referencing turbo

| File                                  | Reference                                         |
| ------------------------------------- | ------------------------------------------------- |
| `packages/config-eslint/package.json` | `"eslint-plugin-turbo": "^2.4.4"` (devDependency) |

## Timing note (cold run estimate)

Cold timings were not benchmarked prior to this commit (no CI timing artifacts
available). After migration, run `pnpm build 2>&1 | grep "Tasks:"` with vite-plus
and record as the new baseline.
