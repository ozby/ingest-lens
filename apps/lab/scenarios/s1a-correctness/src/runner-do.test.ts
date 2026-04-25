import { describe, it, expect } from "vitest";
import { S1aRunnerDO } from "./runner-do";
import { makeInitialState, PATH_ORDER } from "./runner-state";

function makeStorage() {
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
    async getAlarm(): Promise<number | null> {
      return (data.get("alarm") as number | undefined) ?? null;
    },
    async setAlarm(t: number): Promise<void> {
      data.set("alarm", t);
    },
    async deleteAlarm(): Promise<void> {
      data.delete("alarm");
    },
  };
}

function makeDoState() {
  const storage = makeStorage();
  return {
    storage,
    // Simulates CF DO blockConcurrencyWhile: runs fn immediately and awaits it.
    // The void promise in the constructor resolves before the next microtask.
    async blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> {
      return await fn();
    },
  };
}

describe("S1aRunnerDO", () => {
  it("start sets phase to idle and schedules an alarm", async () => {
    const doState = makeDoState();
    const do_ = new S1aRunnerDO(doState);

    const result = await do_.start({
      sessionId: "sess-runner-01",
      workloadSize: 100,
      seed: "test-seed",
      mode: "sequential",
    });

    expect(result.ok).toBe(true);
    expect(doState.storage.data.has("alarm")).toBe(true);
  });

  it("start is idempotent: re-entry with same sessionId returns alreadyRunning", async () => {
    const doState = makeDoState();
    const do_ = new S1aRunnerDO(doState);

    await do_.start({ sessionId: "sess-idem", workloadSize: 100, mode: "sequential" });
    const second = await do_.start({
      sessionId: "sess-idem",
      workloadSize: 100,
      mode: "sequential",
    });

    expect(second.alreadyRunning).toBe(true);
  });

  it("alarm tick advances the path cursor in sequential mode", async () => {
    const doState = makeDoState();
    const do_ = new S1aRunnerDO(doState);

    await do_.start({ sessionId: "sess-alarm", workloadSize: 100, mode: "sequential" });

    // Trigger one alarm tick
    await do_.alarm();

    const status = do_.getStatus();
    // After one tick, the first path should have advanced
    expect(status.state?.phase).toBe("running");
  });

  it("abort clears alarms and sets phase to aborted", async () => {
    const doState = makeDoState();
    const do_ = new S1aRunnerDO(doState);

    await do_.start({ sessionId: "sess-abort", workloadSize: 100, mode: "sequential" });
    await do_.abort("sess-abort");

    const status = do_.getStatus();
    expect(status.state?.phase).toBe("aborted");
    // Alarm should be cleared
    expect(doState.storage.data.has("alarm")).toBe(false);
  });

  it("abort adds path_failed event with run_aborted reason", async () => {
    const doState = makeDoState();
    const do_ = new S1aRunnerDO(doState);

    await do_.start({ sessionId: "sess-abort2", workloadSize: 100, mode: "sequential" });
    await do_.abort("sess-abort2");

    const status = do_.getStatus();
    const abortedEvent = status.events.find(
      (e) =>
        e.type === "path_failed" &&
        "reason" in e &&
        (e as { reason: string }).reason === "run_aborted",
    );
    expect(abortedEvent).toBeDefined();
  });

  it("abort on wrong sessionId is a no-op", async () => {
    const doState = makeDoState();
    const do_ = new S1aRunnerDO(doState);

    await do_.start({ sessionId: "sess-correct", workloadSize: 100, mode: "sequential" });
    await do_.abort("wrong-session");

    const status = do_.getStatus();
    expect(status.state?.phase).not.toBe("aborted");
  });

  it("fetch /start route works", async () => {
    const doState = makeDoState();
    const do_ = new S1aRunnerDO(doState);

    const req = new Request("https://do/start", {
      method: "POST",
      body: JSON.stringify({ sessionId: "sess-fetch", workloadSize: 50, mode: "sequential" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await do_.fetch(req);
    expect(res.ok).toBe(true);
  });

  it("fetch /status route returns state", async () => {
    const doState = makeDoState();
    const do_ = new S1aRunnerDO(doState);

    const res = await do_.fetch(new Request("https://do/status"));
    const body = (await res.json()) as { state: null | { sessionId: string } };
    expect(body.state).toBeNull(); // no run started
  });

  it("fetch unknown route returns 404", async () => {
    const doState = makeDoState();
    const do_ = new S1aRunnerDO(doState);

    const res = await do_.fetch(new Request("https://do/unknown"));
    expect(res.status).toBe(404);
  });

  it("runs sequential mode to completion across multiple alarm ticks", async () => {
    const doState = makeDoState();
    const do_ = new S1aRunnerDO(doState);

    // 100 msgs, batch 100 → 1 tick per path × 3 paths = 3 ticks
    await do_.start({ sessionId: "sess-complete", workloadSize: 100, mode: "sequential" });

    // Drive all alarm ticks
    for (let i = 0; i < 20; i++) {
      if (do_.getStatus().state?.phase === "completed") break;
      await do_.alarm();
    }

    const status = do_.getStatus();
    expect(status.state?.phase).toBe("completed");
    expect(status.summary).toBeDefined();
  });

  it("default path order matches expected sequence", () => {
    expect(S1aRunnerDO.pathOrder).toEqual(["cf-queues", "pg-polling", "pg-direct-notify"]);
    expect(PATH_ORDER).toEqual(["cf-queues", "pg-polling", "pg-direct-notify"]);
  });

  it("parallel mode advances all paths on the same alarm tick", async () => {
    const doState = makeDoState();
    const do_ = new S1aRunnerDO(doState);

    await do_.start({ sessionId: "sess-parallel", workloadSize: 100, mode: "parallel" });
    await do_.alarm();

    const status = do_.getStatus();
    // In parallel mode, all paths should have advanced after one tick
    const runningPaths = Object.values(status.state?.paths ?? {}).filter(
      (p) =>
        (p as { phase: string }).phase === "running" ||
        (p as { phase: string }).phase === "completed",
    );
    expect(runningPaths.length).toBeGreaterThan(1);
  });
});

describe("makeInitialState", () => {
  it("creates state with correct defaults", () => {
    const state = makeInitialState("s1", 1000, "seed-x", "sequential");
    expect(state.sessionId).toBe("s1");
    expect(state.workloadSize).toBe(1000);
    expect(state.mode).toBe("sequential");
    expect(state.phase).toBe("idle");
    expect(state.activePathIndex).toBe(0);
    expect(state.pathOrder).toEqual(PATH_ORDER);
  });

  it("initializes all paths as pending", () => {
    const state = makeInitialState("s1", 1000, "seed", "sequential");
    for (const pathId of PATH_ORDER) {
      expect(state.paths[pathId]!.phase).toBe("pending");
      expect(state.paths[pathId]!.batchCursor).toBe(0);
    }
  });
});
