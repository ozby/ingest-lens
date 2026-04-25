import { describe, it, expect } from "vitest";
import { buildWorkload, buildWorkloadArray } from "./workload";

describe("buildWorkload", () => {
  it("returns n messages for n=10", () => {
    const msgs = buildWorkloadArray("session-abc", 10);
    expect(msgs).toHaveLength(10);
  });

  it("returns 10_000 messages with distinct msg_ids and seq 1..10000", () => {
    const msgs = buildWorkloadArray("session-large", 10_000);
    expect(msgs).toHaveLength(10_000);

    const ids = new Set(msgs.map((m) => m.msg_id));
    expect(ids.size).toBe(10_000);

    expect(msgs[0]!.seq).toBe(1);
    expect(msgs[9_999]!.seq).toBe(10_000);

    for (let i = 0; i < msgs.length; i++) {
      expect(msgs[i]!.seq).toBe(i + 1);
    }
  });

  it("all messages carry the correct session_id", () => {
    const sid = "test-session-999";
    const msgs = buildWorkloadArray(sid, 100);
    for (const m of msgs) {
      expect(m.session_id).toBe(sid);
    }
  });

  it("is deterministic: same sessionId produces same sequence", () => {
    const sid = "deterministic-session";
    const first = buildWorkloadArray(sid, 50);
    const second = buildWorkloadArray(sid, 50);
    expect(first).toEqual(second);
  });

  it("payload is a 64-char hex string", () => {
    const msgs = buildWorkloadArray("payload-test", 5);
    for (const m of msgs) {
      expect(m.payload).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(m.payload)).toBe(true);
    }
  });

  it("different sessionIds produce different sequences", () => {
    const a = buildWorkloadArray("sid-a", 10);
    const b = buildWorkloadArray("sid-b", 10);
    // Extremely unlikely to collide
    expect(a.map((m) => m.msg_id)).not.toEqual(b.map((m) => m.msg_id));
  });

  it("generator is O(n): yields messages one at a time", () => {
    const gen = buildWorkload("stream-test", 5);
    const collected: number[] = [];
    for (const m of gen) {
      collected.push(m.seq);
    }
    expect(collected).toEqual([1, 2, 3, 4, 5]);
  });

  it("handles n=0 gracefully", () => {
    const msgs = buildWorkloadArray("empty-session", 0);
    expect(msgs).toHaveLength(0);
  });

  it("handles n=1", () => {
    const msgs = buildWorkloadArray("single-session", 1);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.seq).toBe(1);
  });
});
