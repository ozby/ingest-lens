import { describe, it, expect, vi } from "vitest";
import { runHeartbeat, InMemoryHeartbeatStore } from "./heartbeat";
import type { HeartbeatDeps } from "./heartbeat";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockKV(): {
  get(k: string): Promise<string | null>;
  put(k: string, v: string): Promise<void>;
  _store: Map<string, string>;
} {
  const store = new Map<string, string>();
  return {
    _store: store,
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}

function makeDeps(overrides: Partial<HeartbeatDeps> = {}): HeartbeatDeps {
  return {
    store: new InMemoryHeartbeatStore(),
    kv: createMockKV(),
    webhookUrl: "https://hooks.example.com/lab",
    adminSecret: "test-admin-secret",
    baseUrl: "https://lab.example.com",
    now: "2026-01-01T00:00:00.000Z",
    fetch: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runHeartbeat — daily kind", () => {
  it("writes an OK row when health endpoint returns 200", async () => {
    const deps = makeDeps();
    const row = await runHeartbeat(deps, "daily");
    expect(row.status).toBe("OK");
    expect(row.kind).toBe("daily");
    expect(row.ts).toBe("2026-01-01T00:00:00.000Z");
  });

  it("hits /lab/health with workloadSize=100 for daily kind", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const deps = makeDeps({ fetch: fetchMock });
    await runHeartbeat(deps, "daily");
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("workloadSize=100");
  });

  it("writes a FAILED row when health endpoint returns 503", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const deps = makeDeps({ fetch: fetchMock });
    const row = await runHeartbeat(deps, "daily");
    expect(row.status).toBe("FAILED");
    expect(row.failureReason).toBe("HTTP 503");
  });

  it("writes a FAILED row when fetch throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network error"));
    const deps = makeDeps({ fetch: fetchMock });
    const row = await runHeartbeat(deps, "daily");
    expect(row.status).toBe("FAILED");
    expect(row.failureReason).toBe("network error");
  });

  it("appends the row to the store", async () => {
    const store = new InMemoryHeartbeatStore();
    const deps = makeDeps({ store });
    await runHeartbeat(deps, "daily");
    expect(store.all()).toHaveLength(1);
    expect(store.all()[0]?.status).toBe("OK");
  });
});

describe("runHeartbeat — weekly kind", () => {
  it("hits /lab/health with workloadSize=10000 for weekly kind", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const deps = makeDeps({ fetch: fetchMock });
    await runHeartbeat(deps, "weekly");
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("workloadSize=10000");
  });

  it("records kind=weekly on the row", async () => {
    const deps = makeDeps();
    const row = await runHeartbeat(deps, "weekly");
    expect(row.kind).toBe("weekly");
  });
});

describe("runHeartbeat — consecutive failure webhook", () => {
  it("does NOT send webhook on first failure", async () => {
    const webhookFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const store = new InMemoryHeartbeatStore();

    // Patch: first call (health) fails, no webhook call expected
    let callCount = 0;
    const combinedFetch = vi.fn().mockImplementation((url: string, _init?: RequestInit) => {
      callCount++;
      if (url.includes("/lab/health")) {
        return Promise.resolve({ ok: false, status: 503 });
      }
      return webhookFetch(url, _init);
    });

    const deps = makeDeps({ fetch: combinedFetch, store });
    await runHeartbeat(deps, "daily");
    expect(webhookFetch).not.toHaveBeenCalled();
  });

  it("sends webhook after three consecutive FAILs", async () => {
    const store = new InMemoryHeartbeatStore();
    const webhookCalls: string[] = [];

    const fetchMock = vi.fn().mockImplementation((url: string, _init?: RequestInit) => {
      if (url.includes("/lab/health")) return Promise.resolve({ ok: false, status: 503 });
      webhookCalls.push(url);
      return Promise.resolve({ ok: true, status: 200 });
    });

    const deps = makeDeps({ fetch: fetchMock, store, webhookUrl: "https://hooks.example.com/lab" });

    // tick 1 and 2 — no webhook
    await runHeartbeat({ ...deps, now: "2026-01-01T00:01:00.000Z" }, "daily");
    await runHeartbeat({ ...deps, now: "2026-01-01T00:02:00.000Z" }, "daily");
    expect(webhookCalls).toHaveLength(0);

    // tick 3 — webhook fires
    await runHeartbeat({ ...deps, now: "2026-01-01T00:03:00.000Z" }, "daily");
    expect(webhookCalls).toHaveLength(1);
    expect(webhookCalls[0]).toBe("https://hooks.example.com/lab");
  });

  it("does NOT send duplicate webhook on alternating FAIL/OK/FAIL", async () => {
    const store = new InMemoryHeartbeatStore();
    const webhookCalls: string[] = [];

    const fetchMock = vi.fn().mockImplementation((url: string, _init?: RequestInit) => {
      if (url.includes("/lab/health")) {
        // Determine tick by checking how many health calls have been made
        const healthCalls = fetchMock.mock.calls.filter((c) =>
          (c[0] as string).includes("/lab/health"),
        ).length;
        // 1st=FAIL, 2nd=OK, 3rd=FAIL
        const isOk = healthCalls === 2;
        return Promise.resolve({ ok: isOk, status: isOk ? 200 : 503 });
      }
      webhookCalls.push(url as string);
      return Promise.resolve({ ok: true, status: 200 });
    });

    const deps = makeDeps({ fetch: fetchMock, store });
    await runHeartbeat({ ...deps, now: "2026-01-01T00:01:00.000Z" }, "daily"); // FAIL
    await runHeartbeat({ ...deps, now: "2026-01-01T00:02:00.000Z" }, "daily"); // OK
    await runHeartbeat({ ...deps, now: "2026-01-01T00:03:00.000Z" }, "daily"); // FAIL

    expect(webhookCalls).toHaveLength(0);
  });

  it("webhook payload includes scenario name, last 3 heartbeat IDs, failure reasons", async () => {
    const store = new InMemoryHeartbeatStore();
    let webhookPayload: unknown = null;

    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/lab/health")) return Promise.resolve({ ok: false, status: 503 });
      webhookPayload = JSON.parse((init as RequestInit & { body: string }).body);
      return Promise.resolve({ ok: true, status: 200 });
    });

    const deps = makeDeps({ fetch: fetchMock, store });
    await runHeartbeat({ ...deps, now: "2026-01-01T00:01:00.000Z" }, "daily");
    await runHeartbeat({ ...deps, now: "2026-01-01T00:02:00.000Z" }, "daily");
    await runHeartbeat({ ...deps, now: "2026-01-01T00:03:00.000Z" }, "daily");

    expect(webhookPayload).not.toBeNull();
    const payload = webhookPayload as {
      scenario: string;
      lastHeartbeatIds: string[];
      failureReasons: string[];
    };
    expect(payload.scenario).toBe("s1a-correctness");
    expect(payload.lastHeartbeatIds).toHaveLength(3);
    expect(payload.failureReasons).toHaveLength(3);
  });

  it("does not send webhook when webhookUrl is not configured", async () => {
    const store = new InMemoryHeartbeatStore();
    const fetchMock = vi.fn().mockImplementation((_url: string) => {
      return Promise.resolve({ ok: false, status: 503 });
    });

    const deps = makeDeps({ fetch: fetchMock, store, webhookUrl: undefined });
    await runHeartbeat({ ...deps, now: "2026-01-01T00:01:00.000Z" }, "daily");
    await runHeartbeat({ ...deps, now: "2026-01-01T00:02:00.000Z" }, "daily");
    await runHeartbeat({ ...deps, now: "2026-01-01T00:03:00.000Z" }, "daily");

    // All calls are only to /lab/health, no webhook
    for (const call of fetchMock.mock.calls) {
      expect(call[0] as string).toContain("/lab/health");
    }
  });
});

describe("runHeartbeat — admin bypass audit", () => {
  it("writes an audit entry to KV on every tick", async () => {
    const kv = createMockKV();
    const deps = makeDeps({ kv });
    await runHeartbeat(deps, "daily");
    const auditKeys = [...kv._store.keys()].filter((k) => k.startsWith("lab:admin-audit:"));
    expect(auditKeys).toHaveLength(1);
  });
});

describe("InMemoryHeartbeatStore", () => {
  it("getRecent returns newest-first up to n", async () => {
    const store = new InMemoryHeartbeatStore();
    await store.append({
      runId: "r1",
      ts: "2026-01-01T00:01:00.000Z",
      status: "OK",
      durationMs: 10,
      kind: "daily",
    });
    await store.append({
      runId: "r2",
      ts: "2026-01-01T00:02:00.000Z",
      status: "FAILED",
      durationMs: 20,
      kind: "daily",
    });
    await store.append({
      runId: "r3",
      ts: "2026-01-01T00:03:00.000Z",
      status: "OK",
      durationMs: 15,
      kind: "daily",
    });
    const recent = await store.getRecent(2);
    expect(recent[0]?.runId).toBe("r3");
    expect(recent[1]?.runId).toBe("r2");
  });
});
