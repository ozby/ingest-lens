import { describe, it, expect, beforeEach } from "vitest";
import { LabConcurrencyGauge } from "./concurrency-gauge";

function createMockStorage() {
  const map = new Map<string, unknown>();
  let alarm: number | null = null;
  return {
    async get<T>(key: string): Promise<T | undefined> {
      return map.get(key) as T | undefined;
    },
    async put(key: string, value: unknown): Promise<void> {
      map.set(key, value);
    },
    async getAlarm(): Promise<number | null> {
      return alarm;
    },
    async setAlarm(t: number): Promise<void> {
      alarm = t;
    },
    async deleteAlarm(): Promise<void> {
      alarm = null;
    },
  };
}

function createMockState(storage = createMockStorage()) {
  return {
    storage,
    async blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> {
      return fn();
    },
  };
}

describe("LabConcurrencyGauge", () => {
  let gauge: LabConcurrencyGauge;
  let state: ReturnType<typeof createMockState>;

  beforeEach(() => {
    state = createMockState();
    gauge = new LabConcurrencyGauge(state, { capacity: 100, ttlMs: 300_000 });
  });

  describe("acquire", () => {
    it("grants first session", async () => {
      const result = await gauge.acquire("s1");
      expect(result.granted).toBe(true);
      expect(result.activeCount).toBe(1);
    });

    it("grants 100 concurrent sessions", async () => {
      for (let i = 0; i < 100; i++) {
        const r = await gauge.acquire(`session-${i}`);
        expect(r.granted).toBe(true);
      }
      expect(gauge.snapshot().activeCount).toBe(100);
    });

    it("denies 101st session with retryAfter", async () => {
      for (let i = 0; i < 100; i++) {
        await gauge.acquire(`session-${i}`);
      }
      const r = await gauge.acquire("session-100");
      expect(r.granted).toBe(false);
      expect(r.retryAfter).toBeGreaterThan(0);
    });

    it("re-acquire refreshes TTL without incrementing count", async () => {
      await gauge.acquire("s1");
      const r = await gauge.acquire("s1");
      expect(r.granted).toBe(true);
      expect(gauge.snapshot().activeCount).toBe(1);
    });
  });

  describe("release", () => {
    it("decrements active count", async () => {
      await gauge.acquire("s1");
      await gauge.release("s1");
      expect(gauge.snapshot().activeCount).toBe(0);
    });

    it("is idempotent — double release does not go negative", async () => {
      await gauge.acquire("s1");
      await gauge.release("s1");
      await gauge.release("s1"); // no-op
      expect(gauge.snapshot().activeCount).toBe(0);
    });

    it("releases a session that was never acquired without error", async () => {
      await expect(gauge.release("nonexistent")).resolves.toBeUndefined();
    });

    it("allows new session after release when at capacity", async () => {
      for (let i = 0; i < 100; i++) {
        await gauge.acquire(`session-${i}`);
      }
      await gauge.release("session-0");
      const r = await gauge.acquire("session-new");
      expect(r.granted).toBe(true);
    });
  });

  describe("alarm reaper", () => {
    it("sweeps expired entries on alarm", async () => {
      const g = new LabConcurrencyGauge(state, { capacity: 100, ttlMs: 1 });
      await g.acquire("s1");
      // Force expiry
      const internal = g as unknown as { sessions: Map<string, { expiresAt: number }> };
      for (const [, entry] of internal.sessions) {
        entry.expiresAt = Date.now() - 1000;
      }
      await g.alarm();
      expect(g.snapshot().activeCount).toBe(0);
    });

    it("crashed-holder scenario: alarm sweep clears stale entry", async () => {
      await gauge.acquire("crashed-session");
      const internal = gauge as unknown as { sessions: Map<string, { expiresAt: number }> };
      // Simulate crash: no explicit release, just TTL expiry
      for (const [, entry] of internal.sessions) {
        entry.expiresAt = Date.now() - 1;
      }
      await gauge.alarm();
      expect(gauge.snapshot().activeCount).toBe(0);
    });

    it("alarm is idempotent — repeated calls safe", async () => {
      await gauge.acquire("s1");
      const internal = gauge as unknown as { sessions: Map<string, { expiresAt: number }> };
      for (const [, entry] of internal.sessions) {
        entry.expiresAt = Date.now() - 1;
      }
      await gauge.alarm();
      await gauge.alarm(); // second call
      expect(gauge.snapshot().activeCount).toBe(0);
    });

    it("alarm does not remove unexpired sessions", async () => {
      await gauge.acquire("s1");
      await gauge.alarm();
      expect(gauge.snapshot().activeCount).toBe(1);
    });
  });

  describe("snapshot", () => {
    it("returns capacity", () => {
      const s = gauge.snapshot();
      expect(s.capacity).toBe(100);
    });

    it("returns null oldestExpiryAt when empty", () => {
      const s = gauge.snapshot();
      expect(s.oldestExpiryAt).toBeNull();
    });

    it("returns oldest expiry across multiple sessions", async () => {
      await gauge.acquire("s1");
      await gauge.acquire("s2");
      const s = gauge.snapshot();
      expect(s.oldestExpiryAt).not.toBeNull();
      expect(s.activeCount).toBe(2);
    });
  });

  describe("release-alarm race conditions", () => {
    it("release-before-alarm: both arrive at zero-leak state", async () => {
      await gauge.acquire("s1");
      await gauge.release("s1"); // explicit release first
      // Then alarm fires (expired entry already gone)
      await gauge.alarm();
      expect(gauge.snapshot().activeCount).toBe(0);
    });

    it("alarm-before-release: no double-decrement", async () => {
      await gauge.acquire("s1");
      const internal = gauge as unknown as { sessions: Map<string, { expiresAt: number }> };
      for (const [, entry] of internal.sessions) {
        entry.expiresAt = Date.now() - 1;
      }
      await gauge.alarm(); // alarm sweeps it
      await gauge.release("s1"); // explicit release of already-gone entry
      expect(gauge.snapshot().activeCount).toBe(0);
    });
  });
});
