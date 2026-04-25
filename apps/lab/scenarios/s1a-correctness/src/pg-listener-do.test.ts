import { describe, it, expect } from "vitest";
import { PgListenerDO, createMockPgDirectConnection, LISTEN_CHANNEL } from "./pg-listener-do";

function makeStorage(): {
  data: Map<string, unknown>;
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
} {
  const data = new Map<string, unknown>();
  return {
    data,
    async get<T>(key: string): Promise<T | undefined> {
      return data.get(key) as T | undefined;
    },
    async put(key: string, value: unknown): Promise<void> {
      data.set(key, value);
    },
    async delete(key: string): Promise<boolean> {
      return data.delete(key);
    },
  };
}

function makeDoState() {
  const storage = makeStorage();
  return {
    storage,
    async blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> {
      return fn();
    },
  };
}

describe("PgListenerDO", () => {
  it("starts and responds to /stats", async () => {
    const doState = makeDoState();
    const do_ = new PgListenerDO(doState);

    const req = new Request("https://do/start", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "sess-001",
        pgUrl: "postgres://localhost/lab",
        simulateReconnect: false,
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await do_.fetch(req);
    expect(res.ok).toBe(true);

    const statsRes = await do_.fetch(new Request("https://do/stats"));
    const stats = (await statsRes.json()) as { sessionId: string; received: number };
    expect(stats.sessionId).toBe("sess-001");
    expect(stats.received).toBe(0);
  });

  it("returns records filtered by sessionId", async () => {
    const doState = makeDoState();
    const do_ = new PgListenerDO(doState);

    await do_.fetch(
      new Request("https://do/start", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "s-a",
          pgUrl: "postgres://localhost/lab",
          simulateReconnect: false,
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    const recordsRes = await do_.fetch(new Request("https://do/records?sessionId=s-a"));
    const records = (await recordsRes.json()) as unknown[];
    expect(Array.isArray(records)).toBe(true);
  });

  it("returns 404 for unknown paths", async () => {
    const doState = makeDoState();
    const do_ = new PgListenerDO(doState);

    const res = await do_.fetch(new Request("https://do/unknown-path"));
    expect(res.status).toBe(404);
  });

  it("stop closes the connection gracefully", async () => {
    const doState = makeDoState();
    const do_ = new PgListenerDO(doState);

    await do_.fetch(
      new Request("https://do/start", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "s-stop",
          pgUrl: "postgres://localhost/lab",
          simulateReconnect: false,
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    const stopRes = await do_.fetch(
      new Request("https://do/stop", {
        method: "POST",
        body: JSON.stringify({ sessionId: "s-stop" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(stopRes.ok).toBe(true);
  });
});

describe("createMockPgDirectConnection", () => {
  it("starts in non-listening state", () => {
    const conn = createMockPgDirectConnection("postgres://test");
    expect(conn.isListening()).toBe(false);
  });

  it("listen sets listening=true", async () => {
    const conn = createMockPgDirectConnection("postgres://test");
    await conn.listen(LISTEN_CHANNEL);
    expect(conn.isListening()).toBe(true);
  });

  it("unlisten sets listening=false", async () => {
    const conn = createMockPgDirectConnection("postgres://test");
    await conn.listen(LISTEN_CHANNEL);
    await conn.unlisten(LISTEN_CHANNEL);
    expect(conn.isListening()).toBe(false);
  });

  it("sendNotification triggers onNotification handler", async () => {
    const conn = createMockPgDirectConnection("postgres://test");
    const received: string[] = [];
    conn.onNotification((p) => received.push(p));

    await conn.listen(LISTEN_CHANNEL);
    conn.sendNotification("hello-payload");

    expect(received).toHaveLength(1);
    expect(received[0]).toBe("hello-payload");
  });

  it("triggerError invokes onError handler", () => {
    const conn = createMockPgDirectConnection("postgres://test");
    const errors: Error[] = [];
    conn.onError((e) => errors.push(e));

    const err = new Error("connection lost");
    conn.triggerError(err);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe("connection lost");
  });

  it("close sets listening=false", async () => {
    const conn = createMockPgDirectConnection("postgres://test");
    await conn.listen(LISTEN_CHANNEL);
    await conn.close();
    expect(conn.isListening()).toBe(false);
  });
});
