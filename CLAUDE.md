# CLAUDE.md

## Tech Stack

- **Runtime:** Cloudflare Workers (Hono framework)
- **DB:** Drizzle ORM + Postgres via Hyperdrive
- **Test runner:** Vitest
- **Type checker:** `tsgo --noEmit` (from `@typescript/native-preview`) — never use `tsc`
- **Package manager:** pnpm workspaces
- **Scripts:** `.ts` files executed via `bun` — never `.mjs`, never `ts-node`
- **Secrets:** Doppler only — no `dotenv`, no `.env` files

## Common Commands

```bash
pnpm --filter @repo/workers test          # run tests
pnpm --filter @repo/workers check-types  # type check
pnpm --filter @repo/workers lint         # lint
pnpm --filter @repo/workers build        # build
```

## Dev Conventions

- **Hard cuts:** delete legacy in the same PR as the replacement — no compat shims, no feature flags
- **Commits:** never append `Co-Authored-By: Claude` or `🤖 Generated with Claude Code` trailers
- **Worktrees:** parallel blueprint lanes run in `.worktrees/<slug>/` on branch `pll/<slug>`; one commit after all verification gates are green

## Test Conventions

These rules exist to prevent specific classes of bugs found in production test code. Follow them exactly.

### Fixtures

**Always use deterministic dates.** Never `new Date()` without an argument — it produces non-deterministic values that cause stochastic test failures when assertions diff full objects.

```ts
// wrong
createdAt: new Date();
// right
createdAt: new Date("2026-01-01");
```

**Freeze all exported fixtures.** Use `deepFreeze` (defined in `helpers.ts`) on every object exported from a test helper file. Shallow `Object.freeze` is insufficient — nested objects and arrays must also be frozen.

```ts
// wrong
export const mockQueue = { id: "queue-1", ... };
// right
export const mockQueue = deepFreeze({ id: "queue-1", ... });
```

Spread+override still works after freeze: `{ ...mockQueue, pushEndpoint: null }` creates a new unfrozen object.

### Mock environment

**Always use `createMockEnv()`** — never define inline env objects with `null as any` casts. This ensures `DELIVERY_QUEUE` and all required `Env` fields are always present and consistently typed.

```ts
// wrong
const mockEnv = { HYPERDRIVE: null as any, JWT_SECRET: "test-secret" };
// right
const mockEnv = createMockEnv();
// right (when asserting on send)
const mockDeliveryQueue = { send: vi.fn() };
const mockEnv = createMockEnv(mockDeliveryQueue);
```

### Chain builders (`helpers.ts`)

**All chain builders take a `rows` parameter**, including update chains. No hardcoded values inside builders.

```ts
// wrong
export function buildUpdateChain() { ... mockResolvedValue([]) ... }
// right
export function buildUpdateChain(rows: unknown[] = []) { ... mockResolvedValue(rows) ... }
```

**Name builders by terminal call:** `buildSelectChain` ends in `.limit()`, `buildUnboundedSelectChain` ends in `.where()` (for `inArray` fan-out queries). Never use opaque suffixes like `Direct`.

### Request builders (`helpers.ts`)

**All request builders accept optional `headers`.** Asymmetric APIs are maintenance traps.

```ts
// wrong — del has no headers param
export function del(path: string): Request;
// right
export function del(path: string, headers: Record<string, string> = {}): Request;
```

### File structure

**All `import` statements appear at the top of the file**, before any `vi.mock()` calls. Vitest hoists `vi.mock()` above imports at transform time, so placing imports after mocks works — but it looks like a bug to every reader. Keep imports at the top.

```ts
// wrong
vi.mock("../db/client", async (importOriginal) => { ... });
import { createDb } from "../db/client";

// right
import { createDb } from "../db/client";
vi.mock("../db/client", async (importOriginal) => { ... });
```

### Test helpers

**No trivial one-liner wrappers.** A function that does exactly one thing with a generic name (`setup()`, `init()`) adds indirection without adding meaning. Call helpers directly.

```ts
// wrong
function setup() { bypassAuth(vi.mocked(authenticate)); }
it("...", () => { setup(); ... })

// right
it("...", () => { bypassAuth(vi.mocked(authenticate)); ... })
```

**No unused default parameters on mock factories.** If every call site provides explicit values, the defaults mislead readers into thinking the parameter is optional.

```ts
// wrong — every call site passes explicit ack/retry anyway
function makeMsg(body: DeliveryPayload, ack = vi.fn(), retry = vi.fn());

// right
function makeMsg(body: DeliveryPayload, ack: Mock, retry: Mock);
```

### Style

**One declaration per line** in test setup code.

```ts
// wrong
const ack1 = vi.fn();
const retry1 = vi.fn();

// right
const ack1 = vi.fn();
const retry1 = vi.fn();
```

**Type response bodies explicitly** — no `as any` on `res.json()`.

```ts
// wrong
const body = (await res.json()) as any;

// right
const body = (await res.json()) as { status: string; data: { token: string } };
```

## FE stack: htmx on Hono SSR (F-18)

The lab UI (`apps/lab/*`) uses **htmx + Hono SSR** — no React, no bundler, no client-side JS framework.
Rationale: the lab is an internal observability tool with minimal interactivity; htmx delivers
hypermedia-driven partial updates (SSE streams, form submissions) directly over HTML fragments,
keeping the Worker bundle small and the mental model simple. Do not add React or a JS build step
to `apps/lab` — htmx on Hono is the deliberate, long-term choice here.

## gstack (REQUIRED — global install)

**Before doing ANY work, verify gstack is installed:**

```bash
test -d ~/.claude/skills/gstack/bin && echo "GSTACK_OK" || echo "GSTACK_MISSING"
```

If GSTACK_MISSING: STOP. Do not proceed. Tell the user:

> gstack is required for all AI-assisted work in this repo.
> Install it:
>
> ```bash
> git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
> cd ~/.claude/skills/gstack && ./setup --team
> ```
>
> Then restart your AI coding tool.

Do not skip skills, ignore gstack errors, or work around missing gstack.

Using gstack skills: After install, skills like /qa, /ship, /review, /investigate,
and /browse are available. Use /browse for all web browsing.
Use ~/.claude/skills/gstack/... for gstack file paths (the global path).
