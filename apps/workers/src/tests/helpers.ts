import { vi } from "vitest";
import type { Mock } from "vitest";
import type { Context, Next } from "hono";
import {
  createMockHyperdrive,
  createMockDurableObjectNamespace,
} from "@webpresso/workers-test-kit";
import { createDb, type Env } from "../db/client";
import type { DecodedToken } from "../middleware/auth";

type MockedDb = ReturnType<typeof createDb>;

export function mockCreateDb(
  shape: Partial<Record<"select" | "insert" | "update" | "delete", Mock>>,
): void {
  vi.mocked(createDb).mockReturnValue(shape as unknown as MockedDb);
}

type AuthenticateContext = Context<{ Bindings: Env; Variables: { user: DecodedToken } }>;

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

export function createMockKv(store: Map<string, string> = new Map()): {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn().mockImplementation((key: string) => Promise.resolve(store.get(key) ?? null)),
    put: vi.fn().mockImplementation((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
  };
}

export function createMockHealStream(
  state: { approved: unknown } = { approved: null },
  opts: {
    tryHealResponse?: unknown;
    tryHealStatus?: number;
  } = {},
): {
  idFromName: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
} {
  const stubFetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith("/tryHeal")) {
      const tryHealStatus = opts.tryHealStatus ?? 404;
      return Promise.resolve(
        new Response(JSON.stringify(opts.tryHealResponse ?? { healed: false, suggestions: [] }), {
          status: tryHealStatus,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    if (url.endsWith("/state")) {
      return Promise.resolve(
        new Response(JSON.stringify(state), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    return Promise.resolve(new Response("not found", { status: 404 }));
  });
  const stub = { fetch: stubFetch };
  const getMock = vi.fn().mockReturnValue(stub);
  const idFromNameMock = vi.fn().mockReturnValue("heal-stream-stub-id");
  return { idFromName: idFromNameMock, get: getMock };
}

export function createMockEnv(
  deliveryQueue?: { send: ReturnType<typeof vi.fn> },
  rateLimiter?: { limit: ReturnType<typeof vi.fn> },
  analytics?: { writeDataPoint: ReturnType<typeof vi.fn> },
  topicRooms?: { idFromName: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> },
  ai?: Ai,
  kv?: { get: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> },
  healStream?: { idFromName: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> },
): Env {
  return {
    HYPERDRIVE: createMockHyperdrive(),
    DATABASE_URL: "postgresql://localhost/test",
    JWT_SECRET: "test-secret",
    ALLOWED_ORIGIN: "https://dev.ozby.dev",
    AI: ai,
    DELIVERY_QUEUE: (deliveryQueue ?? { send: vi.fn() }) as unknown as Env["DELIVERY_QUEUE"],
    RATE_LIMITER: (rateLimiter ?? {
      limit: vi.fn().mockResolvedValue({ success: true }),
    }) as unknown as Env["RATE_LIMITER"],
    ANALYTICS: (analytics ?? { writeDataPoint: vi.fn() }) as unknown as Env["ANALYTICS"],
    TOPIC_ROOMS: (topicRooms ??
      createMockDurableObjectNamespace()) as unknown as Env["TOPIC_ROOMS"],
    HEAL_STREAM: (healStream ?? createMockHealStream()) as unknown as Env["HEAL_STREAM"],
    KV: (kv ?? createMockKv()) as unknown as Env["KV"],
  };
}

export function bypassAuth(authenticateMock: ReturnType<typeof vi.fn>): void {
  authenticateMock.mockImplementation(async (c: AuthenticateContext, next: Next) => {
    c.set("user", { jti: "bypass-jti", userId: "user-123", username: "testuser" });
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

// Re-export kit factories for direct use in tests
export { createMockHyperdrive, createMockDurableObjectNamespace };
