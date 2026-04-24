import { vi } from "vitest";
import type { Mock } from "vitest";
import { createDb, type Env } from "../db/client";

type MockedDb = ReturnType<typeof createDb>;

export function mockCreateDb(
  shape: Partial<Record<"select" | "insert" | "update" | "delete", Mock>>,
): void {
  vi.mocked(createDb).mockReturnValue(shape as unknown as MockedDb);
}

function deepFreeze<T extends object>(obj: T): Readonly<T> {
  Object.freeze(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    const value = (obj as Record<string, unknown>)[key];
    if (value !== null && typeof value === "object") {
      deepFreeze(value as object);
    }
  }
  return obj as Readonly<T>;
}

export function createMockEnv(
  deliveryQueue?: { send: ReturnType<typeof vi.fn> },
  rateLimiter?: { limit: ReturnType<typeof vi.fn> },
  analytics?: { writeDataPoint: ReturnType<typeof vi.fn> },
  topicRooms?: { idFromName: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> },
  ai?: Ai,
): Env {
  return {
    HYPERDRIVE: null as unknown as Env["HYPERDRIVE"],
    DATABASE_URL: "postgresql://localhost/test",
    JWT_SECRET: "test-secret",
    AI: ai,
    DELIVERY_QUEUE: (deliveryQueue ?? { send: vi.fn() }) as unknown as Env["DELIVERY_QUEUE"],
    RATE_LIMITER: (rateLimiter ?? {
      limit: vi.fn().mockResolvedValue({ success: true }),
    }) as unknown as Env["RATE_LIMITER"],
    ANALYTICS: (analytics ?? { writeDataPoint: vi.fn() }) as unknown as Env["ANALYTICS"],
    TOPIC_ROOMS: (topicRooms ?? {
      idFromName: vi.fn().mockReturnValue("stub-id"),
      get: vi
        .fn()
        .mockReturnValue({ fetch: vi.fn().mockResolvedValue(new Response(null, { status: 200 })) }),
    }) as unknown as Env["TOPIC_ROOMS"],
  };
}

export function bypassAuth(authenticateMock: ReturnType<typeof vi.fn>): void {
  authenticateMock.mockImplementation(async (c: any, next: any) => {
    c.set("user", { userId: "user-123", username: "testuser" });
    await next();
  });
}

// select().from().where().limit(1) — awaited on limit()
export function buildSelectChain(rows: unknown[]): {
  selectMock: Mock;
  fromMock: Mock;
  whereMock: Mock;
  limitMock: Mock;
} {
  const limitMock = vi.fn().mockResolvedValue(rows);
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });
  return { selectMock, fromMock, whereMock, limitMock };
}

// select().from().where(inArray(...)) — awaited on where(), no limit
export function buildUnboundedSelectChain(rows: unknown[]): {
  selectMock: Mock;
  fromMock: Mock;
  whereMock: Mock;
} {
  const whereMock = vi.fn().mockResolvedValue(rows);
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });
  return { selectMock, fromMock, whereMock };
}

// insert().values().returning()
export function buildInsertChain(rows: unknown[]): {
  insertMock: Mock;
  valuesMock: Mock;
  returningMock: Mock;
} {
  const returningMock = vi.fn().mockResolvedValue(rows);
  const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
  const insertMock = vi.fn().mockReturnValue({ values: valuesMock });
  return { insertMock, valuesMock, returningMock };
}

// update().set().where() — awaited on where()
export function buildUpdateChain(rows: unknown[] = []): {
  updateMock: Mock;
  setMock: Mock;
  whereMock: Mock;
} {
  const whereMock = vi.fn().mockResolvedValue(rows);
  const setMock = vi.fn().mockReturnValue({ where: whereMock });
  const updateMock = vi.fn().mockReturnValue({ set: setMock });
  return { updateMock, setMock, whereMock };
}

const BASE = "http://localhost";

export const AUTH_HEADER = { Authorization: "Bearer token" } as const;

export function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, { headers });
}

export function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

export function del(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, { method: "DELETE", headers });
}

export const mockQueue = deepFreeze({
  id: "queue-1",
  name: "test-queue",
  pushEndpoint: "https://example.com/webhook",
  retentionPeriod: 7,
  ownerId: "user-123",
});

export const mockMessage = deepFreeze({
  id: "msg-1",
  seq: 42n,
  data: { key: "value" },
  queueId: "queue-1",
  idempotencyKey: null,
  expiresAt: new Date("2030-01-01"),
  received: false,
  receivedCount: 0,
  createdAt: new Date("2026-01-01"),
  receivedAt: null,
});

export const mockTopic = deepFreeze({
  id: "topic-1",
  name: "test-topic",
  ownerId: "user-123",
  subscribedQueues: ["queue-1"],
});
