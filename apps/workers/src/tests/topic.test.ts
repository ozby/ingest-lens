import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../index";
import { authenticate } from "../middleware/auth";
import { queueMetrics as queueMetricsTable } from "../db/schema";
import {
  AUTH_HEADER,
  bypassAuth,
  buildInsertChain,
  buildSelectChain,
  buildUpdateChain,
  buildUnboundedSelectChain,
  createMockEnv,
  mockCreateDb,
  mockMessage,
  mockQueue,
  mockTopic,
  del,
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

function buildSubscriptionRows(topicId: string, queueIds: string[]) {
  return queueIds.map((queueId, index) => ({
    id: `sub-${index + 1}`,
    topicId,
    queueId,
    createdAt: new Date("2026-01-01"),
  }));
}

function setupPublishDb(
  topic: typeof mockTopic | null,
  subscribedQueues: MockQueue[],
  messageOverride?: Partial<typeof import("../db/schema").messages.$inferSelect>,
) {
  const { fromMock: topicFrom } = buildSelectChain(topic ? [topic] : []);
  const { fromMock: topicSubscriptionsFrom } = buildUnboundedSelectChain(
    topic ? buildSubscriptionRows(topic.id, topic.subscribedQueues) : [],
  );
  const { fromMock: queuesFrom } = buildUnboundedSelectChain(subscribedQueues);
  const selectMock = vi
    .fn()
    .mockReturnValueOnce({ from: topicFrom })
    .mockReturnValueOnce({ from: topicSubscriptionsFrom })
    .mockReturnValue({ from: queuesFrom });
  const updateMetricsSetMock = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue([]),
  });
  const effectiveMessage = messageOverride ? { ...mockMessage, ...messageOverride } : mockMessage;
  const { insertMock } = buildInsertChain([effectiveMessage]);
  const { setMock } = buildUpdateChain([]);
  const transactionMock = vi.fn(async (cb: (tx: unknown) => unknown) =>
    cb({
      insert: insertMock,
      update: vi.fn((table: unknown) =>
        table === queueMetricsTable ? { set: updateMetricsSetMock } : { set: setMock },
      ),
      select: selectMock,
    }),
  );
  mockCreateDb({
    select: selectMock,
    insert: insertMock,
    update: vi.fn((table: unknown) =>
      table === queueMetricsTable ? { set: updateMetricsSetMock } : { set: setMock },
    ),
    transaction: transactionMock as never,
  });
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

  describe("DELETE /api/topics/:id", () => {
    it("deletes the topic and relies on database cascades for subscriptions", async () => {
      bypassAuth(vi.mocked(authenticate));

      const { fromMock: topicFrom } = buildSelectChain([mockTopic]);
      const { fromMock: subscriptionsFrom } = buildUnboundedSelectChain(
        buildSubscriptionRows(mockTopic.id, mockTopic.subscribedQueues),
      );
      const selectMock = vi
        .fn()
        .mockReturnValueOnce({ from: topicFrom })
        .mockReturnValueOnce({ from: subscriptionsFrom });
      const whereDeleteMock = vi.fn().mockResolvedValue([]);
      const deleteMock = vi.fn().mockReturnValue({ where: whereDeleteMock });

      mockCreateDb({
        select: selectMock,
        delete: deleteMock,
      });

      const res = await app.fetch(del("/api/topics/topic-1", AUTH_HEADER), mockEnv);

      expect(res.status).toBe(200);
      expect(deleteMock).toHaveBeenCalledTimes(1);
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
      const { fromMock: topicFrom } = buildSelectChain([ownTopic]);
      const { fromMock: subscriptionsFrom } = buildUnboundedSelectChain(
        buildSubscriptionRows(ownTopic.id, ownTopic.subscribedQueues),
      );
      const { fromMock: queueFrom } = buildSelectChain([foreignQueue]);
      const selectMock = vi
        .fn()
        .mockReturnValueOnce({ from: topicFrom })
        .mockReturnValueOnce({ from: subscriptionsFrom })
        .mockReturnValueOnce({ from: queueFrom });
      const updateMock = vi.fn();
      const { insertMock } = buildInsertChain([]);

      mockCreateDb({
        select: selectMock,
        insert: insertMock,
        update: updateMock,
      });

      const res = await app.fetch(
        post("/api/topics/topic-1/subscribe", { queueId: "queue-1" }, AUTH_HEADER),
        mockEnv,
      );

      expect(res.status).toBe(403);
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("stores the subscription in the join table and returns the updated topic shape", async () => {
      bypassAuth(vi.mocked(authenticate));

      const topicWithoutSubscribers = { ...mockTopic, subscribedQueues: [] as string[] };
      const { fromMock: topicFrom } = buildSelectChain([topicWithoutSubscribers]);
      const { fromMock: subscriptionsFrom } = buildUnboundedSelectChain([]);
      const { fromMock: queueFrom } = buildSelectChain([mockQueue]);
      const selectMock = vi
        .fn()
        .mockReturnValueOnce({ from: topicFrom })
        .mockReturnValueOnce({ from: subscriptionsFrom })
        .mockReturnValueOnce({ from: queueFrom });
      const { insertMock, valuesMock } = buildInsertChain([]);

      mockCreateDb({
        select: selectMock,
        insert: insertMock,
      });

      const res = await app.fetch(
        post("/api/topics/topic-1/subscribe", { queueId: "queue-1" }, AUTH_HEADER),
        mockEnv,
      );

      expect(res.status).toBe(200);
      expect(valuesMock).toHaveBeenCalledWith({ topicId: "topic-1", queueId: "queue-1" });
      const body = (await res.json()) as {
        status: string;
        data: { topic: { subscribedQueues: string[] } };
      };
      expect(body.data.topic.subscribedQueues).toEqual(["queue-1"]);
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
      setupPublishDb(mockTopic, [mockQueue], { deliveryMode: "push", enqueueState: "pending" });

      const res = await app.fetch(
        post("/api/topics/topic-1/publish", { data: { key: "value" } }, AUTH_HEADER),
        mockEnv,
      );

      expect(res.status).toBe(201);
      expect(mockDeliveryQueue.send).toHaveBeenCalledOnce();
      const body = (await res.json()) as {
        status: string;
        results: number;
        data: { messages: Array<{ id: string; seq: string }> };
      };
      expect(body.data.messages[0]?.seq).toBe("42");
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
      setupPublishDb(
        { ...mockTopic, subscribedQueues: ["queue-1", "queue-2"] },
        [mockQueue, { ...mockQueue, id: "queue-2", pushEndpoint: null }],
        { deliveryMode: "push", enqueueState: "pending" },
      );

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

    it("returns 500 when the per-queue messages INSERT returns no row", async () => {
      bypassAuth(vi.mocked(authenticate));
      const { fromMock: topicFrom } = buildSelectChain([mockTopic]);
      const { fromMock: topicSubscriptionsFrom } = buildUnboundedSelectChain(
        buildSubscriptionRows(mockTopic.id, mockTopic.subscribedQueues),
      );
      const { fromMock: queuesFrom } = buildUnboundedSelectChain([mockQueue]);
      const selectMock = vi
        .fn()
        .mockReturnValueOnce({ from: topicFrom })
        .mockReturnValueOnce({ from: topicSubscriptionsFrom })
        .mockReturnValue({ from: queuesFrom });
      const { insertMock } = buildInsertChain([]);
      const { updateMock } = buildUpdateChain([]);
      const transactionMock = vi.fn(async (cb: (tx: unknown) => unknown) =>
        cb({
          insert: insertMock,
          update: updateMock,
          select: selectMock,
        }),
      );
      mockCreateDb({
        select: selectMock,
        insert: insertMock,
        update: updateMock,
        transaction: transactionMock as never,
      });

      const res = await app.fetch(
        post("/api/topics/topic-1/publish", { data: { key: "value" } }, AUTH_HEADER),
        mockEnv,
      );

      expect(res.status).toBe(500);
      const body = (await res.json()) as { status: string; message: string };
      expect(body.status).toBe("error");
      expect(body.message).toBe("Failed to create message");
      expect(mockDeliveryQueue.send).not.toHaveBeenCalled();
    });

    it("returns 502 and surfaces enqueue failures after rows are persisted", async () => {
      bypassAuth(vi.mocked(authenticate));
      setupPublishDb(mockTopic, [mockQueue], { deliveryMode: "push", enqueueState: "pending" });
      mockDeliveryQueue.send.mockRejectedValueOnce(new Error("queue down"));

      const res = await app.fetch(
        post("/api/topics/topic-1/publish", { data: { key: "value" } }, AUTH_HEADER),
        mockEnv,
      );

      expect(res.status).toBe(502);
      const body = (await res.json()) as {
        status: string;
        message: string;
        data: { enqueueFailures: Array<{ queueId: string; message: string }> };
      };
      expect(body.status).toBe("error");
      expect(body.message).toBe("Failed to enqueue one or more topic deliveries");
      expect(body.data.enqueueFailures).toEqual([{ queueId: "queue-1", message: "queue down" }]);
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
