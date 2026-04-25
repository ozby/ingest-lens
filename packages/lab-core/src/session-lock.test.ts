import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionLock } from "./session-lock";
import { DEFAULT_TTL_MS } from "./lock-state";

// ---------------------------------------------------------------------------
// Minimal DO storage mock — synchronous in-memory KV
// ---------------------------------------------------------------------------

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
    async delete(key: string): Promise<boolean> {
      return map.delete(key);
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
    _getAlarm(): number | null {
      return alarm;
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SessionLock", () => {
  let lock: SessionLock;
  let state: ReturnType<typeof createMockState>;

  beforeEach(() => {
    state = createMockState();
    lock = new SessionLock(state);
  });

  describe("acquire", () => {
    it("grants the lock when slot is empty", async () => {
      const result = await lock.acquire("session-1");
      expect(result.granted).toBe(true);
      expect(result.sessionId).toBe("session-1");
    });

    it("returns same-session re-grant idempotently", async () => {
      await lock.acquire("session-1");
      const result = await lock.acquire("session-1");
      expect(result.granted).toBe(true);
    });

    it("queues second session when slot is taken", async () => {
      await lock.acquire("session-1");
      const result = await lock.acquire("session-2");
      expect(result.granted).toBe(false);
      expect(result.position).toBe(1);
    });

    it("assigns increasing queue positions to multiple waiters", async () => {
      await lock.acquire("session-1");
      const r2 = await lock.acquire("session-2");
      const r3 = await lock.acquire("session-3");
      expect(r2.position).toBe(1);
      expect(r3.position).toBe(2);
    });

    it("sets alarm only once (F6T: check getAlarm before setAlarm)", async () => {
      const setAlarmSpy = vi.spyOn(state.storage, "setAlarm");
      await lock.acquire("session-1");
      await lock.acquire("session-1"); // re-acquire same session
      // alarm should be set only once
      expect(setAlarmSpy).toHaveBeenCalledTimes(1);
    });

    it("uses configurable TTL", async () => {
      const customTtl = 60_000;
      const before = Date.now();
      await lock.acquire("session-1", customTtl);
      const alarmTime = await state.storage.getAlarm();
      expect(alarmTime).toBeGreaterThanOrEqual(before + customTtl - 100);
    });

    it("defaults to 300_000ms TTL", async () => {
      const before = Date.now();
      await lock.acquire("session-1");
      const alarmTime = await state.storage.getAlarm();
      expect(alarmTime).toBeGreaterThanOrEqual(before + DEFAULT_TTL_MS - 100);
    });

    it("does not enqueue the same waiter twice", async () => {
      await lock.acquire("session-1");
      await lock.acquire("session-2");
      await lock.acquire("session-2"); // duplicate
      const { waiters } = lock.getStorage();
      const count = waiters.filter((w) => w.sessionId === "session-2").length;
      expect(count).toBe(1);
    });
  });

  describe("release", () => {
    it("releases the lock and returns released=true", async () => {
      await lock.acquire("session-1");
      const result = await lock.release("session-1");
      expect(result.released).toBe(true);
    });

    it("promotes first waiter to holder on release", async () => {
      await lock.acquire("session-1");
      await lock.acquire("session-2");
      const result = await lock.release("session-1");
      expect(result.nextHolder).toBe("session-2");
      const { holder } = lock.getStorage();
      expect(holder?.sessionId).toBe("session-2");
    });

    it("returns released=false if not the holder", async () => {
      await lock.acquire("session-1");
      const result = await lock.release("session-99");
      expect(result.released).toBe(false);
    });

    it("removes session from waiters if it releases while queued", async () => {
      await lock.acquire("session-1");
      await lock.acquire("session-2");
      await lock.release("session-2"); // release from queue
      const { waiters } = lock.getStorage();
      expect(waiters.find((w) => w.sessionId === "session-2")).toBeUndefined();
    });

    it("clears alarm when queue is empty after release", async () => {
      await lock.acquire("session-1");
      await lock.release("session-1");
      const alarmTime = await state.storage.getAlarm();
      expect(alarmTime).toBeNull();
    });
  });

  describe("waitingRoom", () => {
    it("returns position 0 for unknown sessionId", () => {
      const result = lock.waitingRoom("unknown");
      expect(result.position).toBe(0);
      expect(result.queueLength).toBe(0);
    });

    it("returns correct position for queued session", async () => {
      await lock.acquire("session-1");
      await lock.acquire("session-2");
      await lock.acquire("session-3");
      const r2 = lock.waitingRoom("session-2");
      const r3 = lock.waitingRoom("session-3");
      expect(r2.position).toBe(1);
      expect(r3.position).toBe(2);
    });

    it("returns etaMs > 0 for queued session", async () => {
      await lock.acquire("session-1");
      await lock.acquire("session-2");
      const result = lock.waitingRoom("session-2");
      expect(result.etaMs).toBeGreaterThan(0);
    });
  });

  describe("alarm (TTL auto-release)", () => {
    it("releases expired holder on alarm", async () => {
      await lock.acquire("session-1", 1); // 1ms TTL
      // Simulate time passing by mocking the holder's acquiredAt
      const storage = lock.getStorage();
      expect(storage.holder).not.toBeNull();
      // Force expire: set acquiredAt far in the past
      const s = lock as unknown as {
        holder: { sessionId: string; acquiredAt: number; ttlMs: number };
      };
      s.holder.acquiredAt = Date.now() - 10_000; // expired 10 seconds ago
      s.holder.ttlMs = 1;
      await lock.alarm();
      const { holder } = lock.getStorage();
      expect(holder).toBeNull();
    });

    it("promotes next waiter after TTL alarm fires", async () => {
      await lock.acquire("session-1", 1);
      await lock.acquire("session-2");
      // Force expire
      const s = lock as unknown as {
        holder: { sessionId: string; acquiredAt: number; ttlMs: number };
      };
      s.holder.acquiredAt = Date.now() - 10_000;
      s.holder.ttlMs = 1;
      await lock.alarm();
      const { holder } = lock.getStorage();
      expect(holder?.sessionId).toBe("session-2");
    });

    it("alarm handler is idempotent (repeated calls are safe)", async () => {
      await lock.acquire("session-1", 1);
      const s = lock as unknown as {
        holder: { sessionId: string; acquiredAt: number; ttlMs: number };
      };
      s.holder.acquiredAt = Date.now() - 10_000;
      s.holder.ttlMs = 1;
      await lock.alarm();
      await lock.alarm(); // second call — should not throw or double-release
      const { holder } = lock.getStorage();
      expect(holder).toBeNull();
    });

    it("does not release unexpired holder on alarm", async () => {
      await lock.acquire("session-1", DEFAULT_TTL_MS);
      await lock.alarm(); // alarm fires but holder is not expired
      const { holder } = lock.getStorage();
      expect(holder?.sessionId).toBe("session-1");
    });
  });
});
