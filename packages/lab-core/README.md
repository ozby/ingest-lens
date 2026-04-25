# @repo/lab-core

Shared primitives for the Consistency Lab. Zero external runtime dependencies — pure TypeScript running in Cloudflare Workers.

## What's in here

| Module                | Purpose                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `KillSwitchKV`        | Runtime kill switch backed by CF Workers KV. 5 s per-request cache. Supports `autoResetAt` for scheduled auto-reset (F-11).          |
| `AdminBypassToken`    | Constant-time token comparison for admin requests. Writes audit rows to KV (F-06).                                                   |
| `SessionLock`         | Durable Object that enforces single-writer concurrency with a waiting-room queue and TTL expiry (F-20).                              |
| `LabConcurrencyGauge` | Durable Object that tracks active sessions and enforces a max-concurrency cap.                                                       |
| `TelemetryCollector`  | Batching event pipeline that flushes to `EventsArchive` (configurable batch size + timeout).                                         |
| `InMemoryArchive`     | In-process archive for tests; production code uses a Postgres-backed implementation.                                                 |
| `Histogram`           | Compact percentile histogram (P50/P95/P99) for latency tracking.                                                                     |
| `PRICING_TABLE`       | Static CF/Neon unit prices with staleness detection (>90 days triggers a warning). `calculateCost` applies free-tier logic.          |
| Drizzle schema        | `labSchema`, `sessions`, `runs`, `eventsArchive`, `heartbeat`, `heartbeatAudit` — all in the `lab` Postgres schema (never `public`). |

## Quick start (new contributor, ~1 hour)

```bash
# From repo root
pnpm --filter @repo/lab-core test        # run all unit tests
pnpm --filter @repo/lab-core check-types # type-check (tsgo --noEmit)
pnpm --filter @repo/lab-core lint        # oxlint
```

## Key invariants

- **All tables live in the `lab` Postgres schema** — CI guard (`scripts/check-lab-migrations.ts`) blocks any `public.*` DDL.
- **KillSwitchKV is the only runtime kill switch** — Doppler is build-time only (F-01).
- **AdminBypassToken uses constant-time comparison** — prevents timing-based token enumeration (F-06).
- **Hyperdrive has no per-query charge** — it is omitted from `PRICING_TABLE` (probe p14).
- **No external dependencies at runtime** — `@repo/lab-core` must remain self-contained.

## Adding a new module

1. Create `src/<name>.ts` and `src/<name>.test.ts`.
2. Export from `src/index.ts`.
3. Run `pnpm --filter @repo/lab-core test` — all tests must pass.
4. Run `pnpm --filter @repo/lab-core check-types` — zero type errors.
