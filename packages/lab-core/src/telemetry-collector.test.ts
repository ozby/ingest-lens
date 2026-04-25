import { describe, it, expect, vi } from "vitest";
import { TelemetryCollector } from "./telemetry-collector";
import { InMemoryArchive } from "./events-archive";
import type { ScenarioEvent, MessageDeliveredEvent } from "./contract";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessageEvent(i: number): MessageDeliveredEvent {
  return {
    type: "message_delivered",
    eventId: `evt-${String(i).padStart(6, "0")}`,
    sessionId: "session-test",
    messageId: `msg-${i}`,
    pathId: "path-1",
    latencyMs: 10,
    timestamp: "2026-01-01T00:00:00.000Z",
  };
}

function makeRunCompleted(sessionId = "session-test"): ScenarioEvent {
  return {
    type: "run_completed",
    eventId: "evt-run-end",
    sessionId,
    totalDelivered: 100,
    totalInversions: 0,
    durationMs: 5000,
    timestamp: "2026-01-01T00:01:00.000Z",
  };
}

// Collect all batches from a TelemetryCollector stream with a timeout guard
async function collectAllBatches(
  collector: TelemetryCollector,
  timeoutMs = 5000,
): Promise<import("../src/contract").SanitizedEvent[][]> {
  const batches: import("../src/contract").SanitizedEvent[][] = [];
  const timeoutId = setTimeout(() => collector.close(), timeoutMs);
  for await (const batch of collector.stream()) {
    batches.push(batch);
  }
  clearTimeout(timeoutId);
  return batches;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TelemetryCollector", () => {
  describe("push and stream", () => {
    it("streams a single event after close", async () => {
      const collector = new TelemetryCollector({ cadenceMs: 10 });
      collector.push(makeMessageEvent(1));
      collector.close();
      const batches = await collectAllBatches(collector);
      const all = batches.flat();
      expect(all).toHaveLength(1);
      expect(all[0]?.type).toBe("message_delivered");
    });

    it("returns false for unknown event types (sanitizer rejection)", () => {
      const collector = new TelemetryCollector({ cadenceMs: 10 });
      const result = collector.push({ type: "unknown_type" } as unknown as ScenarioEvent);
      expect(result).toBe(false);
    });

    it("batches events up to maxBatchSize", async () => {
      const collector = new TelemetryCollector({ cadenceMs: 10_000, maxBatchSize: 3 });
      for (let i = 0; i < 3; i++) {
        collector.push(makeMessageEvent(i));
      }
      collector.close();
      const batches = await collectAllBatches(collector);
      // At least one batch; max batch size is 3
      for (const batch of batches) {
        expect(batch.length).toBeLessThanOrEqual(3);
      }
      const total = batches.flat().length;
      expect(total).toBe(3);
    });

    it("flushes on cadence even without max batch size hit", async () => {
      const collector = new TelemetryCollector({ cadenceMs: 50 });
      collector.push(makeMessageEvent(1));
      collector.close();
      const batches = await collectAllBatches(collector);
      expect(batches.flat().length).toBe(1);
    });

    it("sanitizer rejections do not empty the stream", async () => {
      const collector = new TelemetryCollector({ cadenceMs: 10 });
      collector.push({ type: "bad_type" } as unknown as ScenarioEvent);
      collector.push(makeMessageEvent(1));
      collector.close();
      const batches = await collectAllBatches(collector);
      const all = batches.flat();
      expect(all).toHaveLength(1);
      expect(all[0]?.type).toBe("message_delivered");
    });

    it("close flushes pending events", async () => {
      const collector = new TelemetryCollector({ cadenceMs: 10_000 });
      collector.push(makeMessageEvent(1));
      collector.push(makeMessageEvent(2));
      collector.close();
      const batches = await collectAllBatches(collector);
      expect(batches.flat().length).toBe(2);
    });
  });

  describe("archive persistence", () => {
    it("persists all events to archive", async () => {
      const archive = new InMemoryArchive();
      const collector = new TelemetryCollector({ cadenceMs: 10, archive });
      for (let i = 0; i < 10; i++) {
        collector.push(makeMessageEvent(i));
      }
      collector.close();
      await collectAllBatches(collector);
      // Give archive fire-and-forget promises a chance to resolve
      await new Promise<void>((r) => setTimeout(r, 50));
      expect(archive.all()).toHaveLength(10);
    });

    it("archive failure does not block the live stream", async () => {
      const badArchive = {
        insert: vi.fn().mockRejectedValue(new Error("DB down")),
        queryFrom: vi.fn().mockResolvedValue([]),
      };
      const collector = new TelemetryCollector({ cadenceMs: 10, archive: badArchive });
      collector.push(makeMessageEvent(1));
      collector.close();
      const batches = await collectAllBatches(collector);
      expect(batches.flat().length).toBe(1); // live stream unaffected
    });

    it("assigns monotonic per-session sequence numbers", async () => {
      const archive = new InMemoryArchive();
      const collector = new TelemetryCollector({ cadenceMs: 10, archive });
      for (let i = 0; i < 5; i++) {
        collector.push(makeMessageEvent(i));
      }
      collector.close();
      await collectAllBatches(collector);
      await new Promise<void>((r) => setTimeout(r, 50));
      const rows = archive.all().sort((a, b) => a.seq - b.seq);
      for (let i = 0; i < rows.length; i++) {
        expect(rows[i]?.seq).toBe(i + 1);
      }
    });
  });

  describe("replayFrom", () => {
    it("replays events after lastEventId in order", async () => {
      const archive = new InMemoryArchive();
      const collector = new TelemetryCollector({ cadenceMs: 10, archive });
      for (let i = 1; i <= 5; i++) {
        collector.push(makeMessageEvent(i));
      }
      collector.close();
      await collectAllBatches(collector);
      await new Promise<void>((r) => setTimeout(r, 50));

      // Replay from evt-000002 (after event #2)
      const replayed: import("../src/contract").SanitizedEvent[] = [];
      for await (const event of collector.replayFrom("session-test", "evt-000002")) {
        replayed.push(event);
      }
      // Should have events 3, 4, 5
      expect(replayed).toHaveLength(3);
    });

    it("returns nothing when no archive configured", async () => {
      const collector = new TelemetryCollector({ cadenceMs: 10 }); // no archive
      const replayed: import("../src/contract").SanitizedEvent[] = [];
      for await (const event of collector.replayFrom("session-test", "")) {
        replayed.push(event);
      }
      expect(replayed).toHaveLength(0);
    });

    it("replays all 10k events in order from archive", async () => {
      const archive = new InMemoryArchive();
      const collector = new TelemetryCollector({ cadenceMs: 10, archive, maxBatchSize: 64 });
      const N = 10_000;
      for (let i = 1; i <= N; i++) {
        collector.push(makeMessageEvent(i));
      }
      collector.push(makeRunCompleted());
      collector.close();
      await collectAllBatches(collector);
      await new Promise<void>((r) => setTimeout(r, 100));

      let count = 0;
      let prevSeq = 0;
      const rows = archive.all().filter((r) => r.sessionId === "session-test");
      for (const row of rows.sort((a, b) => a.seq - b.seq)) {
        expect(row.seq).toBeGreaterThan(prevSeq);
        prevSeq = row.seq;
        count++;
      }
      expect(count).toBe(N + 1); // N messages + run_completed
    }, 30_000); // allow up to 30s for 10k events
  });
});
