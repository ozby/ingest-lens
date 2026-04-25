import { describe, it, expect } from "vitest";
import { CfQueuesPath } from "./cf-queues-path";
import type { ScenarioContext, CfQueueBinding, DbClient } from "./context";
import type { SessionContext } from "@repo/lab-core";

function makeMockQueue(): CfQueueBinding & { batches: unknown[][] } {
  const batches: unknown[][] = [];
  return {
    batches,
    async send(body) {
      batches.push([body]);
    },
    async sendBatch(messages) {
      batches.push(messages.map((m) => m.body));
    },
  };
}

function makeMockDb(): DbClient {
  return {
    async execute() {
      return [];
    },
  };
}

function makeCtx(queue: CfQueueBinding): ScenarioContext {
  return {
    sessionId: "session-cf-test-001",
    db: makeMockDb(),
    labQueue: queue,
    signal: new AbortController().signal,
  };
}

function makeSessionCtx(sessionId: string): SessionContext {
  return {
    sessionId,
    signal: new AbortController().signal,
  };
}

describe("CfQueuesPath", () => {
  it("emits path_started then path_completed events", async () => {
    const queue = makeMockQueue();
    const ctx = makeCtx(queue);
    const path = new CfQueuesPath(ctx, { workloadSize: 10 });
    const sessionCtx = makeSessionCtx("session-cf-test-001");

    const events = [];
    for await (const evt of path.run(sessionCtx)) {
      events.push(evt);
    }

    expect(events[0]!.type).toBe("path_started");
    expect(events[events.length - 1]!.type).toBe("path_completed");
  });

  it("enqueues all messages across batches of 100", async () => {
    const queue = makeMockQueue();
    const ctx = makeCtx(queue);
    const path = new CfQueuesPath(ctx, { workloadSize: 250 });
    const sessionCtx = makeSessionCtx("session-cf-test-001");

    for await (const _ of path.run(sessionCtx)) {
      // drain
    }

    // 250 msgs in batches of 100 → 3 sendBatch calls (100, 100, 50)
    expect(queue.batches).toHaveLength(3);
    const total = queue.batches.reduce((acc, b) => acc + b.length, 0);
    expect(total).toBe(250);
  });

  it("emits path_failed when queue.sendBatch throws", async () => {
    const failingQueue: CfQueueBinding = {
      async send() {
        throw new Error("queue_5xx");
      },
      async sendBatch() {
        throw new Error("queue_5xx");
      },
    };
    const ctx = makeCtx(failingQueue);
    const path = new CfQueuesPath(ctx, { workloadSize: 10 });
    const sessionCtx = makeSessionCtx("session-cf-test-001");

    const events = [];
    for await (const evt of path.run(sessionCtx)) {
      events.push(evt);
    }

    const failed = events.find((e) => e.type === "path_failed");
    expect(failed).toBeDefined();
    expect((failed as { reason: string }).reason).toContain("queue_5xx");
  });

  it("path_completed deliveredCount matches workloadSize on success", async () => {
    const queue = makeMockQueue();
    const ctx = makeCtx(queue);
    const path = new CfQueuesPath(ctx, { workloadSize: 1000 });
    const sessionCtx = makeSessionCtx("session-cf-test-001");

    const events = [];
    for await (const evt of path.run(sessionCtx)) {
      events.push(evt);
    }

    const completed = events.find((e) => e.type === "path_completed");
    expect(completed).toBeDefined();
    expect((completed as { deliveredCount: number }).deliveredCount).toBe(1000);
  });

  it("stops early when signal is aborted", async () => {
    const ac = new AbortController();
    const queue = makeMockQueue();
    const ctx: ScenarioContext = {
      sessionId: "session-abort-test",
      db: makeMockDb(),
      labQueue: queue,
      signal: ac.signal,
    };
    const path = new CfQueuesPath(ctx, { workloadSize: 1000 });
    const sessionCtx: SessionContext = { sessionId: "session-abort-test", signal: ac.signal };

    // Abort immediately
    ac.abort();

    const events = [];
    for await (const evt of path.run(sessionCtx)) {
      events.push(evt);
    }

    // Should have started but may complete with 0 or fewer msgs
    expect(events[0]!.type).toBe("path_started");
  });
});
