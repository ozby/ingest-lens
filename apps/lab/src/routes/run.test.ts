import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { runRoutes } from "./run";
import type { Env } from "../env";

// ─── DO stub builders ─────────────────────────────────────────────────────────

function makeLockStub(grantResponse: {
  granted: boolean;
  position?: number;
  etaMs?: number;
}): DurableObjectStub {
  return {
    fetch: vi.fn().mockImplementation(async (_url: string, _init?: RequestInit) => {
      const url = typeof _url === "string" ? _url : String(_url);
      if (url.endsWith("/acquire")) {
        return Response.json({ sessionId: "sid", ...grantResponse });
      }
      if (url.endsWith("/release")) {
        return Response.json({ released: true });
      }
      return new Response("not found", { status: 404 });
    }),
  } as unknown as DurableObjectStub;
}

function makeGaugeStub(grantResponse: {
  granted: boolean;
  activeCount: number;
  retryAfter?: number;
}): DurableObjectStub {
  return {
    fetch: vi.fn().mockImplementation(async (_url: string) => {
      return Response.json(grantResponse);
    }),
  } as unknown as DurableObjectStub;
}

function makeRunnerStub(): DurableObjectStub {
  return {
    fetch: vi.fn().mockResolvedValue(Response.json({ ok: true })),
  } as unknown as DurableObjectStub;
}

function makeNs(stub: DurableObjectStub): DurableObjectNamespace {
  return {
    idFromName: vi.fn().mockReturnValue({ toString: () => "do-id" }),
    get: vi.fn().mockReturnValue(stub),
  } as unknown as DurableObjectNamespace;
}

function makeEnv(
  opts: {
    lockStub?: DurableObjectStub;
    gaugeStub?: DurableObjectStub;
    runnerStub?: DurableObjectStub;
  } = {},
): Env {
  const lockStub = opts.lockStub ?? makeLockStub({ granted: true });
  const gaugeStub = opts.gaugeStub ?? makeGaugeStub({ granted: true, activeCount: 1 });
  const runnerStub = opts.runnerStub ?? makeRunnerStub();
  return {
    SESSION_LOCK: makeNs(lockStub),
    CONCURRENCY_GAUGE: makeNs(gaugeStub),
    S1A_RUNNER: makeNs(runnerStub),
    S1B_RUNNER: makeNs(runnerStub),
    LAB_SESSION_SECRET: "lab-session-test-secret",
    NODE_ENV: "test",
    LAB_S1A_QUEUE: {} as unknown as Queue,
    LAB_S1B_QUEUE: {} as unknown as Queue,
    KILL_SWITCH_KV: {} as unknown as KVNamespace,
    HYPERDRIVE: {} as unknown as Hyperdrive,
    LAB_ASSETS: {} as unknown as Fetcher,
  };
}

function makeApp(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/lab", runRoutes);
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /lab/s1a/run — happy path", () => {
  it("returns 200 with sessionId and streamUrl when lock and gauge granted", async () => {
    const app = makeApp();
    const env = makeEnv();
    const req = new Request("http://localhost/lab/s1a/run", { method: "POST" });
    const res = await app.request(req, undefined, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; sessionId: string; streamUrl: string };
    expect(body.ok).toBe(true);
    expect(body.sessionId).toBeTypeOf("string");
    expect(body.streamUrl).toMatch(/^\/lab\/sessions\/.+\/stream$/);
  });

  it("sets a session cookie on success", async () => {
    const app = makeApp();
    const env = makeEnv();
    const req = new Request("http://localhost/lab/s1a/run", { method: "POST" });
    const res = await app.request(req, undefined, env);
    expect(res.status).toBe(200);
    const setCookieHeader = res.headers.get("set-cookie");
    expect(setCookieHeader).not.toBeNull();
    expect(setCookieHeader).toContain("lab_sid");
  });

  it("calls runner start exactly once", async () => {
    const runnerStub = makeRunnerStub();
    const env = makeEnv({ runnerStub });
    const app = makeApp();
    const req = new Request("http://localhost/lab/s1a/run", { method: "POST" });
    await app.request(req, undefined, env);
    const fetchMock = runnerStub.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls.length).toBe(1);
  });
});

describe("POST /lab/s1a/run — lock held (waiting room)", () => {
  it("returns 200 with waiting-room partial when lock is held", async () => {
    const lockStub = makeLockStub({ granted: false, position: 1, etaMs: 60000 });
    const gaugeStub = makeGaugeStub({ granted: true, activeCount: 1 });
    const env = makeEnv({ lockStub, gaugeStub });
    const app = makeApp();
    const req = new Request("http://localhost/lab/s1a/run", { method: "POST" });
    const res = await app.request(req, undefined, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("lab-waiting-room");
  });

  it("does NOT call gauge acquire when lock is held", async () => {
    const lockStub = makeLockStub({ granted: false, position: 1, etaMs: 60000 });
    const gaugeStub = makeGaugeStub({ granted: true, activeCount: 1 });
    const env = makeEnv({ lockStub, gaugeStub });
    const app = makeApp();
    const req = new Request("http://localhost/lab/s1a/run", { method: "POST" });
    await app.request(req, undefined, env);
    const gaugeNs = env.CONCURRENCY_GAUGE as unknown as { get: ReturnType<typeof vi.fn> };
    expect(gaugeNs.get.mock.calls.length).toBe(0);
  });
});

describe("POST /lab/s1a/run — gauge full (429)", () => {
  it("returns 429 with retryAfter when gauge is full", async () => {
    const gaugeStub = makeGaugeStub({ granted: false, activeCount: 100, retryAfter: 5000 });
    const env = makeEnv({ gaugeStub });
    const app = makeApp();
    const req = new Request("http://localhost/lab/s1a/run", { method: "POST" });
    const res = await app.request(req, undefined, env);
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string; retryAfter: number };
    expect(body.error).toBe("capacity_exceeded");
    expect(body.retryAfter).toBeGreaterThan(0);
  });

  it("releases lock when gauge is full", async () => {
    const lockStub = makeLockStub({ granted: true });
    const gaugeStub = makeGaugeStub({ granted: false, activeCount: 100, retryAfter: 5000 });
    const env = makeEnv({ lockStub, gaugeStub });
    const app = makeApp();
    const req = new Request("http://localhost/lab/s1a/run", { method: "POST" });
    await app.request(req, undefined, env);
    const lockFetchMock = lockStub.fetch as ReturnType<typeof vi.fn>;
    const releaseCalls = lockFetchMock.mock.calls.filter((call: unknown[]) =>
      String(call[0]).endsWith("/release"),
    );
    expect(releaseCalls.length).toBe(1);
  });
});

describe("POST /lab/s1b/run — happy path", () => {
  it("returns 200 with sessionId and streamUrl", async () => {
    const app = makeApp();
    const env = makeEnv();
    const req = new Request("http://localhost/lab/s1b/run", { method: "POST" });
    const res = await app.request(req, undefined, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; sessionId: string; streamUrl: string };
    expect(body.ok).toBe(true);
    expect(body.streamUrl).toMatch(/^\/lab\/sessions\/.+\/stream$/);
  });
});
