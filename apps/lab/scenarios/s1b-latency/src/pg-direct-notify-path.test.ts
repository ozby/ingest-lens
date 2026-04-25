import { describe, it, expect, vi } from "vitest";
import { PostgresDirectNotifyLatencyPath } from "./pg-direct-notify-path";
import type { PgSubscriber } from "./pg-direct-notify-path";
import type { SessionContext } from "@repo/lab-core";

function makeContext(sessionId = "sess-nfy-test"): SessionContext {
  return { sessionId, signal: new AbortController().signal };
}

type ExecuteFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

interface TestSetup {
  execute: ExecuteFn;
  createSubscriber: () => Promise<PgSubscriber>;
}

function makeSetup(_messageCount: number): TestSetup {
  let fireCallback: ((payload: string) => void) | null = null;

  const execute = vi.fn().mockImplementation(async (_sql: string, params?: unknown[]) => {
    // When pg_notify is called, fire the registered listener synchronously
    if (params !== undefined && params.length >= 2) {
      const payload = params[1] as string;
      if (fireCallback !== null) {
        fireCallback(payload);
      }
    }
    return { rows: [] };
  });

  const createSubscriber = async (): Promise<PgSubscriber> => ({
    listen: vi.fn().mockImplementation(async (_channel: string, cb: (payload: string) => void) => {
      fireCallback = cb;
    }),
    end: vi.fn().mockImplementation(async () => {
      fireCallback = null;
    }),
  });

  return { execute: execute as unknown as ExecuteFn, createSubscriber };
}

describe("PostgresDirectNotifyLatencyPath", () => {
  it("emits path_started, message_delivered events, then path_completed", async () => {
    const messageCount = 3;
    const sessionId = "sess-nfy-1";
    const ctx = makeContext(sessionId);
    const { execute, createSubscriber } = makeSetup(messageCount);

    const path = new PostgresDirectNotifyLatencyPath({
      execute,
      createSubscriber,
      messageCount,
      pathId: "pg-direct-notify-latency",
    });

    const events = [];
    for await (const ev of path.run(ctx)) {
      events.push(ev);
    }

    const types = events.map((e) => e.type);
    expect(types[0]).toBe("path_started");
    expect(types.filter((t) => t === "message_delivered")).toHaveLength(messageCount);
    expect(types[types.length - 1]).toBe("path_completed");
  });

  it("emits path_failed when execute throws", async () => {
    const ctx = makeContext("sess-nfy-err");
    const { createSubscriber } = makeSetup(1);
    const execute = vi
      .fn()
      .mockRejectedValue(new Error("direct TCP error")) as unknown as ExecuteFn;

    const path = new PostgresDirectNotifyLatencyPath({
      execute,
      createSubscriber,
      messageCount: 1,
      pathId: "pg-direct-notify-latency",
    });

    const events = [];
    for await (const ev of path.run(ctx)) {
      events.push(ev);
    }

    expect(events.some((e) => e.type === "path_failed")).toBe(true);
  });

  it("survives the simulated reconnect and continues delivering", async () => {
    const messageCount = 10;
    const reconnectAtIndex = 4;
    const ctx = makeContext("sess-nfy-reconnect");
    const { execute, createSubscriber } = makeSetup(messageCount);

    const path = new PostgresDirectNotifyLatencyPath({
      execute,
      createSubscriber,
      messageCount,
      reconnectAtIndex,
      pathId: "pg-direct-notify-latency",
    });

    const events = [];
    for await (const ev of path.run(ctx)) {
      events.push(ev);
    }

    const delivered = events.filter((e) => e.type === "message_delivered");
    // All messages should still be delivered after reconnect
    expect(delivered).toHaveLength(messageCount);
    expect(events[events.length - 1]?.type).toBe("path_completed");
  });

  it("records non-negative latency for each delivered message", async () => {
    const messageCount = 5;
    const ctx = makeContext("sess-nfy-lat");
    const { execute, createSubscriber } = makeSetup(messageCount);

    const path = new PostgresDirectNotifyLatencyPath({
      execute,
      createSubscriber,
      messageCount,
      pathId: "pg-direct-notify-latency",
    });

    const events = [];
    for await (const ev of path.run(ctx)) {
      events.push(ev);
    }

    const delivered = events.filter((e) => e.type === "message_delivered");
    for (const ev of delivered) {
      expect((ev as { latencyMs: number }).latencyMs).toBeGreaterThanOrEqual(0);
    }
  });
});
