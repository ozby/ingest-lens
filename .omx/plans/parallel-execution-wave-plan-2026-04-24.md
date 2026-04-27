# Parallel execution wave plan (active blueprints)

Date: 2026-04-24
Scope: all active planned blueprints under `blueprints/planned/*/_overview.md`
Mode: read-only planning

## Inputs inspected

- `blueprints/planned/showcase-hardening-100/_overview.md`
- `blueprints/planned/rebrand-ingestlens/_overview.md`
- `blueprints/planned/ai-oss-tooling-adapter/_overview.md`
- `blueprints/planned/ai-payload-intake-mapper/_overview.md`
- `blueprints/planned/public-dataset-demo-ingestion/_overview.md`
- `blueprints/planned/client-route-code-splitting/_overview.md`
- `.omx/context/pll-blueprints-20260422T213123Z.md`

## Blueprint dependency spine

1. `showcase-hardening-100` (root)
2. `rebrand-ingestlens` depends on `showcase-hardening-100`
3. `ai-oss-tooling-adapter` depends on `rebrand-ingestlens`
4. `ai-payload-intake-mapper` depends on `showcase-hardening-100`, `rebrand-ingestlens`, `ai-oss-tooling-adapter`
5. `public-dataset-demo-ingestion` depends on `showcase-hardening-100`, `rebrand-ingestlens`, `ai-payload-intake-mapper`
6. `client-route-code-splitting` is independent

## Shared-file contention to respect

- `package.json` / `pnpm-lock.yaml`: `showcase-hardening-100` (1.3, 3.2, 3.3), `client-route-code-splitting` (1.1, maybe 1.3), `ai-payload-intake-mapper` (3.2)
- `apps/client/src/App.tsx`: `client-route-code-splitting` 1.2 and `ai-payload-intake-mapper` 3.1
- `apps/client/src/components/Sidebar.tsx`: `rebrand-ingestlens` 1.3, `showcase-hardening-100` 2.3, `ai-payload-intake-mapper` 3.1
- `README.md`: `rebrand-ingestlens` 1.1 / 2.1 and `public-dataset-demo-ingestion` 1.1 / 3.1
- `apps/workers/wrangler.toml`: `rebrand-ingestlens` 1.2 and `ai-oss-tooling-adapter` 3.1 / `ai-payload-intake-mapper` 1.2
- `apps/workers/src/routes/intake.ts`: `ai-payload-intake-mapper` 2.1 / 2.2 / 2.3 and `public-dataset-demo-ingestion` 1.2
- `.new` artifact cleanup overlaps between `showcase-hardening-100` 3.3 and `rebrand-ingestlens` 1.4

## Planning assumption

- Treat tasks marked `Optional` as tail work, not blockers for downstream blueprint start. If optional tasks must be completed before a blueprint counts as done, add one extra serialized tail wave where noted.

## Recommended global waves

### Wave 0 — foundation fan-out

Max parallelism: 4

- `showcase-hardening-100` 1.1 `[security]`
- `showcase-hardening-100` 1.3 `[types]`
- `showcase-hardening-100` 2.1 `[auth]`
- `client-route-code-splitting` 1.2 `[client]`

Why here:

- All are dependency-free.
- Write sets are disjoint.
- This front-loads the dominant critical-path blueprint while using an otherwise idle client lane.

### Wave 1 — package-owning and contract bridge

Max parallelism: 3

- `showcase-hardening-100` 1.2 `[contracts]` (after 1.1)
- `showcase-hardening-100` 3.2 `[ci]` (after 1.3)
- `client-route-code-splitting` 1.1 + 1.3 in one package-owning lane (after `showcase` 1.3 frees package/lock ownership)

Why here:

- `showcase` contracts unlock most remaining hardening work.
- CI and client package work both touch workspace/package surfaces, so package ownership stays localized to one lane at a time.

### Wave 2 — finish independent hardening branches and close route-splitting

Max parallelism: 5

- `showcase-hardening-100` 2.2 `[delivery]`
- `showcase-hardening-100` 2.3 `[observability]`
- `showcase-hardening-100` 3.1 `[tests]`
- `showcase-hardening-100` 3.3 `[deps]` (serialize with any remaining package/lock work)
- `client-route-code-splitting` 1.4 `[qa]`

Why here:

- All `showcase` tasks now unlock from 1.2/1.3/3.2.
- `client-route-code-splitting` can complete entirely off the main spine.
- Run `showcase` 3.3 before `rebrand` 1.4 so duplicated `.new` cleanup is not fought in parallel.

### Wave 3 — rebrand phase 1

Max parallelism: 4

- `rebrand-ingestlens` 1.1 `[docs]`
- `rebrand-ingestlens` 1.2 `[brand]`
- `rebrand-ingestlens` 1.3 `[ui-shell]`
- `rebrand-ingestlens` 1.4 `[hygiene]` (reduced if `showcase` 3.3 already removed shared `.new` files)

Why here:

- Entire blueprint is now unblocked.
- Phase-1 write sets are intentionally split across docs, wrangler/product metadata, client shell, and hygiene files.

### Wave 4 — rebrand phase 2 / blueprint completion

Max parallelism: 3

- `rebrand-ingestlens` 2.1 `[demo]`
- `rebrand-ingestlens` 2.2 `[ui-landing]`
- `rebrand-ingestlens` 2.3 `[ui-rails]`

Why here:

- Finishes the rebrand dependency gate.
- Keeps README ownership separate from page-copy ownership.

### Wave 5 — AI adapter foundation

Max parallelism: 3

- `ai-oss-tooling-adapter` 1.1 `[deps]`
- `ai-oss-tooling-adapter` 1.2 `[contracts]`
- `ai-oss-tooling-adapter` 1.3 `[paths]`

Why here:

- First truly parallel AI wave.
- Tasks have disjoint write sets and produce all prerequisites for schemas/adapter work.

### Wave 6 — AI schema barrier

Max parallelism: 1

- `ai-oss-tooling-adapter` 2.1 `[schemas]`

Why here:

- Hard dependency barrier: adapter work needs both dependency boundary and contracts.

### Wave 7 — AI adapter implementation

Max parallelism: 1

- `ai-oss-tooling-adapter` 3.1 `[adapter]`

Why here:

- Serial by design behind schemas.
- This is the last non-optional blocker before the intake blueprint can begin.

### Wave 8 — intake contracts

Max parallelism: 1

- `ai-payload-intake-mapper` 1.1 `[contracts]`

Why here:

- Starts immediately once `ai-oss-tooling-adapter` core is complete.
- Everything else in intake depends directly or indirectly on this task.

### Wave 9 — intake AI boundary split

Max parallelism: 2

- `ai-payload-intake-mapper` 1.2 `[ai-boundary]`
- `ai-payload-intake-mapper` 1.3 `[prompt]`

Why here:

- Both depend only on intake contracts.
- Parallelizing here shortens the otherwise long intake chain.

### Wave 10 — intake API + eval branch

Max parallelism: 2

- `ai-payload-intake-mapper` 2.1 `[api]`
- `ai-payload-intake-mapper` 3.2 `[eval]`

Why here:

- Both depend on 1.1/1.2/1.3.
- `eval` avoids the `intake.ts` contention that the API lane owns.

### Wave 11 — approval gate

Max parallelism: 1

- `ai-payload-intake-mapper` 2.2 `[approval]`

Why here:

- Approval/replay must layer on top of the new intake API.
- This is the last hard blocker before telemetry and client UI can split.

### Wave 12 — intake completion split

Max parallelism: 2

- `ai-payload-intake-mapper` 2.3 `[telemetry]`
- `ai-payload-intake-mapper` 3.1 `[client]`

Why here:

- Telemetry and client UI both depend on approval, but do not share files.
- Completes the core intake blueprint without forcing the optional judge lane onto the spine.

### Wave 13 — demo ingestion foundation

Max parallelism: 2

- `public-dataset-demo-ingestion` 1.1 `[provenance]`
- `public-dataset-demo-ingestion` 1.2 `[fixtures]`

Why here:

- `public-dataset-demo-ingestion` is now fully unblocked.
- One lane owns docs/README, the other owns fixture generation and intake-route exposure.

### Wave 14 — demo flow split

Max parallelism: 2

- `public-dataset-demo-ingestion` 2.1 `[coverage]`
- `public-dataset-demo-ingestion` 2.2 `[client-flow]`

Why here:

- `coverage` depends on both provenance + fixtures; `client-flow` depends on fixtures only but fits cleanly here.
- Write sets remain separate (worker tests/data vs client pages/api).

### Wave 15 — demo packaging

Max parallelism: 1

- `public-dataset-demo-ingestion` 3.1 `[demo]`

Why here:

- Final packaging depends on both coverage and client preload work.

## Optional tail waves (keep off the critical path)

- `ai-oss-tooling-adapter` 3.2 `[judge]` after Wave 7
- `ai-payload-intake-mapper` 3.3 `[judge]` after Waves 10 and 12
- `public-dataset-demo-ingestion` 2.3 `[freshness]` after a stable deterministic demo exists, serialized with demo-guide ownership because both touch `docs/guides/public-dataset-demo.md`

## Critical path rationale

Fastest dependency spine, assuming optional tasks stay off-path:

`showcase-hardening-100`
→ `rebrand-ingestlens`
→ `ai-oss-tooling-adapter` core (`1.1/1.2/1.3 -> 2.1 -> 3.1`)
→ `ai-payload-intake-mapper` core (`1.1 -> 1.2/1.3 -> 2.1 -> 2.2 -> 2.3/3.1`)
→ `public-dataset-demo-ingestion` core (`1.1/1.2 -> 2.1/2.2 -> 3.1`)

Why this is the true spine:

- `showcase-hardening-100` gates both branding and AI work.
- `rebrand-ingestlens` gates `ai-oss-tooling-adapter`, which in turn gates `ai-payload-intake-mapper`.
- `public-dataset-demo-ingestion` cannot begin until the intake workflow exists.
- `client-route-code-splitting` is fully independent and should be treated as free parallel throughput, not part of the delivery spine.

## Staffing guidance

Recommended lane ownership:

1. Worker security/contracts lane — `showcase` 1.1, 1.2, 2.2, 2.3
2. Workspace/package lane — `showcase` 1.3, 3.2, 3.3 + `client-route` 1.1/1.3/1.4
3. Worker auth lane — `showcase` 2.1
4. Client route/UI lane — `client-route` 1.2, `rebrand` 1.3/2.2/2.3, `ai-payload` 3.1, `public-dataset` 2.2
5. Docs/brand lane — `rebrand` 1.1/1.2/1.4/2.1, `public-dataset` 1.1/3.1
6. AI/intake lane — `ai-oss` core + `ai-payload` worker-side tasks + `public-dataset` 1.2/2.1

## Acceptance criteria for this plan

- Uses all active planned blueprints.
- Respects declared blueprint `depends_on` edges.
- Serializes obvious shared-file hot spots (`package.json`, `pnpm-lock.yaml`, `README.md`, `App.tsx`, `Sidebar.tsx`, `wrangler.toml`, `routes/intake.ts`, `.new` cleanup).
- Keeps optional work off the critical path unless explicitly promoted.
- Leaves `client-route-code-splitting` off the dependency spine so parallel capacity is not wasted.
