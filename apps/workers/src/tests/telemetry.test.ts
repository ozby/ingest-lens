import { describe, it, expect, vi } from "vitest";
import { recordDelivery } from "../telemetry";
import { createMockEnv } from "./helpers";

describe("recordDelivery", () => {
  it("writes a data point with correct blobs, doubles, and indexes on ack", () => {
    const writeDataPoint = vi.fn();
    const env = createMockEnv(undefined, undefined, { writeDataPoint });

    recordDelivery(env, {
      queueId: "queue-1",
      messageId: "msg-1",
      topicId: "topic-1",
      status: "ack",
      latencyMs: 123,
      attempt: 0,
    });

    expect(writeDataPoint).toHaveBeenCalledOnce();
    expect(writeDataPoint).toHaveBeenCalledWith({
      blobs: ["queue-1", "msg-1", "ack", "topic-1"],
      doubles: [123, 0],
      indexes: ["queue-1"],
    });
  });

  it("uses empty string for topicId when null", () => {
    const writeDataPoint = vi.fn();
    const env = createMockEnv(undefined, undefined, { writeDataPoint });

    recordDelivery(env, {
      queueId: "queue-1",
      messageId: "msg-1",
      topicId: null,
      status: "retry",
      latencyMs: 456,
      attempt: 2,
    });

    expect(writeDataPoint).toHaveBeenCalledWith({
      blobs: ["queue-1", "msg-1", "retry", ""],
      doubles: [456, 2],
      indexes: ["queue-1"],
    });
  });

  it("records dropped status", () => {
    const writeDataPoint = vi.fn();
    const env = createMockEnv(undefined, undefined, { writeDataPoint });

    recordDelivery(env, {
      queueId: "queue-2",
      messageId: "msg-99",
      topicId: null,
      status: "dropped",
      latencyMs: 0,
      attempt: 0,
    });

    expect(writeDataPoint).toHaveBeenCalledWith({
      blobs: ["queue-2", "msg-99", "dropped", ""],
      doubles: [0, 0],
      indexes: ["queue-2"],
    });
  });

  it("does not throw when writeDataPoint throws (best-effort)", () => {
    const writeDataPoint = vi.fn().mockImplementation(() => {
      throw new Error("analytics unavailable");
    });
    const env = createMockEnv(undefined, undefined, { writeDataPoint });

    expect(() =>
      recordDelivery(env, {
        queueId: "queue-1",
        messageId: "msg-1",
        topicId: null,
        status: "ack",
        latencyMs: 10,
        attempt: 0,
      }),
    ).not.toThrow();
  });
});
