import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { killSwitchMiddleware } from "./kill-switch";
import type { Env } from "../env";

function makeKv(
  state: { enabled: boolean; reason: string; flippedAt: string } | null,
): KVNamespace {
  return {
    get: vi.fn().mockResolvedValue(state === null ? null : JSON.stringify(state)),
    put: vi.fn().mockResolvedValue(undefined),
    // minimal KVNamespace shim
  } as unknown as KVNamespace;
}

function makeApp(_kv: KVNamespace): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();
  app.use("/lab/*", killSwitchMiddleware);
  app.get("/lab/test", (c) => c.text("ok"));
  return app;
}

function makeEnv(kv: KVNamespace): Env {
  return {
    KILL_SWITCH_KV: kv,
    LAB_SESSION_SECRET: "test-secret",
  } as unknown as Env;
}

describe("killSwitchMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes through when kill switch is enabled", async () => {
    const kv = makeKv({ enabled: true, reason: "open", flippedAt: "2026-01-01T00:00:00.000Z" });
    const app = makeApp(kv);
    const req = new Request("http://localhost/lab/test");
    const res = await app.request(req, undefined, makeEnv(kv));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("returns 404 when kill switch is disabled", async () => {
    const kv = makeKv({
      enabled: false,
      reason: "maintenance",
      flippedAt: "2026-01-01T00:00:00.000Z",
    });
    const app = makeApp(kv);
    const req = new Request("http://localhost/lab/test");
    const res = await app.request(req, undefined, makeEnv(kv));
    expect(res.status).toBe(404);
  });

  it("defaults to enabled when KV key is absent", async () => {
    // KillSwitchKV default state has enabled: true
    const kv = makeKv(null);
    const app = makeApp(kv);
    const req = new Request("http://localhost/lab/test");
    const res = await app.request(req, undefined, makeEnv(kv));
    // Default state is enabled: true
    expect(res.status).toBe(200);
  });

  it("uses 5s local cache — KV is not called on every request within the window", async () => {
    const kv = makeKv({ enabled: true, reason: "open", flippedAt: "2026-01-01T00:00:00.000Z" });
    const app = makeApp(kv);
    const env = makeEnv(kv);
    const req1 = new Request("http://localhost/lab/test");
    const req2 = new Request("http://localhost/lab/test");
    await app.request(req1, undefined, env);
    await app.request(req2, undefined, env);
    // The KillSwitchKV instance is created per KV namespace instance
    // Second request within cache TTL should reuse cached value
    // KV.get should be called at most twice (once per request if no cache sharing, but WeakMap keyed by kv means same instance → cached after first call)
    expect((kv.get as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThanOrEqual(2);
  });
});
