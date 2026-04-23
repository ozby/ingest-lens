---
type: blueprint
status: planned
complexity: S
created: "2026-04-23"
last_updated: "2026-04-23"
progress: "Refined 2026-04-23; 0% implementation"
depends_on: []
tags:
  - client
  - vite
  - performance
  - code-splitting
  - bundle-size
---

# Client route code splitting

**Goal:** Remove the Vite large-chunk warning by splitting `apps/client` at route
boundaries, so chart-heavy dashboard code is no longer part of the initial SPA
entry chunk, and keep that delivery shape enforced by a small dependency-free
budget gate.

## Planning Summary

- **Why now:** Verification showed the client production build succeeds but emits
  Vite's large-chunk warning. The current single JS bundle is about `971.7 kB`
  raw / `276.9 kB` gzip, above Vite's default `500 kB` chunk warning threshold.
- **Scope:** Convert the static page imports in `apps/client/src/App.tsx` to
  top-level `React.lazy(() => import(...))` declarations wrapped by a single
  route-level `Suspense` boundary; consume the Agent Kit Vite bundle-budget
  audit for generated-asset enforcement; and install Agent Kit's minimal Vite
  dynamic-import recovery helper for stale deployed chunks.
- **Out of scope:** Replacing Recharts, redesigning charts, adding a bundle
  analyzer dependency, changing router architecture to React Router data routers,
  adding manual vendor-chunk policy, introducing SSR, or masking the warning by
  raising `build.chunkSizeWarningLimit`.
- **Primary success metric:** `pnpm --filter client exec vite build` does not
  emit `Some chunks are larger than 500 kB after minification`, no generated JS
  asset under `apps/client/dist/assets` is over `512000` bytes raw, and the
  HTML-eager JS set remains below the documented budget.

## Pre-execution audit (2026-04-23)

**Readiness:** ready after applying the three implementation tasks below.

**What is already true**

- `apps/client/src/App.tsx` is the route composition point and statically imports
  all eight page modules (`Index`, `Dashboard`, `Queues`, `QueueDetail`,
  `Topics`, `TopicDetail`, `NotFound`, `Metrics`).
- Every page under `apps/client/src/pages/*.tsx` has a default export, which is
  the shape required by `React.lazy(() => import("./pages/..."))`.
- The app currently uses `BrowserRouter`, `Routes`, and `Route`, not React
  Router data-router route objects. `React.lazy` is therefore the elegant small
  change; React Router's route-object `lazy` API would force an unrelated router
  migration.
- `RequireAuth` returns its children only after auth has resolved, so protected
  lazy components are not rendered while auth is loading or unauthenticated.
- The existing build command already writes `apps/client/dist`, so bundle-budget
  checks can inspect generated assets without adding dependencies.
- The root already depends on `@webpresso/agent-kit`, making Agent Kit the right
  owner for reusable Vite guardrails instead of adding a one-off local budget
  checker script.

**Current measured bundle**

Command used on 2026-04-23:

```bash
pnpm --filter client exec vite build
```

Observed output:

| Asset                            |         Raw |        Gzip | Note                     |
| -------------------------------- | ----------: | ----------: | ------------------------ |
| `dist/assets/index-Cl96Xgv6.js`  | `971.69 kB` | `276.83 kB` | Single initial JS bundle |
| `dist/assets/index-ChCXvGrg.css` |  `37.99 kB` |   `7.30 kB` | Not the warning source   |

Source-map attribution estimate from the earlier pre-audit build:

| Contributor            | Approx raw bytes |   Share | Why it is in initial bundle today                                       |
| ---------------------- | ---------------: | ------: | ----------------------------------------------------------------------- |
| `recharts`             |        `235,971` | `24.4%` | `ServerMetrics` is statically reachable through `Dashboard` / `Metrics` |
| `react-dom`            |        `129,329` | `13.4%` | Required by the app entry                                               |
| `zod`                  |         `57,690` |  `6.0%` | Queue/topic forms are statically reachable                              |
| `axios`                |         `34,265` |  `3.5%` | API service is statically reachable through auth/data pages             |
| `sonner`               |         `31,759` |  `3.3%` | Toasters and API error handling                                         |
| `lodash`               |         `30,092` |  `3.1%` | Pulled through charting stack                                           |
| `react-hook-form`      |         `24,221` |  `2.5%` | Queue/topic forms are statically reachable                              |
| `@tanstack/query-core` |         `22,400` |  `2.3%` | App query provider                                                      |
| `date-fns`             |         `21,701` |  `2.2%` | List/detail/metrics formatting                                          |
| local `packages/ui`    |         `21,331` |  `2.2%` | Shared UI primitives                                                    |

**Throwaway validation experiment**

A temporary copy of `App.tsx` was changed to lazy-load pages with top-level
`lazy()` declarations and one `Suspense` around `<Routes>`. No repo files were
kept changed by this experiment. The experimental build produced no large-chunk
warning and generated these largest chunks:

| Chunk                |         Raw |        Gzip | Interpretation                                        |
| -------------------- | ----------: | ----------: | ----------------------------------------------------- |
| `ServerMetrics-*.js` | `384.38 kB` | `102.60 kB` | Chart-heavy code deferred to dashboard/metrics routes |
| shared vendor chunk  | `163.33 kB` |  `53.73 kB` | Common runtime/UI deps                                |
| `AuthContext-*.js`   |  `97.72 kB` |  `32.73 kB` | Auth/API path remains initial/common                  |
| `index-*.js`         |  `52.20 kB` |  `16.75 kB` | Initial app/router entry                              |

**Conclusion:** route-level lazy loading is sufficient to remove the warning;
manual vendor splitting is unnecessary and would be a less elegant, more brittle
solution for this scope.

## Architecture Overview

Before:

```text
main.tsx
  -> App.tsx
    -> static page imports
      -> Dashboard / Metrics
        -> ServerMetrics
          -> Recharts + D3 stack
      -> QueueForm / TopicForm
        -> Zod + React Hook Form
  => one large initial index-*.js chunk
```

After:

```text
main.tsx
  -> tiny stale-chunk recovery registration
  -> App.tsx
    -> stable providers and router shell
    -> Suspense boundary around Routes only
    -> lazy route imports loaded on first route render
      /dashboard or /metrics -> ServerMetrics -> Recharts chunk
      /queues or /topics     -> form chunks
  => small initial entry + deferred route chunks + enforced budget gate
```

## Fact-Checked Findings

| ID  | Severity | Claim / assumption                                                                                            | Reality / source                                                                                                                                                                                                                                                                | Blueprint fix                                                                                                                                    |
| --- | -------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | HIGH     | Vite's large-chunk warning threshold defaults to `500 kB`.                                                    | Vite v8.0.9 build options document `build.chunkSizeWarningLimit` as the chunk-size warning limit; the local build emits the warning for the `971.69 kB` JS chunk. Source fetched 2026-04-23: https://vite.dev/config/build-options.html#build-chunksizewarninglimit             | Keep the success metric tied to removing the warning; do not raise the limit.                                                                    |
| F2  | HIGH     | `React.lazy` defers loading a component's code until it is rendered for the first time.                       | React docs say `lazy` delays calling the load function until first render and resolves the module's `.default` as the component. Source fetched 2026-04-23: https://react.dev/reference/react/lazy                                                                              | Use top-level `lazy(() => import("./pages/..."))` declarations, relying on existing default page exports.                                        |
| F3  | HIGH     | Lazy components need a `Suspense` boundary.                                                                   | React docs say a lazy component suspends while loading and `<Suspense>` provides the loading fallback. Source fetched 2026-04-23: https://react.dev/reference/react/Suspense                                                                                                    | Wrap the route switch in one lightweight route-level fallback.                                                                                   |
| F4  | HIGH     | Vite computes modulepreload dependencies for dynamic imports; code splitting does not mean no preload at all. | Vite v8 docs say dependency lists are computed for each dynamic import and for chunks imported by HTML entries. Source fetched 2026-04-23: https://vite.dev/config/build-options.html#build-modulepreload                                                                       | Budget HTML-eager assets by size and total bytes instead of assuming no preloads.                                                                |
| F5  | MEDIUM   | React Router's route-object `lazy` API is the alternative route-splitting mechanism.                          | React Router v6 docs state route `lazy` works only with data routers and lazy files do not use default exports. Source fetched 2026-04-23: https://reactrouter.com/6.30.3/route/lazy                                                                                            | Do not migrate routers; keep `BrowserRouter` / `<Routes>` and use React `lazy`.                                                                  |
| F6  | HIGH     | The repo's largest bundle contributor is charting.                                                            | Local source-map attribution and the route-lazy experiment show `recharts` contributes about `236 kB` raw and the route-lazy chart chunk stays under the default warning threshold.                                                                                             | Split at page boundaries first; defer Recharts replacement and manual vendor chunking.                                                           |
| F7  | HIGH     | Dynamic-import chunks can fail after a deployment when a stale HTML/app instance references deleted assets.   | Vite emits a `vite:preloadError` event when dynamic imports fail and documents reload handling; it also notes stale assets after new deployments and recommends `Cache-Control: no-cache` for HTML. Source fetched 2026-04-23: https://vite.dev/guide/build#load-error-handling | Add a minimal once-per-session preload-error recovery task and document the HTML caching dependency.                                             |
| F8  | MEDIUM   | A filename-prefix check for `Dashboard-*` / `ServerMetrics-*` reliably detects eager route preloads.          | Vite/Rolldown chunk names are generated build artifacts and modulepreload relationships are dependency-based, not a stable app-level contract. Local experiment names are evidence, not a durable API.                                                                          | Make the budget checker parse `index.html`, resolve referenced JS assets, and enforce size/total budgets instead of brittle route-name prefixes. |
| F9  | MEDIUM   | The route fallback is harmless no matter where it is placed.                                                  | React Suspense replaces the closest boundary's subtree with the fallback while children load; placing it too high would hide global providers/shell UI. Source fetched 2026-04-23: https://react.dev/reference/react/Suspense                                                   | Place the boundary around `<Routes>` only, under `BrowserRouter` and `AuthProvider`, and keep fallback dependency-free.                          |
| F10 | LOW      | Build target concerns require extra legacy plugins.                                                           | Vite v8's default `build.target` is `baseline-widely-available`, including browsers from 2026-01-01, and supports native dynamic import for this SPA target. Source fetched 2026-04-23: https://vite.dev/config/build-options.html#build-target                                 | Do not add legacy polyfills or plugins in this blueprint.                                                                                        |

## Abstraction Boundary

This plan is intentionally split into **portable utilities** and
**app-specific routing work** so the useful parts can later be shared with
`~/repos/webpresso` without forcing both repositories into the same router
architecture.

| Concern                            | Portable across `node-pubsub` and `webpresso`? | Boundary                                                                                                                                                                                                                                                                                                         |
| ---------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generated asset budget checking    | Yes                                            | Owned by Agent Kit as `ak audit bundle-budget` plus pure analysis helpers. This repo supplies only app-local thresholds and the built `apps/client/dist` path. The analyzer must not bake in `apps/client`, route names, or Vite chunk prefixes.                                                                 |
| Vite stale dynamic-import recovery | Yes                                            | Owned by Agent Kit as `installChunkLoadRecovery()` from `@webpresso/agent-kit/vite`. This repo only calls it from client bootstrap; the helper remains dependency-free with injectable `target`, `storage`, and `reload` defaults for tests.                                                                     |
| Route-level lazy loading           | No, app-specific                               | This repo uses plain Vite + `BrowserRouter` / `<Routes>`, so `React.lazy` in `App.tsx` is right here. Webpresso's web apps use React Router framework/file routes, existing Vite chunk policy, and SSR/SPA-specific configs; they need a route-module/framework audit instead of copying this `App.tsx` pattern. |
| Budget thresholds                  | Partly                                         | Keep thresholds configurable per app. This repo's target can be strict because the SPA is small; Webpresso dashboards already carry heavier route surfaces and should set app-specific budgets from their measured post-build graph.                                                                             |

**Abstraction rule:** Task 1.1 and Task 1.3 now consume Agent Kit's reusable
Vite guardrails; Task 1.2 remains local to `apps/client`. Do not create a shared
route abstraction, and do not move app-specific budget thresholds into Agent
Kit.

## Key Decisions

| Decision             | Choice                                                                         | Rationale                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Split boundary       | Route-level page modules (F2, F6)                                              | Highest leverage and lowest code churn; current root cause is static route imports                                                          |
| React API            | `React.lazy` + `Suspense` (F2, F3, F5)                                         | Matches current `BrowserRouter` / `Routes` architecture and all pages already default-export components                                     |
| Fallback UI          | Lightweight text fallback inside the route switch (F3, F9)                     | Avoids pulling extra UI primitives or replacing global providers while route code loads                                                     |
| Chunk-load recovery  | Agent Kit `installChunkLoadRecovery()` with once-per-session reload guard (F7) | Code splitting introduces stale-chunk failure mode; Vite documents this event and the reusable helper now lives in the shared agent surface |
| Vite config          | Do not raise `chunkSizeWarningLimit` (F1)                                      | Raising the limit would hide the warning without improving delivery shape                                                                   |
| Manual vendor chunks | Defer (F4, F6)                                                                 | Experiment showed route lazy loading alone gets all chunks under the warning threshold; manual chunks would add policy and side-effect risk |
| Bundle budget        | Agent Kit `ak audit bundle-budget` against generated assets (F4, F8)           | Keeps enforcement reusable and avoids relying on unstable Rollup/Rolldown chunk names                                                       |
| Budget dimensions    | Per-asset JS max + HTML-eager JS individual and aggregate caps (F4, F8)        | Catches both a giant generated chunk and accidental reintroduction of heavy route code into the initial HTML dependency set                 |

## Quick Reference (Execution Waves)

| Wave              | Tasks             | Dependencies | Parallelizable | Effort (T-shirt) |
| ----------------- | ----------------- | ------------ | -------------- | ---------------- |
| **Wave 0**        | 1.1, 1.2, 1.3     | None         | 3 agents       | XS-S             |
| **Wave 1**        | 1.4               | Wave 0       | 1 agent        | XS               |
| **Critical path** | 1.1/1.2/1.3 → 1.4 | —            | 2 waves        | S                |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning                  | Target               | Actual                        |
| ------ | ---------------------------------- | -------------------- | ----------------------------- |
| RW0    | Ready tasks in Wave 0              | ≥ planned agents / 2 | 3 runnable tasks for 3 agents |
| CPR    | total_tasks / critical_path_length | ≥ 2.5                | 4 / 2 = 2.0                   |
| DD     | dependency_edges / total_tasks     | ≤ 2.0                | 3 / 4 = 0.75                  |
| CP     | same-file overlaps per wave        | 0                    | 0                             |

**Parallelization score:** B. CPR misses the generic 2.5 target because this is
a deliberately small client plan; splitting further would create artificial
microtasks and reduce elegance. The important targets for this scope are met:
Wave 0 has useful parallel width, dependency density is low, and same-wave file
conflicts are zero.

---

### Phase 1: Route-level splitting, stale-chunk recovery, and bundle-budget verification [Complexity: S]

#### [guardrail] Task 1.1: Wire Agent Kit bundle-budget audit for the client

**Status:** todo

**Depends:** None

Use Agent Kit as the owner of reusable Vite bundle-budget functionality. The
client repo should only declare app-local thresholds and call `ak audit
bundle-budget` against `apps/client/dist`; it should not create a duplicate
local analyzer. The Agent Kit helper parses `index.html`, resolves HTML-eager JS
assets, checks generated JS asset sizes, and avoids route-name or chunk-prefix
assumptions. (F1, F4, F8)

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml` if the Agent Kit pack/version must be refreshed

**Steps (TDD):**

1. Confirm the installed `@webpresso/agent-kit` exposes `ak audit
bundle-budget` and `@webpresso/agent-kit/vite`; if not, refresh the local
   Agent Kit pack from `~/repos/webpresso/packages/cli/agent-kit` before wiring
   this repo.
2. Add root script:
   - `"client:bundle:check": "ak audit bundle-budget apps/client/dist --max-js-asset-bytes 512000 --max-html-eager-js-asset-bytes 262144 --max-html-eager-js-total-bytes 393216"`
3. Run `pnpm --filter client exec vite build && pnpm client:bundle:check` on
   the current unsplit app — verify it FAILS before Task 1.2 because the single
   JS chunk is over budget.
4. Run `pnpm lint:repo`.

**Acceptance:**

- [ ] No local `scripts/check-client-bundle-budget.ts` or duplicate analyzer is
      added to this repo.
- [ ] `client:bundle:check` uses `ak audit bundle-budget` with explicit
      app-local thresholds.
- [ ] The command exits non-zero against the current unsplit build.
- [ ] Checker output lists all JS asset sizes and the HTML-eager JS total.
- [ ] No route-name, app-path, or generated chunk-prefix assumptions are encoded
      in this repo's script.

---

#### [client] Task 1.2: Lazy-load page routes in `App.tsx`

**Status:** todo

**Depends:** None

Replace static page imports with top-level `lazy()` route declarations and wrap
`<Routes>` in a single `Suspense` boundary. Keep providers, router shell,
toasters, auth wrapper behavior, and route paths unchanged. Do not introduce a
new route configuration abstraction; the smallest correct diff is the elegant
solution here. (F2, F3, F5, F6, F9)

**Files:**

- Modify: `apps/client/src/App.tsx`

**Steps (TDD):**

1. Baseline: run `pnpm --filter client exec vite build` and confirm the current
   large-chunk warning is reproducible before the change.
2. Replace page imports with top-level lazy declarations, for example:
   `const Dashboard = lazy(() => import("./pages/Dashboard"));`.
3. Add `lazy` and `Suspense` from React and wrap only the route switch area, not
   `QueryClientProvider`, `TooltipProvider`, `BrowserRouter`, `AuthProvider`,
   `Toaster`, or `Sonner`.
4. Use a dependency-free fallback such as plain semantic text/markup; do not
   import UI primitives or icons for loading state.
5. Keep every existing `<Route path>` and every `RequireAuth` wrapper identical
   except for rendering lazy page components.
6. Run `pnpm --filter client check-types`.
7. Run `pnpm --filter client lint`.
8. Run `pnpm --filter client exec vite build` and verify the large-chunk warning
   is gone.

**Acceptance:**

- [ ] `apps/client/src/App.tsx` has no static `./pages/*` imports.
- [ ] Lazy declarations are top-level, outside the `App` component, to avoid
      React lazy-state reset hazards.
- [ ] `Suspense` wraps `<Routes>` only; global providers and router/auth shell
      are not inside the fallback boundary.
- [ ] Existing route paths and `RequireAuth` wrappers are unchanged.
- [ ] `pnpm --filter client check-types` passes.
- [ ] `pnpm --filter client lint` passes.
- [ ] `pnpm --filter client exec vite build` passes without the large-chunk warning.

---

#### [resilience] Task 1.3: Install Agent Kit stale dynamic-import recovery

**Status:** todo

**Depends:** None

Route-level code splitting creates dynamic chunks that can fail to load after a
new deployment if an already-open tab references assets removed by the deploy.
Install Agent Kit's `installChunkLoadRecovery()` helper during client bootstrap
instead of adding a repo-local copy. The helper owns idempotent
`vite:preloadError` handling, `preventDefault()`, and once-per-session reload
guarding; this repo only documents the production HTML cache requirement. (F7)

**Files:**

- Modify: `apps/client/src/main.tsx`
- Modify: `package.json` / `pnpm-lock.yaml` only if the Agent Kit pack/version
  must be refreshed

**Steps (TDD):**

1. Confirm `@webpresso/agent-kit/vite` exports `installChunkLoadRecovery` from
   the installed Agent Kit package; if not, refresh the Agent Kit pack first.
2. Import and call `installChunkLoadRecovery()` at the top of
   `apps/client/src/main.tsx` before rendering `<App />`.
3. Add a short adjacent comment or documentation note that production HTML must
   be served with `Cache-Control: no-cache` for Vite's stale-asset recovery model
   to work reliably.
4. Run `pnpm --filter client check-types` and `pnpm --filter client lint`.

**Acceptance:**

- [ ] No local `apps/client/src/lib/chunkLoadRecovery.ts` duplicate is added.
- [ ] `apps/client/src/main.tsx` imports `installChunkLoadRecovery` from
      `@webpresso/agent-kit/vite` and calls it before rendering.
- [ ] `apps/client/src/main.tsx` imports no heavy dependency for recovery.
- [ ] Deployment note about `Cache-Control: no-cache` for HTML is present in a
      code comment or adjacent documentation.
- [ ] `pnpm --filter client check-types` and `pnpm --filter client lint` pass.

---

#### [qa] Task 1.4: Verify production chunk graph and full client gates

**Status:** todo

**Depends:** Task 1.1, Task 1.2, Task 1.3

Run the final verification sequence against the integrated result. This task is
intentionally verify-only unless a gate fails; if a gate fails, fix the owning
file from the failed task and re-run the gate before marking this task done.
(F1-F9)

**Files:**

- Verify only: no source file changes expected unless a gate fails.

**Steps (TDD):**

1. Run `pnpm --filter client check-types`.
2. Run `pnpm --filter client lint`.
3. Run `pnpm --filter client test`.
4. Run `pnpm --filter client exec vite build`.
5. Run `pnpm client:bundle:check`.
6. Inspect build output and `apps/client/dist/index.html` references to confirm:
   - no `Some chunks are larger than 500 kB after minification` warning;
   - no generated JS asset exceeds `512000` bytes;
   - no HTML-eager JS asset exceeds `262144` bytes;
   - HTML-eager JS total is at or below `393216` bytes.
7. Run root verification appropriate to this small client change:
   `pnpm format:check`, `pnpm lint:repo`, and `bun ./scripts/validate-blueprints.ts`.

**Acceptance:**

- [ ] `pnpm --filter client check-types` passes.
- [ ] `pnpm --filter client lint` passes.
- [ ] `pnpm --filter client test` passes.
- [ ] `pnpm --filter client exec vite build` passes without the large-chunk warning.
- [ ] `pnpm client:bundle:check` passes and prints chunk sizes.
- [ ] Root format/lint/blueprint validation gates pass.
- [ ] Any gate failure is fixed in the owning task's files before final completion.

---

## Verification Gates

| Gate                 | Command                                | Success Criteria                                                  |
| -------------------- | -------------------------------------- | ----------------------------------------------------------------- |
| Client type safety   | `pnpm --filter client check-types`     | Zero TypeScript errors                                            |
| Client lint          | `pnpm --filter client lint`            | Zero lint errors/warnings                                         |
| Client tests         | `pnpm --filter client test`            | Passes; no-test workspace exits 0                                 |
| Client build         | `pnpm --filter client exec vite build` | Build exits 0 and does not emit the large-chunk warning           |
| Bundle budget        | `pnpm client:bundle:check`             | Chunk size and HTML-eager budgets pass                            |
| Repo format          | `pnpm format:check`                    | Formatting check passes                                           |
| Repo lint            | `pnpm lint:repo`                       | Repository static lint passes                                     |
| Blueprint validation | `bun ./scripts/validate-blueprints.ts` | Blueprint lifecycle/frontmatter validation passes                 |
| Workspace typecheck  | `pnpm -r --if-present check-types`     | All workspaces pass (run if final owner wants full repo proof)    |
| Workspace test       | `pnpm -r --if-present test`            | All test scripts pass (run if final owner wants full repo proof)  |
| Workspace build      | `pnpm -r --if-present build`           | All build scripts pass (run if final owner wants full repo proof) |

## Cross-Plan References

| Type       | Blueprint                 | Relationship                                                                                                             |
| ---------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Upstream   | Agent Kit Vite guardrails | `ak audit bundle-budget` and `@webpresso/agent-kit/vite` provide the reusable budget/recovery utilities                  |
| Downstream | None                      | Future UI performance work may build on this budget gate                                                                 |
| Related    | `e2e-neon` draft          | Browser-level route-loading smoke coverage remains outside this backend-oriented draft unless it later expands to UI e2e |

## Edge Cases and Error Handling

| Edge Case                                                | Risk                                              | Solution                                                                             | Task |
| -------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------ | ---- |
| Suspense fallback flashes during navigation (F9)         | Medium UX annoyance                               | Keep fallback lightweight and route-scoped; do not suspend global providers          | 1.2  |
| Lazy declaration inside component (F2)                   | State reset on re-render                          | Declare all lazy page constants at module top level                                  | 1.2  |
| Protected route code downloads before auth resolves (F2) | Wasted bytes for unauthenticated users            | Keep `RequireAuth` gating unchanged and render lazy children only when authenticated | 1.2  |
| Vite modulepreload still preloads common deps (F4)       | Misread metrics as a failure                      | Budget HTML-eager assets separately from all generated route chunks                  | 1.1  |
| Generated chunk names change between builds (F8)         | False pass/fail in budget checker                 | Use size and HTML-reference budgets, not route filename prefixes                     | 1.1  |
| Route chunk load failure after deploy (F7)               | Blank page if a stale client loads deleted assets | Install Agent Kit's `vite:preloadError` reload-once recovery                         | 1.3  |
| Reload loop after bad deploy (F7)                        | User gets stuck in repeated reloads               | Guard reload with a session-scoped flag                                              | 1.3  |
| HTML cached while assets are replaced (F7)               | Recovery reload still references stale assets     | Document `Cache-Control: no-cache` requirement for deployed HTML                     | 1.3  |
| Manual vendor splitting changes side-effect order (F6)   | Runtime behavior risk                             | Do not add manual splitting in this blueprint                                        | N/A  |

## Non-goals

- Replacing Recharts or rewriting chart visualizations.
- Migrating to React Router data routers.
- Adding `rollup-plugin-visualizer`, `source-map-explorer`, or other new dependencies.
- Updating Browserslist / `caniuse-lite` data.
- Raising `build.chunkSizeWarningLimit` to hide the warning.
- Introducing SSR, streaming, or server components.
- Adding Playwright/browser e2e coverage in this blueprint.

## Risks

| Risk                                                                      | Impact | Mitigation                                                                                                                            |
| ------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| First navigation to dashboard/metrics now downloads chart chunk on demand | Medium | Intended tradeoff; route fallback keeps UI coherent while chunk loads                                                                 |
| Dynamic chunk missing after deployment (F7)                               | High   | Install Agent Kit's once-per-session `vite:preloadError` recovery and document HTML no-cache requirement                              |
| Bundle budget too strict for future legitimate features (F8)              | Low    | Budgets are app-local script arguments and can be changed with evidence; start from measured post-split values plus explicit headroom |
| Bundle budget too loose to catch initial-regression preloads (F8)         | Medium | Check HTML-eager individual asset and aggregate bytes, not only all-assets max                                                        |
| No browser e2e test coverage for route loading                            | Medium | Use build/type/lint/unit/budget gates now; defer browser smoke coverage to a separate UI e2e plan                                     |

## Technology Choices

| Component           | Technology                             | Version                                          | Why                                                                  |
| ------------------- | -------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| Lazy loading        | React `lazy` + `Suspense`              | React `18.3.1` resolved locally                  | Built-in; no dependency; matches current default-export page modules |
| Routing             | Existing `react-router-dom` components | `^6.26.2` declared, resolved to `6.30.0` locally | Avoids data-router migration for a bundle-only fix                   |
| Build tool          | Vite / Rolldown                        | `vite ^8.0.0`, local `8.0.9`                     | Existing client build surface and warning source                     |
| Budget enforcement  | Agent Kit `ak audit bundle-budget`     | `@webpresso/agent-kit` local pack/version        | Reusable generated-asset guardrail with app-local thresholds         |
| Chunk-load recovery | Agent Kit `installChunkLoadRecovery()` | `@webpresso/agent-kit/vite` local pack/version   | Minimal reusable resilience for the new dynamic-import failure mode  |

## Refinement Summary

| Metric                    | Value                                                                         |
| ------------------------- | ----------------------------------------------------------------------------- |
| Findings total            | 10                                                                            |
| Critical                  | 0                                                                             |
| High                      | 6                                                                             |
| Medium                    | 3                                                                             |
| Low                       | 1                                                                             |
| Fixes applied             | 10/10 in blueprint                                                            |
| Cross-plans updated       | 0; no true downstream dependency found                                        |
| Edge cases documented     | 9                                                                             |
| Risks documented          | 5                                                                             |
| **Parallelization score** | B (3 tasks in Wave 0; no same-wave file conflicts)                            |
| **Critical path**         | 2 waves                                                                       |
| **Max parallel agents**   | 3                                                                             |
| **Total tasks**           | 4                                                                             |
| **Blueprint compliant**   | 4/4 tasks include explicit Depends, Files, TDD steps, and Acceptance criteria |

**Refinement delta (2026-04-23):** The original two-task plan was correct but
too optimistic about stale dynamic-import failures and too brittle about bundle
budget detection. This refinement now moves the reusable Vite guardrails into
Agent Kit, replaces filename-prefix budget assertions with size-based HTML-eager
budget checks, and preserves the elegant core design:
route-level `React.lazy` only, no router migration, no manual vendor chunking,
and no new dependencies.
