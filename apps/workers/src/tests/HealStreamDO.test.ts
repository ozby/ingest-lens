import { describe, it, expect, beforeEach, vi } from "vitest";
import { HealStreamDO } from "../consumers/HealStreamDO";
import { shapeFingerprint } from "../intake/shapeFingerprint";
import type { MappingSuggestion } from "@repo/types";
import { createMockEnv } from "./helpers";

// Minimal mock DurableObjectState backed by a Map for synchronous reads/writes.
function createMockStorage(): DurableObjectStorage {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn(async <T>(key: string) => store.get(key) as T | undefined),
    put: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => store.delete(key)),
    list: vi.fn(async () => new Map()),
    deleteAll: vi.fn(async () => {
      store.clear();
    }),
    getAlarm: vi.fn(async () => null),
    setAlarm: vi.fn(async () => {}),
    deleteAlarm: vi.fn(async () => {}),
    sync: vi.fn(async () => {}),
    transactionSync: vi.fn(),
    transaction: vi.fn(async (cb: (txn: DurableObjectStorage) => unknown) =>
      cb({} as DurableObjectStorage),
    ),
    sql: {} as DurableObjectStorage["sql"],
    getCurrentBookmark: vi.fn(async () => ""),
    getBookmarkForTime: vi.fn(async () => ""),
    onNextSessionRestoreBookmark: vi.fn(),
  } as unknown as DurableObjectStorage;
}

function createMockState(): DurableObjectState {
  return {
    storage: createMockStorage(),
    id: {
      toString: () => "heal-stream-test-id",
      equals: vi.fn(),
      name: "test",
    } as unknown as DurableObjectId,
    waitUntil: vi.fn(),
    blockConcurrencyWhile: vi.fn(async (fn: () => unknown) => fn()),
    acceptWebSocket: vi.fn(),
    getWebSockets: vi.fn(() => []),
    setWebSocketAutoResponse: vi.fn(),
    getWebSocketAutoResponse: vi.fn(),
    getWebSocketAutoResponseTimestamp: vi.fn(),
    getTags: vi.fn(() => []),
    setHibernatableWebSocketEventTimeout: vi.fn(),
    getHibernatableWebSocketEventTimeout: vi.fn(),
  } as unknown as DurableObjectState;
}

function makeSuggestion(overrides: Partial<MappingSuggestion> = {}): MappingSuggestion {
  return {
    id: "suggestion-1",
    sourcePath: "/first_name",
    targetField: "first_name",
    transformKind: "copy",
    confidence: 0.99,
    explanation: "Direct copy.",
    evidenceSample: "Alice",
    deterministicValidation: {
      isValid: true,
      validatedAt: "2026-01-01T00:00:00.000Z",
      errors: [],
    },
    reviewStatus: "pending",
    replayStatus: "not_requested",
    ...overrides,
  };
}

async function postTryHeal(
  do_: HealStreamDO,
  payload: Record<string, unknown>,
  suggestions: MappingSuggestion[],
): Promise<{ healed: boolean; fingerprint: string }> {
  const req = new Request("https://do/tryHeal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload, suggestions, approvedAt: "2026-01-01T00:00:00.000Z" }),
  });
  const res = await do_.fetch(req);
  return res.json<{ healed: boolean; fingerprint: string }>();
}

async function getState(do_: HealStreamDO): Promise<unknown> {
  const req = new Request("https://do/state");
  const res = await do_.fetch(req);
  return res.json();
}

describe("HealStreamDO", () => {
  let state: DurableObjectState;
  let healDO: HealStreamDO;

  beforeEach(() => {
    vi.clearAllMocks();
    state = createMockState();
    healDO = new HealStreamDO(state, createMockEnv());
  });

  describe("tryHeal()", () => {
    it("heals once on first call (returns healed: true)", async () => {
      const payload = { first_name: "Alice" };
      const suggestions = [makeSuggestion()];

      const result = await postTryHeal(healDO, payload, suggestions);

      expect(result.healed).toBe(true);
      expect(result.fingerprint).toBe(shapeFingerprint(payload));
    });

    it("is a no-op on second call with same fingerprint (returns healed: false)", async () => {
      const payload = { first_name: "Alice" };
      const suggestions = [makeSuggestion()];

      const first = await postTryHeal(healDO, payload, suggestions);
      expect(first.healed).toBe(true);

      // Second call with the same shape — fingerprint matches → no-op.
      const second = await postTryHeal(healDO, payload, suggestions);
      expect(second.healed).toBe(false);
      expect(second.fingerprint).toBe(first.fingerprint);

      // Storage.put() was called exactly once (for the first heal only).
      expect(state.storage.put).toHaveBeenCalledTimes(1);
    });

    it("heals again when the payload shape changes", async () => {
      const suggestions = [makeSuggestion()];

      const first = await postTryHeal(healDO, { first_name: "Alice" }, suggestions);
      expect(first.healed).toBe(true);

      // Different shape (extra key) → different fingerprint → should heal again.
      const second = await postTryHeal(
        healDO,
        { first_name: "Bob", last_name: "Smith" },
        suggestions,
      );
      expect(second.healed).toBe(true);
      expect(second.fingerprint).not.toBe(first.fingerprint);
    });
  });

  describe("getState()", () => {
    it("returns null on cold start", async () => {
      const result = await getState(healDO);
      expect(result).toBeNull();
    });

    it("returns approved state after heal", async () => {
      const payload = { first_name: "Alice" };
      const suggestions = [makeSuggestion()];

      await postTryHeal(healDO, payload, suggestions);

      const result = (await getState(healDO)) as {
        approved: { fingerprint: string; suggestions: MappingSuggestion[] };
      };
      expect(result).not.toBeNull();
      expect(result.approved.fingerprint).toBe(shapeFingerprint(payload));
      expect(result.approved.suggestions).toHaveLength(1);
    });
  });
});
