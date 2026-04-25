import { describe, it, expect } from "vitest";
import { PgPollingPath } from "./pg-polling-path";
import type { ScenarioContext, DbClient } from "./context";
import type { SessionContext } from "@repo/lab-core";

interface InsertedRow {
  sessionId: string;
  pathId: string;
}

function makeMockDb(rows: InsertedRow[] = []): DbClient & { insertedRows: InsertedRow[] } {
  const insertedRows: InsertedRow[] = [...rows];
  return {
    insertedRows,
    async execute<T>(sql: string, params?: unknown[]): Promise<T[]> {
      if (sql.includes("INSERT")) {
        // Track inserts
        insertedRows.push({
          sessionId: String(params?.[0] ?? ""),
          pathId: String(params?.[1] ?? ""),
        });
        return [] as T[];
      }
      if (sql.includes("SELECT")) {
        // Return empty to simulate "not yet visible"
        return [] as T[];
      }
      return [] as T[];
    },
  };
}

function makeCtx(db: DbClient, sessionId = "session-pg-001"): ScenarioContext {
  return {
    sessionId,
    db,
    labQueue: { async send() {}, async sendBatch() {} },
    signal: new AbortController().signal,
  };
}

function makeSessionCtx(sessionId = "session-pg-001"): SessionContext {
  return { sessionId, signal: new AbortController().signal };
}

describe("PgPollingPath", () => {
  it("emits path_started first", async () => {
    const db = makeMockDb();
    const ctx = makeCtx(db);
    // Use a very small workload so polling doesn't spin forever
    const path = new PgPollingPath(ctx, { workloadSize: 1 });
    const sessionCtx = makeSessionCtx();

    const events = [];
    for await (const evt of path.run(sessionCtx)) {
      events.push(evt);
      if (events.length > 5) break; // guard against infinite loop in test
    }

    expect(events[0]!.type).toBe("path_started");
  });

  it("emits path_failed when db throws", async () => {
    const errorDb: DbClient = {
      async execute() {
        throw new Error("Hyperdrive pool exhausted");
      },
    };
    const ctx: ScenarioContext = {
      sessionId: "session-err",
      db: errorDb,
      labQueue: { async send() {}, async sendBatch() {} },
      signal: new AbortController().signal,
    };
    const path = new PgPollingPath(ctx, { workloadSize: 5 });
    const sessionCtx: SessionContext = {
      sessionId: "session-err",
      signal: new AbortController().signal,
    };

    const events = [];
    for await (const evt of path.run(sessionCtx)) {
      events.push(evt);
    }

    const failed = events.find((e) => e.type === "path_failed");
    expect(failed).toBeDefined();
    expect((failed as { reason: string }).reason).toContain("hyperdrive_pool_exhausted");
  });

  it("has producerCount default of 1", () => {
    const db = makeMockDb();
    const ctx = makeCtx(db);
    const path = new PgPollingPath(ctx);
    expect(path.producerCountConfig).toBe(1);
  });

  it("respects custom producerCount option", () => {
    const db = makeMockDb();
    const ctx = makeCtx(db);
    const path = new PgPollingPath(ctx, { producerCount: 3 });
    expect(path.producerCountConfig).toBe(3);
  });

  it("emits path_started with correct pathId and sessionId", async () => {
    const db = makeMockDb();
    const ctx = makeCtx(db, "my-session");
    const path = new PgPollingPath(ctx, { workloadSize: 1 });
    const sessionCtx = makeSessionCtx("my-session");

    const events = [];
    for await (const evt of path.run(sessionCtx)) {
      events.push(evt);
      if (events.length >= 1) break;
    }

    expect(events[0]!.type).toBe("path_started");
    expect((events[0] as { sessionId: string }).sessionId).toBe("my-session");
    expect((events[0] as { pathId: string }).pathId).toBe("pg-polling");
  });
});
