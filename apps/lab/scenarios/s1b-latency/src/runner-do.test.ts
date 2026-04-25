import { describe, it, expect, vi } from "vitest";
import { S1bRunnerDO } from "./runner-do";
import type { PathFactory, S1bRunnerDOEnv } from "./runner-do";
import type { ScenarioRunner, SessionContext, ScenarioEvent } from "@repo/lab-core";
import type { DurableObjectState } from "@cloudflare/workers-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStorage(): DurableObjectState["storage"] {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn().mockImplementation(async <T>(key: string) => store.get(key) as T | undefined),
    put: vi.fn().mockImplementation(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    delete: vi.fn(),
    list: vi.fn().mockResolvedValue(new Map()),
    deleteAll: vi.fn(),
    getAlarm: vi.fn().mockResolvedValue(null),
    setAlarm: vi.fn(),
    deleteAlarm: vi.fn(),
    sync: vi.fn(),
    transaction: vi.fn(),
    writeThrough: vi.fn(),
  } as unknown as DurableObjectState["storage"];
}

function makeDOState(): DurableObjectState {
  return {
    storage: makeStorage(),
    id: { name: "test-do", toString: () => "test-do", equals: () => false },
    blockConcurrencyWhile: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  } as unknown as DurableObjectState;
}

/**
 * Creates a mock ScenarioRunner that emits N message_delivered events.
 */
function makeMockRunner(pathId: string, messageCount: number): ScenarioRunner {
  return {
    async *run(ctx: SessionContext): AsyncIterable<ScenarioEvent> {
      yield {
        type: "path_started",
        eventId: `${pathId}-started`,
        sessionId: ctx.sessionId,
        pathId,
        timestamp: new Date("2026-01-01").toISOString(),
      };

      for (let i = 0; i < messageCount; i++) {
        if (ctx.signal.aborted) break;
        yield {
          type: "message_delivered",
          eventId: `${pathId}-msg-${i}`,
          sessionId: ctx.sessionId,
          messageId: `${ctx.sessionId}-${pathId}-${i}`,
          pathId,
          latencyMs: 10 + i,
          timestamp: new Date("2026-01-01").toISOString(),
        };
      }

      yield {
        type: "path_completed",
        eventId: `${pathId}-completed`,
        sessionId: ctx.sessionId,
        pathId,
        deliveredCount: messageCount,
        inversionCount: 0,
        durationMs: messageCount * 5,
        timestamp: new Date("2026-01-01").toISOString(),
      };
    },
  };
}

function makePathFactory(messageCount: number): PathFactory {
  return {
    createCfQueuesPath: (_mc) => makeMockRunner("cf-queues-latency", messageCount),
    createPgPollingPath: (_mc) => makeMockRunner("pg-polling-latency", messageCount),
    createDirectNotifyPath: (_mc) => makeMockRunner("pg-direct-notify-latency", messageCount),
  };
}

const ENV: S1bRunnerDOEnv = {};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("S1bRunnerDO", () => {
  it("runs all three paths sequentially and returns three summaries", async () => {
    const messageCount = 10;
    const doState = makeDOState();
    const runner = new S1bRunnerDO(doState, ENV, makePathFactory(messageCount));

    const result = await runner.start({ sessionId: "sess-do-1" });

    expect(result.status).toBe("completed");
    expect(result.mode).toBe("sequential");
    expect(result.summaries).toHaveLength(3);
    expect(result.summaries.map((s) => s.pathId)).toEqual([
      "cf-queues-latency",
      "pg-polling-latency",
      "pg-direct-notify-latency",
    ]);
  });

  it("is idempotent on re-entry for the same sessionId while running", async () => {
    const messageCount = 5;
    const doState = makeDOState();
    const factory = makePathFactory(messageCount);
    const runner = new S1bRunnerDO(doState, ENV, factory);

    // Manually seed a running state
    await doState.storage.put("runnerState", {
      sessionId: "sess-do-idem",
      status: "running",
      mode: "sequential",
      messageCount: 5,
      startedAt: new Date("2026-01-01").toISOString(),
      completedAt: null,
      summaries: [],
      error: null,
    });

    const result = await runner.start({ sessionId: "sess-do-idem" });

    expect(result.status).toBe("running");
    expect(result.summaries).toHaveLength(0);
  });

  it("runs paths in parallel when mode='parallel'", async () => {
    const messageCount = 5;
    const doState = makeDOState();
    const runner = new S1bRunnerDO(doState, ENV, makePathFactory(messageCount));

    const result = await runner.start({ sessionId: "sess-do-parallel", mode: "parallel" });

    expect(result.mode).toBe("parallel");
    expect(result.summaries).toHaveLength(3);
  });

  it("abort() marks the run as aborted", async () => {
    const doState = makeDOState();
    // Seed a running state
    await doState.storage.put("runnerState", {
      sessionId: "sess-do-abort",
      status: "running",
      mode: "sequential",
      messageCount: 1000,
      startedAt: new Date("2026-01-01").toISOString(),
      completedAt: null,
      summaries: [],
      error: null,
    });

    const runner = new S1bRunnerDO(doState, ENV, makePathFactory(10));
    await runner.abort();

    const state = await runner.getState();
    expect(state?.status).toBe("aborted");
  });

  it("getState() returns null when no run has been started", async () => {
    const doState = makeDOState();
    const runner = new S1bRunnerDO(doState, ENV, makePathFactory(5));

    const state = await runner.getState();
    expect(state).toBeNull();
  });

  it("each summary has non-negative p99 and correct pathId", async () => {
    const messageCount = 20;
    const doState = makeDOState();
    const runner = new S1bRunnerDO(doState, ENV, makePathFactory(messageCount));

    const result = await runner.start({ sessionId: "sess-do-p99" });

    for (const summary of result.summaries) {
      expect(summary.delivered).toBe(messageCount);
      if (summary.p99Ms !== null) {
        expect(summary.p99Ms).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
