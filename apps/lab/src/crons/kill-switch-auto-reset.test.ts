import { describe, it, expect, vi, beforeEach } from "vitest";
import { runKillSwitchAutoReset } from "./kill-switch-auto-reset";
import type { AutoResetDeps, AutoResetOutcome } from "./kill-switch-auto-reset";
import { KillSwitchKV } from "@repo/lab-core";
import type { KVNamespace } from "@repo/lab-core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockKV(): KVNamespace & { _store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    _store: store,
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}

function makeDeps(ksKv: KVNamespace, overrides: Partial<AutoResetDeps> = {}): AutoResetDeps {
  return {
    killSwitch: new KillSwitchKV(ksKv),
    kv: createMockKV(),
    webhookUrl: "https://hooks.example.com/reset",
    webhook: { send: vi.fn().mockResolvedValue(undefined) },
    now: "2026-01-15T00:00:00.000Z",
    ...overrides,
  };
}

async function setKillSwitchDisabled(ksKv: KVNamespace, autoResetAt?: string): Promise<void> {
  const state = {
    enabled: false,
    reason: "cost-ceiling",
    flippedAt: "2026-01-14T12:00:00.000Z",
    ...(autoResetAt !== undefined ? { autoResetAt } : {}),
  };
  await ksKv.put("lab:kill-switch", JSON.stringify(state));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runKillSwitchAutoReset — no-op when already enabled", () => {
  it("returns no-op when kill switch is enabled", async () => {
    const ksKv = createMockKV();
    const deps = makeDeps(ksKv);
    // Default state: enabled=true
    const result = await runKillSwitchAutoReset(deps);
    expect(result.action).toBe("no-op");
    expect((result as { action: "no-op"; reason: string }).reason).toBe(
      "kill-switch-already-enabled",
    );
  });
});

describe("runKillSwitchAutoReset — no-op when autoResetAt not set", () => {
  it("returns no-op when manually disabled without autoResetAt", async () => {
    const ksKv = createMockKV();
    await setKillSwitchDisabled(ksKv); // no autoResetAt
    const deps = makeDeps(ksKv);
    const result = await runKillSwitchAutoReset(deps);
    expect(result.action).toBe("no-op");
    expect((result as { action: "no-op"; reason: string }).reason).toBe("no-auto-reset-at-set");
  });
});

describe("runKillSwitchAutoReset — no-op when autoResetAt in future", () => {
  it("does not reset when autoResetAt is still in the future", async () => {
    const ksKv = createMockKV();
    // now = 2026-01-15T00:00:00Z, autoResetAt is tomorrow
    await setKillSwitchDisabled(ksKv, "2026-01-16T00:00:00.000Z");
    const deps = makeDeps(ksKv, { now: "2026-01-15T00:00:00.000Z" });
    const result = await runKillSwitchAutoReset(deps);
    expect(result.action).toBe("no-op");
    expect((result as { action: "no-op"; reason: string }).reason).toBe("auto-reset-at-in-future");
  });

  it("resets when autoResetAt is exactly now", async () => {
    const ksKv = createMockKV();
    await setKillSwitchDisabled(ksKv, "2026-01-15T00:00:00.000Z");
    const deps = makeDeps(ksKv, { now: "2026-01-15T00:00:00.000Z" });
    const result = await runKillSwitchAutoReset(deps);
    expect(result.action).toBe("reset");
  });
});

describe("runKillSwitchAutoReset — successful reset", () => {
  it("flips kill switch to enabled and records in reset log", async () => {
    const ksKv = createMockKV();
    await setKillSwitchDisabled(ksKv, "2026-01-14T00:00:00.000Z");
    const kv = createMockKV();
    const deps = makeDeps(ksKv, { kv, now: "2026-01-15T00:00:00.000Z" });

    const result = await runKillSwitchAutoReset(deps);
    expect(result.action).toBe("reset");

    // Kill switch should be enabled now
    const ks = new KillSwitchKV(ksKv);
    ks.invalidateCache();
    const state = await ks.read();
    expect(state.enabled).toBe(true);
    expect(state.reason).toBe("auto-reset");

    // Reset log should have one entry
    const logRaw = kv._store.get("lab:kill-switch:auto-reset-log");
    expect(logRaw).toBeDefined();
    const log = JSON.parse(logRaw!) as string[];
    expect(log).toHaveLength(1);
    expect(log[0]).toBe("2026-01-15T00:00:00.000Z");
  });

  it("increments reset counter across multiple resets", async () => {
    const ksKv = createMockKV();
    const kv = createMockKV();

    // First reset
    await setKillSwitchDisabled(ksKv, "2026-01-13T00:00:00.000Z");
    const deps1 = makeDeps(ksKv, { kv, now: "2026-01-13T00:00:00.000Z" });
    await runKillSwitchAutoReset(deps1);

    // Second reset (need to disable again)
    const ks = new KillSwitchKV(ksKv);
    ks.invalidateCache();
    await ks.flip({
      enabled: false,
      reason: "cost-ceiling",
      autoResetAt: "2026-01-14T00:00:00.000Z",
      now: "2026-01-13T12:00:00.000Z",
    });
    const deps2 = makeDeps(ksKv, { kv, now: "2026-01-14T00:00:00.000Z" });
    await runKillSwitchAutoReset(deps2);

    const logRaw = kv._store.get("lab:kill-switch:auto-reset-log");
    const log = JSON.parse(logRaw!) as string[];
    expect(log).toHaveLength(2);
  });
});

describe("runKillSwitchAutoReset — 3 resets per 7-day cap", () => {
  it("emits webhook and does not reset when cap is reached", async () => {
    const ksKv = createMockKV();
    const kv = createMockKV();
    const webhook = { send: vi.fn().mockResolvedValue(undefined) };

    // Pre-seed 3 resets within the past 7 days
    const recentResets = [
      "2026-01-09T00:00:00.000Z",
      "2026-01-11T00:00:00.000Z",
      "2026-01-13T00:00:00.000Z",
    ];
    await kv.put("lab:kill-switch:auto-reset-log", JSON.stringify(recentResets));

    await setKillSwitchDisabled(ksKv, "2026-01-14T00:00:00.000Z");
    const deps = makeDeps(ksKv, {
      kv,
      webhook,
      now: "2026-01-15T00:00:00.000Z",
    });

    const result = await runKillSwitchAutoReset(deps);
    expect(result.action).toBe("cap-reached");

    // Kill switch must still be disabled
    const ks2 = new KillSwitchKV(ksKv);
    ks2.invalidateCache();
    const state = await ks2.read();
    expect(state.enabled).toBe(false);

    // Webhook fires with the right payload
    expect(webhook.send).toHaveBeenCalledTimes(1);
    const [, payload] = webhook.send.mock.calls[0] as [
      string,
      { alert: string; lastResets: string[] },
    ];
    expect(payload.alert).toBe("kill_switch_auto_reset_cap_reached");
    expect(payload.lastResets).toHaveLength(3);
  });

  it("rolls off entries older than 7 days when counting", async () => {
    const ksKv = createMockKV();
    const kv = createMockKV();
    const webhook = { send: vi.fn().mockResolvedValue(undefined) };

    // 3 resets, but 2 are older than 7 days from now (2026-01-15)
    const resets = [
      "2026-01-01T00:00:00.000Z", // 14 days ago — outside window
      "2026-01-02T00:00:00.000Z", // 13 days ago — outside window
      "2026-01-12T00:00:00.000Z", // 3 days ago — inside window
    ];
    await kv.put("lab:kill-switch:auto-reset-log", JSON.stringify(resets));

    await setKillSwitchDisabled(ksKv, "2026-01-14T00:00:00.000Z");
    const deps = makeDeps(ksKv, {
      kv,
      webhook,
      now: "2026-01-15T00:00:00.000Z",
    });

    // Only 1 reset in window → should reset successfully
    const result = await runKillSwitchAutoReset(deps);
    expect(result.action).toBe("reset");
    expect(webhook.send).not.toHaveBeenCalled();
  });
});

describe("KillSwitchKV.invalidateCache helper", () => {
  it("is accessible on KillSwitchKV instance", () => {
    const kv = createMockKV();
    const ks = new KillSwitchKV(kv);
    expect(typeof ks.invalidateCache).toBe("function");
  });
});
