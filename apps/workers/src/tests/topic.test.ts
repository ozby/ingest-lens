import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../index";
import { createDb } from "../db/client";
import { authenticate } from "../middleware/auth";
import {
  AUTH_HEADER,
  bypassAuth,
  buildInsertChain,
  buildSelectChain,
  buildUnboundedSelectChain,
  createMockEnv,
  mockMessage,
  mockQueue,
  mockTopic,
  get,
  post,
} from "./helpers";

vi.mock("../middleware/auth", () => ({
  authenticate: vi.fn(),
}));

vi.mock("../db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/client")>();
  return { ...actual, createDb: vi.fn() };
});

const mockDeliveryQueue = { send: vi.fn() };
const mockEnv = createMockEnv(mockDeliveryQueue);

type MockQueue =
  | typeof mockQueue
  | (Omit<typeof mockQueue, "pushEndpoint"> & { pushEndpoint: null });

function setupPublishDb(topic: typeof mockTopic | null, subscribedQueues: MockQueue[]) {
  const { fromMock: topicFrom } = buildSelectChain(topic ? [topic] : []);
  const { fromMock: queuesFrom } = buildUnboundedSelectChain(subscribedQueues);
  const selectMock = vi
    .fn()
    .mockReturnValueOnce({ from: topicFrom })
    .mockReturnValue({ from: queuesFrom });
  const { insertMock } = buildInsertChain([mockMessage]);
  vi.mocked(createDb).mockReturnValue({
    select: selectMock,
    insert: insertMock,
  } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authenticate).mockImplementation(async (c: any) =>
    c.json({ status: "error", message: "Authentication required" }, 401),
  );
  mockDeliveryQueue.send.mockResolvedValue(undefined);
});

describe("Topic routes", () => {
  describe("GET /api/topics", () => {
    it("returns 401 when not authenticated", async () => {
      const res = await app.fetch(get("/api/topics"), mockEnv);
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/topics", () => {
    it("returns 401 when not authenticated", async () => {
      const res = await app.fetch(post("/api/topics", { name: "test-topic" }), mockEnv);
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/topics/:topicId/subscribe", () => {
    it("returns 401 when not authenticated", async () => {
      const res = await app.fetch(
        post("/api/topics/some-id/subscribe", { queueId: "queue-id" }),
        mockEnv,
      );
      expect(res.status).toBe(401);
    });

    it("rejects subscribing a queue the user does not own", async () => {
      bypassAuth(vi.mocked(authenticate));

      const ownTopic = { ...mockTopic, ownerId: "user-123" };
      const foreignQueue = { ...mockQueue, ownerId: "user-999" };

      const limitMock = vi
        .fn()
        .mockResolvedValueOnce([ownTopic])
        .mockResolvedValueOnce([foreignQueue]);
      const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });
      const selectMock = vi.fn().mockReturnValue({ from: fromMock });
      const updateMock = vi.fn();

      vi.mocked(createDb).mockReturnValue({
        select: selectMock,
        update: updateMock,
      } as any);

      const res = await app.fetch(
        post("/api/topics/topic-1/subscribe", { queueId: "queue-1" }, AUTH_HEADER),
        mockEnv,
      );

      expect(res.status).toBe(403);
      expect(updateMock).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/topics/:topicId/publish", () => {
    it("returns 401 when not authenticated", async () => {
      const res = await app.fetch(
        post("/api/topics/some-id/publish", { data: { key: "value" } }),
        mockEnv,
      );
      expect(res.status).toBe(401);
    });

    it("enqueues via DELIVERY_QUEUE.send for each queue with a pushEndpoint", async () => {
      bypassAuth(vi.mocked(authenticate));
      setupPublishDb(mockTopic, [mockQueue]);

      const res = await app.fetch(
        post("/api/topics/topic-1/publish", { data: { key: "value" } }, AUTH_HEADER),
        mockEnv,
      );

      expect(res.status).toBe(201);
      expect(mockDeliveryQueue.send).toHaveBeenCalledOnce();
      expect(mockDeliveryQueue.send).toHaveBeenCalledWith({
        messageId: mockMessage.id,
        seq: String(mockMessage.seq),
        queueId: mockQueue.id,
        pushEndpoint: mockQueue.pushEndpoint,
        topicId: "topic-1",
        attempt: 0,
      });
    });

    it("does not call DELIVERY_QUEUE.send when queue has no pushEndpoint", async () => {
      bypassAuth(vi.mocked(authenticate));
      setupPublishDb(mockTopic, [{ ...mockQueue, pushEndpoint: null }]);

      const res = await app.fetch(
        post("/api/topics/topic-1/publish", { data: { key: "value" } }, AUTH_HEADER),
        mockEnv,
      );

      expect(res.status).toBe(201);
      expect(mockDeliveryQueue.send).not.toHaveBeenCalled();
    });

    it("enqueues only for queues with a pushEndpoint in a mixed batch", async () => {
      bypassAuth(vi.mocked(authenticate));
      setupPublishDb({ ...mockTopic, subscribedQueues: ["queue-1", "queue-2"] }, [
        mockQueue,
        { ...mockQueue, id: "queue-2", pushEndpoint: null },
      ]);

      const res = await app.fetch(
        post("/api/topics/topic-1/publish", { data: { key: "value" } }, AUTH_HEADER),
        mockEnv,
      );

      expect(res.status).toBe(201);
      expect(mockDeliveryQueue.send).toHaveBeenCalledOnce();
      expect(mockDeliveryQueue.send).toHaveBeenCalledWith(
        expect.objectContaining({
          queueId: "queue-1",
          pushEndpoint: mockQueue.pushEndpoint,
          seq: String(mockMessage.seq),
        }),
      );
    });

    it("returns 404 when topic does not exist", async () => {
      bypassAuth(vi.mocked(authenticate));
      setupPublishDb(null, []);

      const res = await app.fetch(
        post("/api/topics/nonexistent/publish", { data: { key: "value" } }, AUTH_HEADER),
        mockEnv,
      );

      expect(res.status).toBe(404);
      expect(mockDeliveryQueue.send).not.toHaveBeenCalled();
    });

    it("returns 400 when data payload is missing", async () => {
      bypassAuth(vi.mocked(authenticate));
      setupPublishDb(mockTopic, [mockQueue]);

      const res = await app.fetch(post("/api/topics/topic-1/publish", {}, AUTH_HEADER), mockEnv);

      expect(res.status).toBe(400);
      expect(mockDeliveryQueue.send).not.toHaveBeenCalled();
    });

    it("returns 400 when topic has no subscribers", async () => {
      bypassAuth(vi.mocked(authenticate));
      setupPublishDb({ ...mockTopic, subscribedQueues: [] }, []);

      const res = await app.fetch(
        post("/api/topics/topic-1/publish", { data: { key: "value" } }, AUTH_HEADER),
        mockEnv,
      );

      expect(res.status).toBe(400);
      expect(mockDeliveryQueue.send).not.toHaveBeenCalled();
    });
  });
});
