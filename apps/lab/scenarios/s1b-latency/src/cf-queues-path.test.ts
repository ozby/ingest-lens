import { describe, it, expect, vi, beforeEach } from "vitest";
import { CfQueuesLatencyPath, handleQueueMessage } from "./cf-queues-path";
import type { SessionContext } from "@repo/lab-core";

function makeContext(sessionId = "sess-cfq-test"): SessionContext {
  return { sessionId, signal: new AbortController().signal };
}

function makeQueue(onSend: (body: unknown) => void = () => {}): Queue {
  return {
    send: vi.fn().mockImplementation(async (body: unknown) => {
      onSend(body);
    }),
    sendBatch: vi.fn(),
  } as unknown as Queue;
}

describe("CfQueuesLatencyPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits path_started then message_delivered events then path_completed", async () => {
    const messageCount = 3;
    const sessionId = "sess-cfq-1";
    const ctx = makeContext(sessionId);

    const queue = makeQueue((body) => {
      const { messageId } = body as { messageId: string; sentAt: number };
      // Immediately resolve as if consumer received it
      setTimeout(() => handleQueueMessage(messageId), 0);
    });

    const path = new CfQueuesLatencyPath({ queue, messageCount, pathId: "cf-queues-latency" });
    const events = [];
    for await (const ev of path.run(ctx)) {
      events.push(ev);
    }

    const types = events.map((e) => e.type);
    expect(types[0]).toBe("path_started");
    expect(types.filter((t) => t === "message_delivered")).toHaveLength(messageCount);
    expect(types[types.length - 1]).toBe("path_completed");
  });

  it("emits path_failed when queue.send throws", async () => {
    const ctx = makeContext("sess-cfq-err");
    const queue: Queue = {
      send: vi.fn().mockRejectedValue(new Error("queue unavailable")),
      sendBatch: vi.fn(),
    } as unknown as Queue;

    const path = new CfQueuesLatencyPath({ queue, messageCount: 1, pathId: "cf-queues-latency" });
    const events = [];
    for await (const ev of path.run(ctx)) {
      events.push(ev);
    }

    expect(events.some((e) => e.type === "path_failed")).toBe(true);
    const failedEvent = events.find((e) => e.type === "path_failed");
    expect(failedEvent).toMatchObject({
      type: "path_failed",
      reason: expect.stringContaining("queue unavailable"),
    });
  });

  it("records non-negative latency for each delivered message", async () => {
    const messageCount = 5;
    const ctx = makeContext("sess-cfq-latency");

    const queue = makeQueue((body) => {
      const { messageId } = body as { messageId: string };
      setTimeout(() => handleQueueMessage(messageId), 1);
    });

    const path = new CfQueuesLatencyPath({ queue, messageCount, pathId: "cf-queues-latency" });
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

  it("path_completed has correct deliveredCount", async () => {
    const messageCount = 4;
    const ctx = makeContext("sess-cfq-count");

    const queue = makeQueue((body) => {
      const { messageId } = body as { messageId: string };
      handleQueueMessage(messageId);
    });

    const path = new CfQueuesLatencyPath({ queue, messageCount, pathId: "cf-queues-latency" });
    const events = [];
    for await (const ev of path.run(ctx)) {
      events.push(ev);
    }

    const completed = events.find((e) => e.type === "path_completed");
    expect(completed).toMatchObject({ deliveredCount: messageCount });
  });
});
