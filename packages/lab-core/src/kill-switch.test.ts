import { describe, it, expect, vi, beforeEach } from "vitest";
import { KillSwitchKV } from "./kill-switch";
import type { KVNamespace } from "./kill-switch";

// ---------------------------------------------------------------------------
// Mock KV namespace
// ---------------------------------------------------------------------------

function createMockKV(): KVNamespace & { _store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    _store: store,
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string): Promise<void> {
      store.set(key, value);
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("KillSwitchKV", () => {
  let kv: ReturnType<typeof createMockKV>;
  let ks: KillSwitchKV;

  beforeEach(() => {
    kv = createMockKV();
    ks = new KillSwitchKV(kv);
  });

  describe("read", () => {
    it("returns default enabled=true when key is missing", async () => {
      const state = await ks.read();
      expect(state.enabled).toBe(true);
    });

    it("returns stored state when key exists", async () => {
      const stored = {
        enabled: false,
        reason: "cost limit",
        flippedAt: "2026-01-01T00:00:00.000Z",
      };
      await kv.put("lab:kill-switch", JSON.stringify(stored));
      ks.invalidateCache();
      const state = await ks.read();
      expect(state.enabled).toBe(false);
      expect(state.reason).toBe("cost limit");
    });

    it("uses local cache within 5s TTL", async () => {
      const getSpy = vi.spyOn(kv, "get");
      await ks.read();
      await ks.read(); // second read should hit cache
      expect(getSpy).toHaveBeenCalledTimes(1);
    });

    it("re-fetches after cache TTL expires", async () => {
      const getSpy = vi.spyOn(kv, "get");
      await ks.read();
      // Force cache expiry by invalidating
      ks.invalidateCache();
      await ks.read();
      expect(getSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("write", () => {
    it("persists state to KV", async () => {
      const state = {
        enabled: false,
        reason: "manual disable",
        flippedAt: "2026-01-01T00:00:00.000Z",
      };
      await ks.write(state);
      const raw = kv._store.get("lab:kill-switch");
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw!).enabled).toBe(false);
    });

    it("updates cache after write", async () => {
      const getSpy = vi.spyOn(kv, "get");
      await ks.write({
        enabled: false,
        reason: "test",
        flippedAt: "2026-01-01T00:00:00.000Z",
      });
      await ks.read(); // should read from cache
      expect(getSpy).not.toHaveBeenCalled();
    });
  });

  describe("flip", () => {
    it("flips enabled to false with reason", async () => {
      const result = await ks.flip({
        enabled: false,
        reason: "cost limit hit",
        now: "2026-01-01T00:00:00.000Z",
      });
      expect(result.enabled).toBe(false);
      expect(result.reason).toBe("cost limit hit");
      expect(result.flippedAt).toBe("2026-01-01T00:00:00.000Z");
    });

    it("flip is idempotent: same enabled + same reason is a no-op", async () => {
      const putSpy = vi.spyOn(kv, "put");
      // First flip
      await ks.flip({ enabled: false, reason: "cost limit", now: "2026-01-01T00:00:00.000Z" });
      putSpy.mockClear();
      // Second flip with same params
      await ks.flip({ enabled: false, reason: "cost limit", now: "2026-01-01T00:00:00.000Z" });
      expect(putSpy).not.toHaveBeenCalled();
    });

    it("supports autoResetAt field for Lane E daily reset", async () => {
      const result = await ks.flip({
        enabled: false,
        reason: "daily cost cap",
        autoResetAt: "2026-01-02T00:00:00.000Z",
        now: "2026-01-01T12:00:00.000Z",
      });
      expect(result.autoResetAt).toBe("2026-01-02T00:00:00.000Z");
    });

    it("different reason on same enabled triggers a write", async () => {
      const putSpy = vi.spyOn(kv, "put");
      await ks.flip({ enabled: false, reason: "reason-1", now: "2026-01-01T00:00:00.000Z" });
      putSpy.mockClear();
      await ks.flip({ enabled: false, reason: "reason-2", now: "2026-01-01T00:00:00.000Z" });
      expect(putSpy).toHaveBeenCalledTimes(1);
    });

    it("flipping back to enabled records flippedAt", async () => {
      await ks.flip({ enabled: false, reason: "cost limit", now: "2026-01-01T00:00:00.000Z" });
      const result = await ks.flip({
        enabled: true,
        reason: "reset",
        now: "2026-01-02T00:00:00.000Z",
      });
      expect(result.enabled).toBe(true);
      expect(result.flippedAt).toBe("2026-01-02T00:00:00.000Z");
    });
  });

  describe("round-trip", () => {
    it("write then read returns the same state", async () => {
      const state = {
        enabled: false,
        reason: "round-trip test",
        flippedAt: "2026-01-01T00:00:00.000Z",
        autoResetAt: "2026-01-02T00:00:00.000Z",
      };
      await ks.write(state);
      const read = await ks.read();
      expect(read).toEqual(state);
    });
  });
});
