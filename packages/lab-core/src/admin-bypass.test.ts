import { describe, it, expect, vi } from "vitest";
import {
  timingSafeEqual,
  isValidAdminToken,
  extractAdminToken,
  writeAdminAuditEntry,
  hashToken,
} from "./admin-bypass";
import type { AdminBypassAuditRow, KVNamespaceAdmin } from "./admin-bypass";

// ---------------------------------------------------------------------------
// Mock KV
// ---------------------------------------------------------------------------

function createMockKV(): KVNamespaceAdmin & { _store: Map<string, string> } {
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
// timingSafeEqual
// ---------------------------------------------------------------------------

describe("timingSafeEqual", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqual("secret123", "secret123")).toBe(true);
  });

  it("returns false for different strings of same length", () => {
    expect(timingSafeEqual("secret123", "secret124")).toBe(false);
  });

  it("returns false for strings of different lengths", () => {
    expect(timingSafeEqual("short", "longer-string")).toBe(false);
  });

  it("returns false for empty vs non-empty", () => {
    expect(timingSafeEqual("", "secret")).toBe(false);
  });

  it("returns true for two empty strings", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });

  it("returns false for prefix match (not a full match)", () => {
    expect(timingSafeEqual("secret", "secretExtra")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidAdminToken
// ---------------------------------------------------------------------------

describe("isValidAdminToken", () => {
  it("returns true when token matches secret", () => {
    expect(isValidAdminToken("my-secret", "my-secret")).toBe(true);
  });

  it("returns false when token does not match secret", () => {
    expect(isValidAdminToken("wrong-token", "my-secret")).toBe(false);
  });

  it("returns false when secret is undefined", () => {
    expect(isValidAdminToken("any-token", undefined)).toBe(false);
  });

  it("returns false when secret is empty string", () => {
    expect(isValidAdminToken("any-token", "")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(isValidAdminToken("Secret", "secret")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractAdminToken
// ---------------------------------------------------------------------------

describe("extractAdminToken", () => {
  it("returns the token when X-Lab-Admin-Token header is present", () => {
    const headers = { get: (name: string) => (name === "X-Lab-Admin-Token" ? "tok-abc" : null) };
    expect(extractAdminToken(headers)).toBe("tok-abc");
  });

  it("returns null when header is absent", () => {
    const headers = { get: (_name: string) => null };
    expect(extractAdminToken(headers)).toBeNull();
  });

  it("returns null when header is empty string", () => {
    const headers = { get: (_name: string) => "" };
    expect(extractAdminToken(headers)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// hashToken
// ---------------------------------------------------------------------------

describe("hashToken", () => {
  it("returns a 64-char hex string (SHA-256)", async () => {
    const hash = await hashToken("test-token");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for same input", async () => {
    const h1 = await hashToken("deterministic");
    const h2 = await hashToken("deterministic");
    expect(h1).toBe(h2);
  });

  it("produces different hashes for different inputs", async () => {
    const h1 = await hashToken("token-a");
    const h2 = await hashToken("token-b");
    expect(h1).not.toBe(h2);
  });
});

// ---------------------------------------------------------------------------
// writeAdminAuditEntry
// ---------------------------------------------------------------------------

describe("writeAdminAuditEntry", () => {
  it("writes audit entry to KV with correct key", async () => {
    const kv = createMockKV();
    const entry: AdminBypassAuditRow = {
      action: "admin_bypass",
      actorId: "heartbeat-cron",
      tokenHash: "abc123",
      isAdminBypass: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    await writeAdminAuditEntry(kv, entry);
    const stored = kv._store.get("lab:admin-audit:2026-01-01T00:00:00.000Z");
    expect(stored).not.toBeUndefined();
    const parsed = JSON.parse(stored!) as AdminBypassAuditRow;
    expect(parsed.action).toBe("admin_bypass");
    expect(parsed.isAdminBypass).toBe(true);
    expect(parsed.tokenHash).toBe("abc123");
  });

  it("serializes all fields correctly", async () => {
    const kv = createMockKV();
    const entry: AdminBypassAuditRow = {
      action: "kill_switch_flip",
      actorId: "cost-estimator-cron",
      tokenHash: "deadbeef",
      isAdminBypass: true,
      createdAt: "2026-06-15T12:00:00.000Z",
    };
    await writeAdminAuditEntry(kv, entry);
    const stored = kv._store.get("lab:admin-audit:2026-06-15T12:00:00.000Z");
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored!) as AdminBypassAuditRow;
    expect(parsed.actorId).toBe("cost-estimator-cron");
  });

  it("calls kv.put exactly once per entry", async () => {
    const kv = createMockKV();
    const putSpy = vi.spyOn(kv, "put");
    const entry: AdminBypassAuditRow = {
      action: "admin_bypass",
      actorId: "heartbeat-cron",
      tokenHash: "hash",
      isAdminBypass: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    await writeAdminAuditEntry(kv, entry);
    expect(putSpy).toHaveBeenCalledTimes(1);
  });
});
