import { describe, it, expect, vi } from "vitest";
import { PgPollingLatencyPath } from "./pg-polling-path";
import type { SessionContext } from "@repo/lab-core";

function makeContext(sessionId = "sess-pgp-test"): SessionContext {
  return { sessionId, signal: new AbortController().signal };
}

describe("PgPollingLatencyPath", () => {
  it("emits path_started, message_delivered events, then path_completed", async () => {
    const messageCount = 3;
    const sessionId = "sess-pgp-1";
    const ctx = makeContext(sessionId);
    const insertedAt = new Date("2026-01-01T00:00:00.000Z").toISOString();

    // Mock execute:
    // - CREATE TABLE → no rows
    // - INSERTs → no rows
    // - SELECT → returns all rows at once
    // - DELETE → no rows
    const execute = vi.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes("CREATE TABLE")) return { rows: [] };
      if (sql.includes("INSERT")) return { rows: [] };
      if (sql.includes("DELETE")) return { rows: [] };
      if (sql.includes("SELECT")) {
        const ids = (params?.[1] as string[]) ?? [];
        return {
          rows: ids.map((id) => ({ message_id: id, inserted_at: insertedAt })),
        };
      }
      return { rows: [] };
    });

    const path = new PgPollingLatencyPath({
      execute,
      messageCount,
      pollIntervalMs: 0,
      pathId: "pg-polling-latency",
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
    const ctx = makeContext("sess-pgp-err");
    const execute = vi.fn().mockRejectedValue(new Error("Hyperdrive error"));

    const path = new PgPollingLatencyPath({
      execute,
      messageCount: 1,
      pollIntervalMs: 0,
      pathId: "pg-polling-latency",
    });

    const events = [];
    for await (const ev of path.run(ctx)) {
      events.push(ev);
    }

    expect(events.some((e) => e.type === "path_failed")).toBe(true);
    const failedEvent = events.find((e) => e.type === "path_failed");
    expect(failedEvent).toMatchObject({ reason: expect.stringContaining("Hyperdrive error") });
  });

  it("records non-negative latency for each message", async () => {
    const messageCount = 5;
    const ctx = makeContext("sess-pgp-latency");
    const insertedAt = new Date("2026-01-01").toISOString();

    const execute = vi.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes("SELECT")) {
        const ids = (params?.[1] as string[]) ?? [];
        return { rows: ids.map((id) => ({ message_id: id, inserted_at: insertedAt })) };
      }
      return { rows: [] };
    });

    const path = new PgPollingLatencyPath({
      execute,
      messageCount,
      pollIntervalMs: 0,
      pathId: "pg-polling-latency",
    });

    const events = [];
    for await (const ev of path.run(ctx)) {
      events.push(ev);
    }

    const delivered = events.filter((e) => e.type === "message_delivered");
    expect(delivered).toHaveLength(messageCount);
    for (const ev of delivered) {
      expect((ev as { latencyMs: number }).latencyMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("exposes pollIntervalMs on the instance", () => {
    const path = new PgPollingLatencyPath({
      execute: vi.fn(),
      pollIntervalMs: 200,
    });
    expect(path.pollIntervalMs).toBe(200);
  });
});
