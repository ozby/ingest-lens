import { describe, it, expect } from "vitest";
import { summarize, classifyOrdering, aggregateRun, type PathSummary } from "./aggregator";
import type { ScenarioEvent } from "@repo/lab-core";

function makePathStarted(pathId: string, sessionId = "s1"): ScenarioEvent {
  return {
    type: "path_started",
    eventId: `${pathId}-start`,
    sessionId,
    pathId,
    timestamp: "2026-01-01T00:00:00.000Z",
  };
}

function makePathCompleted(
  pathId: string,
  deliveredCount: number,
  inversionCount: number,
  sessionId = "s1",
): ScenarioEvent {
  return {
    type: "path_completed",
    eventId: `${pathId}-done`,
    sessionId,
    pathId,
    deliveredCount,
    inversionCount,
    durationMs: 500,
    timestamp: "2026-01-01T00:00:01.000Z",
  };
}

function makePathFailed(pathId: string, reason: string, sessionId = "s1"): ScenarioEvent {
  return {
    type: "path_failed",
    eventId: `${pathId}-fail`,
    sessionId,
    pathId,
    reason,
    timestamp: "2026-01-01T00:00:01.000Z",
  };
}

describe("summarize", () => {
  it("returns FAILED status when path_failed is in stream", () => {
    const events: ScenarioEvent[] = [
      makePathStarted("cf-queues"),
      makePathFailed("cf-queues", "queue_5xx"),
    ];
    const result = summarize(events, 1000);
    expect(result.status).toBe("FAILED");
    expect(result.failureReason).toBe("queue_5xx");
  });

  it("returns OK status when all delivered", () => {
    const events: ScenarioEvent[] = [
      makePathStarted("cf-queues"),
      makePathCompleted("cf-queues", 1000, 0),
    ];
    const result = summarize(events, 1000);
    expect(result.status).toBe("OK");
  });

  it("returns PARTIAL status when delivered < sent", () => {
    const events: ScenarioEvent[] = [
      makePathStarted("cf-queues"),
      makePathCompleted("cf-queues", 800, 0),
    ];
    const result = summarize(events, 1000);
    expect(result.status).toBe("PARTIAL");
    expect(result.delivered).toBe(800);
  });

  it("classifies FIFO when inversions=0, duplicates=0, producers=1", () => {
    const events: ScenarioEvent[] = [
      makePathStarted("pg-polling"),
      makePathCompleted("pg-polling", 1000, 0),
    ];
    const result = summarize(events, 1000, { producers: 1 });
    expect(result.orderingProperty).toBe("FIFO");
  });

  it("classifies 'FIFO per-producer' when inversions=0, producers>1", () => {
    const events: ScenarioEvent[] = [
      makePathStarted("pg-polling"),
      makePathCompleted("pg-polling", 1000, 0),
    ];
    const result = summarize(events, 1000, { producers: 3 });
    expect(result.orderingProperty).toBe("FIFO per-producer");
  });

  it("classifies 'ordered with inversions' when inversions>0, duplicates=0", () => {
    const events: ScenarioEvent[] = [
      makePathStarted("cf-queues"),
      makePathCompleted("cf-queues", 1000, 42),
    ];
    const result = summarize(events, 1000, { producers: 1 });
    expect(result.orderingProperty).toBe("ordered with inversions");
  });

  it("classifies 'unordered' when inversions>0 and duplicates>0", () => {
    // Add duplicate message_delivered events
    const events: ScenarioEvent[] = [
      makePathStarted("cf-queues"),
      {
        type: "message_delivered",
        eventId: "del-1",
        sessionId: "s1",
        messageId: "msg-dup",
        pathId: "cf-queues",
        latencyMs: 1,
        timestamp: "2026-01-01T00:00:00.000Z",
      },
      {
        type: "message_delivered",
        eventId: "del-2",
        sessionId: "s1",
        messageId: "msg-dup", // duplicate
        pathId: "cf-queues",
        latencyMs: 2,
        timestamp: "2026-01-01T00:00:00.000Z",
      },
      makePathCompleted("cf-queues", 1000, 5),
    ];
    const result = summarize(events, 1000, { producers: 1 });
    expect(result.orderingProperty).toBe("unordered");
    expect(result.duplicates).toBe(1);
  });

  it("returns FAILED with no path_completed event", () => {
    const events: ScenarioEvent[] = [makePathStarted("cf-queues")];
    const result = summarize(events, 1000);
    expect(result.status).toBe("FAILED");
    expect(result.failureReason).toContain("no path_completed");
  });

  it("summary has correct pathId and durationMs", () => {
    const events: ScenarioEvent[] = [
      makePathStarted("pg-polling"),
      makePathCompleted("pg-polling", 500, 0),
    ];
    const result = summarize(events, 1000);
    expect(result.pathId).toBe("pg-polling");
    expect(result.durationMs).toBe(500);
  });
});

describe("classifyOrdering", () => {
  it("FIFO: inversions=0, duplicates=0, producers=1", () => {
    expect(classifyOrdering(0, 0, 1)).toBe("FIFO");
  });

  it("FIFO per-producer: inversions=0, producers=2", () => {
    expect(classifyOrdering(0, 0, 2)).toBe("FIFO per-producer");
  });

  it("ordered with inversions: inversions>0, duplicates=0", () => {
    expect(classifyOrdering(10, 0, 1)).toBe("ordered with inversions");
  });

  it("unordered: inversions>0, duplicates>0", () => {
    expect(classifyOrdering(5, 3, 1)).toBe("unordered");
  });
});

describe("aggregateRun", () => {
  it("combines multiple path summaries correctly", () => {
    const paths: PathSummary[] = [
      {
        pathId: "cf-queues",
        delivered: 1000,
        sent: 1000,
        duplicates: 0,
        inversions: 5,
        orderingProperty: "ordered with inversions",
        status: "OK",
        durationMs: 200,
      },
      {
        pathId: "pg-polling",
        delivered: 1000,
        sent: 1000,
        duplicates: 0,
        inversions: 0,
        orderingProperty: "FIFO",
        status: "OK",
        durationMs: 300,
      },
    ];

    const result = aggregateRun(paths, 1500);
    expect(result.totalDelivered).toBe(2000);
    expect(result.totalInversions).toBe(5);
    expect(result.overallStatus).toBe("OK");
    expect(result.durationMs).toBe(1500);
  });

  it("overall FAILED if any path FAILED", () => {
    const paths: PathSummary[] = [
      {
        pathId: "cf-queues",
        delivered: 0,
        sent: 1000,
        duplicates: 0,
        inversions: 0,
        orderingProperty: "unknown",
        status: "FAILED",
        durationMs: 0,
      },
      {
        pathId: "pg-polling",
        delivered: 1000,
        sent: 1000,
        duplicates: 0,
        inversions: 0,
        orderingProperty: "FIFO",
        status: "OK",
        durationMs: 300,
      },
    ];

    const result = aggregateRun(paths, 500);
    expect(result.overallStatus).toBe("FAILED");
  });

  it("overall PARTIAL if any path PARTIAL and none FAILED", () => {
    const paths: PathSummary[] = [
      {
        pathId: "pg-direct-notify",
        delivered: 900,
        sent: 1000,
        duplicates: 0,
        inversions: 0,
        orderingProperty: "FIFO",
        status: "PARTIAL",
        durationMs: 400,
      },
      {
        pathId: "pg-polling",
        delivered: 1000,
        sent: 1000,
        duplicates: 0,
        inversions: 0,
        orderingProperty: "FIFO",
        status: "OK",
        durationMs: 300,
      },
    ];

    const result = aggregateRun(paths, 700);
    expect(result.overallStatus).toBe("PARTIAL");
  });
});
