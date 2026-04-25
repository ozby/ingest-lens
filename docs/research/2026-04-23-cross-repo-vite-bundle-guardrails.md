---
type: research
title: "Cross-repo Vite bundle guardrails and route-splitting abstraction"
subject: "Abstracting Vite/React bundle-budget checks and stale dynamic-import recovery across node-pubsub and Webpresso while keeping route splitting app-specific"
date: 2026-04-23
last_updated: "2026-04-25"
confidence: high
verdict: adopt-agent-kit-budget-cli-only
---

# Cross-repo Vite bundle guardrails and route-splitting abstraction

> **Status update (2026-04-25):** Only the bundle-budget CLI path shipped
> (`ak audit bundle-budget`). The dynamic-import recovery helper was inlined
> directly in `apps/client/src/main.tsx` instead of being consumed from
> `@webpresso/agent-kit/vite`, so this repo no longer imports the library
> form. The original analysis below is preserved as a record; treat the
> "import `installChunkLoadRecovery` from Agent Kit" prescription as
> superseded.

> Put the bundle-budget utilities in Agent Kit; do not share the
> route-splitting patch itself.

## TL;DR

- The abstraction is viable if the shared layer is **Vite build-output analysis** plus **Vite dynamic-import failure recovery**, not a common React routing implementation.
- `node-pubsub` is a plain Vite SPA with `BrowserRouter` / `<Routes>`, so `React.lazy` at page-route boundaries is appropriate; Webpresso web apps use React Router framework/file routes, which already provide route-module code splitting.
- The strongest reusable artifact is now owned by Agent Kit: `ak audit bundle-budget` plus pure `analyzeBundleBudget(options)` helpers that accept built assets, HTML entry content, asset budgets, and ignore rules.
- The second reusable artifact is now owned by Agent Kit: `installChunkLoadRecovery({ target, storage, reload })` from `@webpresso/agent-kit/vite` for Vite `vite:preloadError` recovery.
- Recommendation: **adopt Agent Kit as the shared guardrail owner** while keeping route splitting and budget thresholds app-local.

## What This Is

This research evaluates whether the current `client-route-code-splitting` plan in `node-pubsub` can be designed so parts of it are reusable in `~/repos/webpresso`. The concrete candidate abstractions are:

1. a Vite/Rolldown build-output budget checker,
2. a browser-side stale dynamic-import recovery helper,
3. and route-level React code splitting.

The key distinction is between **build/runtime guardrails** and **routing architecture**. Guardrails can be made portable because both repos use Vite-derived builds. Routing cannot be shared directly because the repos use different routing modes and output structures.

## State of the Art (2026)

Vite 8 makes the relevant boundary clear. Its docs say the default large-chunk warning is based on uncompressed chunk size, with `build.chunkSizeWarningLimit` defaulting to `500` kB and compared against JavaScript size because execution time matters [Vite build options](https://vite.dev/config/build-options.html#build-chunksizewarninglimit). Vite also computes modulepreload dependency lists for dynamic imports, so a correct budget checker must understand HTML-eager assets and preload dependencies rather than assuming dynamic import means “not referenced anywhere up front” [Vite modulePreload](https://vite.dev/config/build-options.html#build-modulepreload).

For the `node-pubsub` routing patch, React's canonical API is still `lazy()` plus `Suspense`: `lazy` defers loading component code until first render and expects a default export [React lazy](https://react.dev/reference/react/lazy); `Suspense` provides fallback UI while lazy-loaded code suspends [React Suspense](https://react.dev/reference/react/Suspense). That maps well to `apps/client/src/App.tsx`, where all page modules currently default-export components.

For Webpresso, React Router framework mode changes the right answer. React Router's framework docs state that applications using framework features are automatically code split by route module: route modules become bundler entry points and only bundles needed for the visited URL are loaded [React Router automatic code splitting](https://reactrouter.com/main/explanation/code-splitting). Older React Router v6 route `lazy` is only for data routers, and route-lazy files export route-object properties rather than default components [React Router v6 lazy](https://reactrouter.com/6.30.3/route/lazy). That supports the conclusion that Webpresso should not copy a plain `BrowserRouter` `React.lazy` patch.

Performance budgets remain a mainstream guardrail. MDN defines a performance budget as a limit to prevent regressions and explicitly includes file, file-type, page-total, timing, and rule-based budgets [MDN performance budgets](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Performance_budgets). web.dev recommends starting with asset-size budgets early and later adding user-centric metrics, and it lists build/CI enforcement patterns including Lighthouse and bundlesize [web.dev performance budgets](https://web.dev/articles/performance-budgets-101), [web.dev build budgets](https://web.dev/articles/incorporate-performance-budgets-into-your-build-tools).

Deployment resilience is also a first-class concern. Vite documents `vite:preloadError` for failed dynamic imports and says stale deployments can leave browsers referencing deleted old chunks; it recommends reloading and serving HTML with `Cache-Control: no-cache` [Vite load error handling](https://vite.dev/guide/build#load-error-handling). Cloudflare's static-assets docs confirm Workers cache static assets globally [Cloudflare static assets](https://developers.cloudflare.com/workers/static-assets/), and Cloudflare's gradual-rollout guidance warns that fingerprinted asset filenames can mismatch across versions and produce 404s unless version affinity or monitoring is used [Cloudflare gradual rollouts](https://developers.cloudflare.com/workers/static-assets/routing/advanced/gradual-rollouts/).

## Positive Signals

### Portable budget enforcement is well-supported

- Performance budgets are explicitly meant to prevent regressions and can apply to asset files, file types, full pages, and user-facing timings [MDN performance budgets](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Performance_budgets). Credibility: high, neutral-positive.
- web.dev recommends adding budgets to the build process and notes that uncompressed JavaScript size is related to execution time, especially on mobile [web.dev build budgets](https://web.dev/articles/incorporate-performance-budgets-into-your-build-tools). Credibility: high, positive.
- Vite's own chunk-size warning is uncompressed and build-output based [Vite build options](https://vite.dev/config/build-options.html#build-chunksizewarninglimit), so a repo-owned build-output checker is aligned with the tool's own signal rather than inventing an unrelated metric. Credibility: high, positive.

### The utility shape can be framework-neutral

- A budget checker that parses built `index.html` and `assets/*.js` can work for the plain SPA output in `node-pubsub` and for Webpresso's React Router framework builds, provided output directories and thresholds are configurable.
- Vite exposes the relevant semantics at build-output level: modulepreload dependency lists are computed for dynamic imports and HTML-imported chunks [Vite modulePreload](https://vite.dev/config/build-options.html#build-modulepreload). This argues for a generic analyzer over output assets, not source-route-name heuristics.
- Existing local stack facts support the same utility style: `node-pubsub` uses Bun root scripts and Vite 8 in `apps/client`; Webpresso uses Vite 8, React Router 7 framework apps, and existing bundle-related infrastructure such as `rollup-plugin-visualizer` in `apps/web/platform-web/vite.config.ts`.

### Stale dynamic-import recovery is portable and justified

- Vite directly documents the `vite:preloadError` event and the stale-deploy failure mode for deleted dynamic chunks [Vite load error handling](https://vite.dev/guide/build#load-error-handling). Credibility: high, positive.
- Cloudflare documents a related fingerprinted-asset mismatch risk during gradual rollouts and recommends version affinity, testing, and 404 monitoring [Cloudflare gradual rollouts](https://developers.cloudflare.com/workers/static-assets/routing/advanced/gradual-rollouts/). Credibility: high, positive.
- Because this helper can be dependency-free and DOM-only, it can be installed in `node-pubsub`'s `main.tsx` and later in a Webpresso app entry/root without importing React, app-shell code, or router APIs.

### Route splitting remains correct locally

- For `node-pubsub`, React's docs support top-level `lazy()` declarations and `Suspense` boundaries for default-exported page modules [React lazy](https://react.dev/reference/react/lazy), [React Suspense](https://react.dev/reference/react/Suspense). Credibility: high, positive.
- The local `node-pubsub` blueprint already measured that route-level lazy loading removes the large-chunk warning and keeps the chart chunk below Vite's default threshold. This is strong local evidence, even though it is not a general Webpresso routing prescription.

## Negative Signals

### Route-level abstraction would be the wrong reuse boundary

- React Router framework mode already code splits route modules automatically [React Router automatic code splitting](https://reactrouter.com/main/explanation/code-splitting). Copying `BrowserRouter`-style `React.lazy` route wrappers into Webpresso would duplicate or fight the framework model.
- React Router v6 route `lazy` is tied to data routers and route-object exports, not default component exports [React Router v6 lazy](https://reactrouter.com/6.30.3/route/lazy). That means even within React Router, “lazy route” APIs are mode-specific.
- Webpresso has multiple web apps with different rendering and deployment modes: `platform-web` and `admin-web` are React Router apps with dashboard-heavy dependencies; `website` uses React Router with Cloudflare/Vite integration and SSR/full-rendering concerns. A single source-level route-splitting abstraction would hide important differences.

### Budgets must not become universal magic numbers

- MDN says budgets should reflect reachable goals and product trade-offs [MDN performance budgets](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Performance_budgets). A strict `node-pubsub` SPA threshold may be appropriate for a portfolio dashboard but too blunt for Webpresso's dashboard surfaces.
- Webpresso already has app-specific Vite chunk policy: `platform-web` sets `chunkSizeWarningLimit: 600` and manual chunks; `admin-web` sets `chunkSizeWarningLimit: 1000`. That is evidence that a shared utility must accept per-app thresholds and should not impose one global limit.
- web.dev recommends pairing quantity budgets with user-centric timings over time [web.dev performance budgets](https://web.dev/articles/performance-budgets-101). A build-output checker alone is useful but incomplete for Webpresso's user-facing PMF loop.

### Dynamic-import recovery does not replace deployment hygiene

- Vite's recovery guidance depends on HTML cache behavior: stale HTML can keep referencing old assets unless HTML is served with `Cache-Control: no-cache` [Vite load error handling](https://vite.dev/guide/build#load-error-handling). A reload helper is only a last-mile UX guard.
- Cloudflare warns that fingerprinted asset mismatches can occur during versioned/gradual Worker deployments and recommends version affinity and monitoring [Cloudflare gradual rollouts](https://developers.cloudflare.com/workers/static-assets/routing/advanced/gradual-rollouts/). Reload-once recovery is not sufficient for all rollout modes.
- A helper that reloads on any preload error must be loop-guarded and observable; otherwise it can hide deploy bugs or create poor UX after a bad deploy.

### Community sentiment around React Router is mixed

- Community sentiment supports lazy route splitting and bundle analysis as practical optimizations, but it is not unanimous about React Router complexity. One r/reactjs practitioner reported reducing a gzipped bundle from 520 KB to about 360 KB and said route lazy loading was their main optimization, with analyzer tooling used to find remaining bloat [Reddit bundle-size discussion](https://www.reddit.com/r/reactjs/comments/1nkiwn0/how_much_is_your_production_bundle_size_what_size/). Credibility: medium, positive anecdote.
- React Router v7/framework sentiment includes criticism of docs and mode complexity. A detailed r/reactjs thread complains that docs need clearer explanation of “component routing, data router, v7 framework route modules,” while another commenter still calls the automatic code splitting, type safety, SSR, and related features valuable [Reddit React Router v7 thread](https://www.reddit.com/r/reactjs/comments/1iatblk/react_router_v7_has_to_be_a_psyop/). Credibility: medium, mixed anecdotal.
- Cloudflare static caching sentiment is broadly aligned with official guidance but still anecdotal: a statichosting thread treats “HTML no-cache, hashed JS/CSS long cache” as a solid pattern, while acknowledging route-specific freshness trade-offs [Reddit Cloudflare caching thread](https://www.reddit.com/r/statichosting/comments/1qvqi6a/best_practices_for_caching_multiroute_static/). Credibility: medium-low, positive but anecdotal.

## Community Sentiment

The practitioner signal is pragmatic: teams care about bundle budgets when they have concrete numbers and build artifacts, not abstract purity.

From the r/reactjs bundle-size thread:

> “I was already doing lazy loading on all my routes…”

The same comment pairs route lazy loading with analyzer-driven dependency cleanup, which supports a two-layer strategy: split high-level routes, then enforce/inspect bundle output [Reddit bundle-size discussion](https://www.reddit.com/r/reactjs/comments/1nkiwn0/how_much_is_your_production_bundle_size_what_size/).

React Router framework sentiment is more conflicted. In the v7 thread, a critic says:

> “the documentation is confusing”

but another detailed reply argues that framework features provide automatic code splitting, type safety, SSR, and related modernization value [Reddit React Router v7 thread](https://www.reddit.com/r/reactjs/comments/1iatblk/react_router_v7_has_to_be_a_psyop/). The practical takeaway is not “avoid React Router”; it is “do not abstract across React Router modes casually.”

On Cloudflare/static hosting, the community pattern is consistent with official Vite/Cloudflare docs: hashed assets can be cached long-lived, while HTML needs freshness controls. One Cloudflare caching discussion says the existing pattern of HTML no-cache plus immutable hashed assets is “already a very solid setup” [Reddit Cloudflare caching thread](https://www.reddit.com/r/statichosting/comments/1qvqi6a/best_practices_for_caching_multiroute_static/).

## Project Alignment

### Vision Fit

For `node-pubsub`, this aligns strongly with the repo vision. The vision says the repo is a portfolio-grade system where “the process is the product”: blueprints, fact-checks, guardrails, truth labels, and measurable gates demonstrate senior engineering judgment. A small build-output budget checker and explicit stale-chunk recovery are exactly the kind of guardrail discipline the vision rewards. It also keeps the plan honest: route splitting is marked as app-local, while reusable utilities are marked extraction-ready.

For Webpresso, the fit is also strong but different. Webpresso's vision is to help founders move through the “idea -> app -> users -> signal -> decision” loop while hiding technical complexity without hiding control. Shared bundle guardrails support that by keeping generated and dashboard apps fast enough to support PMF learning, while leaving app-specific budgets and route architecture visible to operators. The Webpresso vision also says defaults should be smart and opinionated, with advanced/operator knobs behind the scenes; a configurable budget helper fits that model better than per-app bespoke scripts.

### Tech Stack Fit

`node-pubsub` stack fit:

- Root scripts already use Bun for repository checks.
- `apps/client` uses Vite 8, React 18, `react-router-dom` v6, and a plain `BrowserRouter` / `<Routes>` entry point.
- `@webpresso/agent-kit` is already a root dev dependency, so the repo should call `ak audit bundle-budget` instead of adding a duplicate local analyzer script.
- `React.lazy` route splitting fits because page modules default export components.

Webpresso stack fit:

- Webpresso uses Vite 8, pnpm catalogs, React 19, React Router 7 framework apps, Cloudflare/Vite integration, and heavier dashboard dependencies such as Recharts, FullCalendar, XTerm, GraphiQL, and React Flow.
- `platform-web` already has Vite manual chunk policy and `rollup-plugin-visualizer`; `admin-web` has a higher chunk warning limit. This means the reusable checker must be configurable and must not overwrite app-specific Vite policy.
- Webpresso's React Router framework route modules already participate in automatic route code splitting, so the relevant Webpresso work is route-module auditing and budget enforcement, not `App.tsx`-style `React.lazy` conversion.

### Trade-offs for Current Stage

- **Best immediate trade-off:** use Agent Kit for generic Vite guardrails now, because it is already the consumer-owned cross-repo agent surface and this repo already depends on it.
- **Keep thresholds local:** reuse code, not numbers. `node-pubsub` can use strict SPA thresholds; Webpresso should derive thresholds from measured route graphs and business-critical pages.
- **Do not overfit to Vite's current filenames:** Vite/Rolldown chunk names are build artifacts. The checker should reason over HTML references and byte sizes, not route-name prefixes.
- **Treat recovery as defense-in-depth:** install `vite:preloadError` recovery, but also document HTML cache headers, Cloudflare version-affinity concerns, and asset 404 monitoring for production systems.
- **Avoid app runtime coupling through route abstractions:** Agent Kit may provide a tiny bundled helper, but it should not own React route layout or page-splitting policy.

## Recommendation

**Verdict: adopt Agent Kit guardrails, high confidence.**

Proceed with the updated boundary:

1. In Agent Kit, own the reusable bundle checker:
   - `ak audit bundle-budget <dist> --max-js-asset-bytes ...`
   - `analyzeBundleBudget(options)`
   - `analyzeViteDistBundleBudget(options)`
   - `formatBundleBudgetReport(result)`
2. In Agent Kit, own the dependency-free dynamic-import recovery helper:
   - `installChunkLoadRecovery({ target, storage, reload, key })`
3. In `node-pubsub`, consume those utilities:
   - root script calls `ak audit bundle-budget apps/client/dist ...` with app-local thresholds;
   - `apps/client/src/main.tsx` imports `installChunkLoadRecovery` from `@webpresso/agent-kit/vite`.
4. Keep `React.lazy` route conversion local to `apps/client/src/App.tsx`.
5. In Webpresso, trial `ak audit bundle-budget` against `platform-web` with thresholds derived from its measured build graph.

The recommendation would change to **hold** only if Webpresso's React Router framework output needs manifest-aware analysis that cannot be represented as generic built-asset/HTML-reference checks. It would change from **guardrail adopt** to **broader adopt** after one Webpresso web app consumes the same Agent Kit API with no special cases beyond config.

## Sources

1. [Vite build options](https://vite.dev/config/build-options.html#build-chunksizewarninglimit) — official docs, high credibility, positive/neutral. Used for chunk warning threshold, modulepreload behavior, and build-output semantics.
2. [Vite building for production: load error handling](https://vite.dev/guide/build#load-error-handling) — official docs, high credibility, positive/neutral. Used for `vite:preloadError`, stale deploy behavior, reload guidance, and HTML no-cache requirement.
3. [React `lazy`](https://react.dev/reference/react/lazy) — official docs, high credibility, positive. Used for local `React.lazy` feasibility and default-export requirement.
4. [React `Suspense`](https://react.dev/reference/react/Suspense) — official docs, high credibility, positive/neutral. Used for fallback behavior and boundary placement risks.
5. [React Router automatic code splitting](https://reactrouter.com/main/explanation/code-splitting) — official docs, high credibility, positive. Used for Webpresso framework-mode route splitting behavior.
6. [React Router v6 route `lazy`](https://reactrouter.com/6.30.3/route/lazy) — official docs, high credibility, neutral. Used to distinguish data-router route lazy from plain component lazy.
7. [MDN Performance budgets](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Performance_budgets) — documentation guide, high credibility, positive. Used for budget definition and warning/error levels.
8. [web.dev Performance budgets 101](https://web.dev/articles/performance-budgets-101) — Chrome/web.dev guide, high credibility, positive. Used for baseline budgeting and combining asset/user-centric metrics.
9. [web.dev Incorporate performance budgets into your build process](https://web.dev/articles/incorporate-performance-budgets-into-your-build-tools) — Chrome/web.dev guide, high credibility, positive. Used for build/CI enforcement and compressed vs uncompressed discussion.
10. [Cloudflare Workers static assets](https://developers.cloudflare.com/workers/static-assets/) — official docs, high credibility, positive/neutral. Used for Cloudflare static asset caching behavior.
11. [Cloudflare Workers gradual rollouts](https://developers.cloudflare.com/workers/static-assets/routing/advanced/gradual-rollouts/) — official docs, high credibility, cautionary. Used for fingerprinted-asset mismatch and version-affinity risks.
12. [Reddit: production bundle size discussion](https://www.reddit.com/r/reactjs/comments/1nkiwn0/how_much_is_your_production_bundle_size_what_size/) — community anecdote, medium credibility, positive. Used for practitioner sentiment around lazy routes and analyzers.
13. [Reddit: React Router v7 discussion](https://www.reddit.com/r/reactjs/comments/1iatblk/react_router_v7_has_to_be_a_psyop/) — community discussion, medium credibility, mixed. Used for practitioner concerns about React Router mode/docs complexity and positive claims about framework capabilities.
14. [Reddit: Cloudflare multi-route static caching](https://www.reddit.com/r/statichosting/comments/1qvqi6a/best_practices_for_caching_multiroute_static/) — community anecdote, medium-low credibility, positive/cautionary. Used for practitioner sentiment about HTML freshness and immutable hashed assets.
15. `docs/research/product/VISION.md` in `node-pubsub` — local project vision, high project relevance, positive. Used for portfolio/guardrail alignment.
16. `docs/research/product/VISION.md` in `~/repos/webpresso` — local project vision, high project relevance, positive. Used for launch/PMF loop and “hide complexity without hiding control” alignment.
17. Local package/config files in both repos — repo evidence, high project relevance, neutral. Used for stack fit: Vite versions, React Router modes, existing Bun scripts, Webpresso chunk policies, and app boundaries.
