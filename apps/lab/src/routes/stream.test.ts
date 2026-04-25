import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { streamRoutes } from "./stream";
import { buildCookieValue } from "../middleware/session-cookie";
import type { Env } from "../env";

const LAB_SESSION_SECRET = "test-lab-session-secret";

async function makeCookie(sessionId: string): Promise<string> {
  const val = await buildCookieValue(sessionId, LAB_SESSION_SECRET);
  return `lab_sid=${val}`;
}

function makeRunnerStub(
  statePhase: string | null,
  events: Array<{ type: string; eventId: string; sessionId: string }> = [],
): DurableObjectStub {
  return {
    fetch: vi.fn().mockResolvedValue(
      Response.json({
        state: statePhase !== null ? { phase: statePhase } : null,
        events,
      }),
    ),
  } as unknown as DurableObjectStub;
}

function makeNs(stub: DurableObjectStub): DurableObjectNamespace {
  return {
    idFromName: vi.fn().mockReturnValue({ toString: () => "do-id" }),
    get: vi.fn().mockReturnValue(stub),
  } as unknown as DurableObjectNamespace;
}

function makeEnv(runnerStub: DurableObjectStub): Env {
  return {
    SESSION_LOCK: makeNs({} as DurableObjectStub),
    CONCURRENCY_GAUGE: makeNs({} as DurableObjectStub),
    S1A_RUNNER: makeNs(runnerStub),
    S1B_RUNNER: makeNs({} as DurableObjectStub),
    LAB_SESSION_SECRET,
    LAB_RUN_TOKEN: "test-run-token",
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
  app.route("/lab", streamRoutes);
  return app;
}

describe("GET /lab/sessions/:id/stream", () => {
  it("returns 403 when no session cookie", async () => {
    const runnerStub = makeRunnerStub("idle");
    const app = makeApp();
    const env = makeEnv(runnerStub);
    const req = new Request("http://localhost/lab/sessions/test-sid/stream");
    const res = await app.request(req, undefined, env);
    expect(res.status).toBe(403);
  });

  it("returns 403 when cookie signed with wrong secret", async () => {
    const sessionId = "test-session-wrong-secret";
    const wrongCookie = await buildCookieValue(sessionId, "wrong-secret");
    const runnerStub = makeRunnerStub("idle");
    const app = makeApp();
    const env = makeEnv(runnerStub);
    const req = new Request(`http://localhost/lab/sessions/${sessionId}/stream`, {
      headers: { cookie: `lab_sid=${wrongCookie}` },
    });
    const res = await app.request(req, undefined, env);
    expect(res.status).toBe(403);
  });

  it("returns 403 when cookie sessionId does not match path param", async () => {
    const sessionId = "session-a";
    const cookie = await makeCookie(sessionId);
    const runnerStub = makeRunnerStub("idle");
    const app = makeApp();
    const env = makeEnv(runnerStub);
    const req = new Request("http://localhost/lab/sessions/session-b/stream", {
      headers: { cookie },
    });
    const res = await app.request(req, undefined, env);
    expect(res.status).toBe(403);
  });

  it("returns 404 when session does not exist (null state)", async () => {
    const sessionId = "nonexistent-session";
    const cookie = await makeCookie(sessionId);
    const runnerStub = makeRunnerStub(null);
    const app = makeApp();
    const env = makeEnv(runnerStub);
    const req = new Request(`http://localhost/lab/sessions/${sessionId}/stream`, {
      headers: { cookie },
    });
    const res = await app.request(req, undefined, env);
    expect(res.status).toBe(404);
  });

  it("returns SSE stream with correct content-type for valid session", async () => {
    const sessionId = "live-session";
    const cookie = await makeCookie(sessionId);
    const completedEvents = [
      {
        type: "run_completed",
        eventId: "run-done-live-session",
        sessionId: "live-session",
        totalDelivered: 1000,
        totalInversions: 0,
        durationMs: 1234,
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    ];
    const runnerStub = makeRunnerStub("completed", completedEvents);
    const app = makeApp();
    const env = makeEnv(runnerStub);
    const req = new Request(`http://localhost/lab/sessions/${sessionId}/stream`, {
      headers: { cookie },
    });
    const res = await app.request(req, undefined, env);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });
});
