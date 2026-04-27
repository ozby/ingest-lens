import { describe, it, expect, beforeEach, vi } from "vitest";
import { HealStreamDO } from "../consumers/HealStreamDO";
import { shapeFingerprint } from "../intake/shapeFingerprint";
import type { MappingSuggestion } from "@repo/types";

vi.mock("../db/client");

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

function createMockDOState(): DurableObjectState {
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
    deterministicValidation: { isValid: true, validatedAt: "2026-01-01T00:00:00.000Z", errors: [] },
    reviewStatus: "pending",
    replayStatus: "not_requested",
    ...overrides,
  };
}

async function postTryHeal(
  do_: HealStreamDO,
  payload: Record<string, unknown>,
  suggestions: MappingSuggestion[],
): Promise<{ healed: boolean; suggestions?: MappingSuggestion[] }> {
  const req = new Request("https://do/tryHeal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      batch: { suggestions, mappingTraceId: "trace-1", driftCategories: ["renamed_field"] },
      payloadFingerprint: shapeFingerprint(payload),
      attemptId: "attempt-1",
      sourceSystem: "test",
      contractId: "c1",
      contractVersion: "v1",
      ownerId: "owner-1",
    }),
  });
  const res = await do_.fetch(req);
  return res.json<{ healed: boolean; suggestions?: MappingSuggestion[] }>();
}

async function getState(
  do_: HealStreamDO,
): Promise<{ approved: { fingerprint: string; suggestions: MappingSuggestion[] } | null }> {
  const res = await do_.fetch(new Request("https://do/state"));
  return res.json<{ approved: { fingerprint: string; suggestions: MappingSuggestion[] } | null }>();
}

describe("HealStreamDO", () => {
  let mockState: DurableObjectState;
  let healDO: HealStreamDO;

  beforeEach(() => {
    vi.clearAllMocks();
    mockState = createMockDOState();
    healDO = new HealStreamDO(mockState, {} as never);
  });

  describe("tryHeal()", () => {
    it("heals once on first call (returns healed: true and reserves in-memory)", async () => {
      const result = await postTryHeal(healDO, { first_name: "Alice" }, [makeSuggestion()]);
      expect(result.healed).toBe(true);
      // tryHeal reserves in pending; storage write happens only on commitHeal
      expect(mockState.storage.put).not.toHaveBeenCalled();
    });

    it("is a no-op on second call with same payload shape (returns healed: false)", async () => {
      const payload = { first_name: "Alice" };
      const suggestions = [makeSuggestion()];

      const first = await postTryHeal(healDO, payload, suggestions);
      expect(first.healed).toBe(true);

      const second = await postTryHeal(healDO, payload, suggestions);
      expect(second.healed).toBe(false);

      expect(mockState.storage.put).not.toHaveBeenCalled();
    });

    it("heals again when payload shape changes", async () => {
      const first = await postTryHeal(healDO, { first_name: "Alice" }, [makeSuggestion()]);
      expect(first.healed).toBe(true);

      const second = await postTryHeal(healDO, { first_name: "Bob", last_name: "Smith" }, [
        makeSuggestion(),
      ]);
      expect(second.healed).toBe(true);

      expect(mockState.storage.put).not.toHaveBeenCalled();
    });
  });

  describe("getState()", () => {
    it("returns approved: null on cold start", async () => {
      const result = await getState(healDO);
      expect(result.approved).toBeNull();
    });

    it("returns approved state with correct fingerprint after heal via commitHeal", async () => {
      const payload = { first_name: "Alice" };
      await postTryHeal(healDO, payload, [makeSuggestion()]);

      // Commit the heal so approved state is persisted
      const commitReq = new Request("https://do/commitHeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mappingVersionId: "rev-1",
          payloadFingerprint: shapeFingerprint(payload),
          suggestions: [makeSuggestion()],
          latencyMs: 10,
        }),
      });
      await healDO.fetch(commitReq);

      const result = await getState(healDO);
      expect(result.approved).not.toBeNull();
      expect(result.approved!.fingerprint).toBe(shapeFingerprint(payload));
    });
  });
});
