import { describe, it, expect } from "vitest";
import { summarize } from "./aggregator";
import type { ScenarioEvent, MessageDeliveredEvent } from "@repo/lab-core";

function makeDeliveredEvent(
  pathId: string,
  messageId: string,
  latencyMs: number,
  sessionId = "sess-test",
): MessageDeliveredEvent {
  return {
    type: "message_delivered",
    eventId: `evt-${messageId}`,
    sessionId,
    messageId,
    pathId,
    latencyMs,
    timestamp: new Date("2026-01-01").toISOString(),
  };
}

function makeLatencies(count: number, baseMs: number, jitterMs: number): number[] {
  return Array.from({ length: count }, (_, i) => baseMs + (i % jitterMs));
}

describe("summarize", () => {
  it("computes p50/p95/p99 from a fixture of 1000 latencies", () => {
    const latencies = makeLatencies(1000, 10, 100);
    const events: ScenarioEvent[] = latencies.map((ms, i) =>
      makeDeliveredEvent("cf-queues-latency", `msg-${i}`, ms),
    );

    const summary = summarize("cf-queues-latency", events, 5000);

    expect(summary.delivered).toBe(1000);
    expect(summary.p50Ms).not.toBeNull();
    expect(summary.p95Ms).not.toBeNull();
    expect(summary.p99Ms).not.toBeNull();
    // p50 should be close to baseMs + jitter/2 = 10 + 50 = ~60
    expect(summary.p50Ms!).toBeGreaterThan(0);
    expect(summary.p99Ms!).toBeGreaterThanOrEqual(summary.p95Ms!);
    expect(summary.p95Ms!).toBeGreaterThanOrEqual(summary.p50Ms!);
  });

  it("computes throughput correctly", () => {
    const events: ScenarioEvent[] = Array.from({ length: 100 }, (_, i) =>
      makeDeliveredEvent("pg-polling-latency", `msg-${i}`, 50),
    );
    const summary = summarize("pg-polling-latency", events, 1000);

    expect(summary.throughputPerSec).toBeCloseTo(100, 0);
  });

  it("returns FAILED status when a path_failed event is present", () => {
    const events: ScenarioEvent[] = [
      {
        type: "path_failed",
        eventId: "evt-fail-1",
        sessionId: "sess-test",
        pathId: "cf-queues-latency",
        reason: "queue unavailable",
        timestamp: new Date("2026-01-01").toISOString(),
      },
    ];

    const summary = summarize("cf-queues-latency", events, 100);

    expect(summary.status).toBe("FAILED");
    expect(summary.delivered).toBe(0);
  });

  it("returns FAILED status when no messages were delivered", () => {
    const summary = summarize("cf-queues-latency", [], 0);
    expect(summary.status).toBe("FAILED");
  });

  it("annotates CF Queues cost with pricingEffectiveDate and pricingSource", () => {
    const events: ScenarioEvent[] = Array.from({ length: 10 }, (_, i) =>
      makeDeliveredEvent("cf-queues-latency", `msg-${i}`, 20),
    );
    const summary = summarize("cf-queues-latency", events, 500);

    expect(summary.pricingEffectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(summary.pricingSource).toContain("cloudflare");
  });

  it("annotates Postgres egress cost for pg-polling path", () => {
    const events: ScenarioEvent[] = Array.from({ length: 10 }, (_, i) =>
      makeDeliveredEvent("pg-polling-latency", `msg-${i}`, 80),
    );
    const summary = summarize("pg-polling-latency", events, 500);

    expect(summary.pricingEffectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(summary.costPerMillion).toBeGreaterThanOrEqual(0);
  });

  it("ignores events from other paths", () => {
    const events: ScenarioEvent[] = [
      makeDeliveredEvent("cf-queues-latency", "msg-cf-0", 10),
      makeDeliveredEvent("pg-polling-latency", "msg-pg-0", 200),
    ];
    const summary = summarize("cf-queues-latency", events, 1000);

    expect(summary.delivered).toBe(1);
    expect(summary.p50Ms).toBeCloseTo(10, 0);
  });

  it("returns OK status for a clean run", () => {
    const events: ScenarioEvent[] = Array.from({ length: 5 }, (_, i) =>
      makeDeliveredEvent("pg-direct-notify-latency", `msg-${i}`, 5),
    );
    const summary = summarize("pg-direct-notify-latency", events, 200);

    expect(summary.status).toBe("OK");
  });
});
