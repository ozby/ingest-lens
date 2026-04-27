import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticate } from "../middleware/auth";
import { topicRoutes } from "../routes/topic";
import {
  AUTH_HEADER,
  buildSelectChain,
  buildUnboundedSelectChain,
  createMockEnv,
  get,
  mockCreateDb,
  mockTopic,
} from "./helpers";

vi.mock("../middleware/auth", () => ({ authenticate: vi.fn() }));
vi.mock("../middleware/rateLimiter", () => ({
  rateLimiter: vi.fn((_c: unknown, next: () => Promise<void>) => next()),
}));
vi.mock("../db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/client")>();
  return { ...actual, createDb: vi.fn() };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /:topicId/ws", () => {
  it("returns 401 for unauthenticated requests", async () => {
    vi.mocked(authenticate).mockImplementation(async (c: any, _next: any) => {
      return c.json({ status: "error", message: "Unauthorized" }, 401);
    });

    const res = await topicRoutes.request(get("/topic-1/ws"), {}, createMockEnv());

    expect(res.status).toBe(401);
  });

  it("rejects WebSocket upgrades for topics owned by another user", async () => {
    vi.mocked(authenticate).mockImplementation(async (c: any, next: any) => {
      c.set("user", { jti: "bypass-jti", userId: "user-123", username: "testuser" });
      await next();
    });

    const foreignTopic = { ...mockTopic, ownerId: "user-999" };
    const { fromMock: topicFrom } = buildSelectChain([foreignTopic]);
    const selectMock = vi.fn().mockReturnValue({ from: topicFrom });
    mockCreateDb({ select: selectMock });

    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const mockGet = vi.fn().mockReturnValue({ fetch: mockFetch });
    const mockIdFromName = vi.fn().mockReturnValue("stub-id");
    const mockTopicRooms = { idFromName: mockIdFromName, get: mockGet };
    const env = createMockEnv(undefined, undefined, undefined, mockTopicRooms);

    const res = await topicRoutes.request(get("/topic-1/ws", AUTH_HEADER), {}, env);

    expect(res.status).toBe(403);
    expect(mockIdFromName).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("proxies WebSocket upgrade to TopicRoom DO when authenticated", async () => {
    vi.mocked(authenticate).mockImplementation(async (c: any, next: any) => {
      c.set("user", { jti: "bypass-jti", userId: "user-123", username: "testuser" });
      await next();
    });

    const { fromMock: topicFrom } = buildSelectChain([mockTopic]);
    const { fromMock: subscriptionsFrom } = buildUnboundedSelectChain([
      {
        id: "sub-1",
        topicId: mockTopic.id,
        queueId: "queue-1",
        createdAt: new Date("2026-01-01"),
      },
    ]);
    const selectMock = vi
      .fn()
      .mockReturnValueOnce({ from: topicFrom })
      .mockReturnValueOnce({ from: subscriptionsFrom });
    mockCreateDb({ select: selectMock });

    // Use 200 here — Node's Response rejects 101 (CF Workers-only status)
    // The meaningful assertion is that the DO stub was called, not the WS status
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const mockGet = vi.fn().mockReturnValue({ fetch: mockFetch });
    const mockIdFromName = vi.fn().mockReturnValue("stub-id");
    const mockTopicRooms = { idFromName: mockIdFromName, get: mockGet };
    const env = createMockEnv(undefined, undefined, undefined, mockTopicRooms);

    const res = await topicRoutes.request(get("/topic-1/ws", AUTH_HEADER), {}, env);

    expect(mockIdFromName).toHaveBeenCalledWith("topic-1");
    expect(mockGet).toHaveBeenCalledWith("stub-id");
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
  });

  it("/:topicId/ws route is registered before /:id (structural check)", () => {
    const routes = topicRoutes.routes;
    const wsIndex = routes.findIndex((r) => r.method === "GET" && r.path === "/:topicId/ws");
    const idIndex = routes.findIndex((r) => r.method === "GET" && r.path === "/:id");
    expect(wsIndex).toBeGreaterThanOrEqual(0);
    expect(idIndex).toBeGreaterThanOrEqual(0);
    expect(wsIndex).toBeLessThan(idIndex);
  });
});
