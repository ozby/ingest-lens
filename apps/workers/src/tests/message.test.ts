import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import app from "../index";
import {
  messages as messageTable,
  queues as queueTable,
  queueMetrics as queueMetricsTable,
} from "../db/schema";
import { authenticate } from "../middleware/auth";
import {
  bypassAuth,
  buildSelectChain,
  buildInsertChain,
  buildUpdateChain,
  createMockEnv,
  mockCreateDb,
  mockQueue,
  mockMessage,
  get,
  post,
  del,
  AUTH_HEADER,
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

type QueueWithNullEndpoint = Omit<typeof mockQueue, "pushEndpoint"> & {
  pushEndpoint: null;
};
type LeaseMessage = typeof messageTable.$inferSelect;

function setupDb(
  queue: typeof mockQueue | QueueWithNullEndpoint | null,
  messageOverride?: Partial<typeof messageTable.$inferSelect>,
) {
  const { selectMock } = buildSelectChain(queue ? [queue] : []);
  const effectiveMessage = messageOverride ? { ...mockMessage, ...messageOverride } : mockMessage;
  const { insertMock } = buildInsertChain([effectiveMessage]);
  const updateMetricsSetMock = vi.fn().mockReturnValue({
    where: vi
      .fn()
      .mockResolvedValue([
        { queueId: queue?.id ?? "queue-1", messageCount: 1, messagesSent: 1, messagesReceived: 0 },
      ]),
  });
  const { setMock } = buildUpdateChain();
  mockCreateDb({
    select: selectMock,
    insert: insertMock,
    update: vi.fn((table: unknown) =>
      table === queueMetricsTable ? { set: updateMetricsSetMock } : { set: setMock },
    ),
  });
}

function setupLeaseDb(initialMessages: LeaseMessage[]) {
  const state = {
    messages: initialMessages.map((message) => ({ ...message })),
  };

  const selectMock = vi.fn().mockReturnValue({
    from: vi.fn((table: unknown) => {
      if (table === queueTable) {
        return {
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockQueue]),
          }),
        };
      }

      return {
        where: vi.fn().mockResolvedValue([]),
      };
    }),
  });

  const executeMock = vi.fn().mockImplementation(async () => {
    const now = Date.now();
    const visibleMessage = state.messages.find(
      (message) =>
        message.deliveryMode === "pull" &&
        message.expiresAt.getTime() > now &&
        (!message.received ||
          !message.visibilityExpiresAt ||
          message.visibilityExpiresAt.getTime() <= now),
    );

    if (!visibleMessage) {
      return [];
    }

    const receivedAt = new Date(now);
    const visibilityExpiresAt = new Date(now + 10_000);
    const claimedMessage = {
      ...visibleMessage,
      received: true,
      receivedAt,
      visibilityExpiresAt,
      receivedCount: visibleMessage.receivedCount + 1,
    };

    state.messages = state.messages.map((message) =>
      message.id === claimedMessage.id ? claimedMessage : message,
    );

    return [claimedMessage];
  });

  const updateMock = vi.fn((table: unknown) => ({
    set: vi.fn(() => ({
      where: vi.fn().mockImplementation(async () => {
        if (table === queueMetricsTable) {
          return [];
        }

        return [];
      }),
    })),
  }));

  const deleteMock = vi.fn((table: unknown) => ({
    where: vi.fn().mockImplementation(async () => {
      if (table === messageTable) {
        state.messages = state.messages.slice(1);
      }

      return [];
    }),
  }));

  mockCreateDb({
    select: selectMock,
    execute: executeMock,
    update: updateMock,
    delete: deleteMock,
  });

  return state;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authenticate).mockImplementation(async (c: any) =>
    c.json({ status: "error", message: "Authentication required" }, 401),
  );
  mockDeliveryQueue.send.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Message routes — POST /api/messages/:queueId", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await app.fetch(post("/api/messages/queue-1", { data: { key: "value" } }), mockEnv);
    expect(res.status).toBe(401);
  });

  it("enqueues via DELIVERY_QUEUE.send when queue has a pushEndpoint", async () => {
    bypassAuth(vi.mocked(authenticate));
    setupDb(mockQueue, { deliveryMode: "push", enqueueState: "pending" });

    const res = await app.fetch(
      post("/api/messages/queue-1", { data: { key: "value" } }, AUTH_HEADER),
      mockEnv,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      status: string;
      data: { message: { id: string; seq: string } };
    };
    expect(body.data.message.seq).toBe("42");
    expect(mockDeliveryQueue.send).toHaveBeenCalledOnce();
    expect(mockDeliveryQueue.send).toHaveBeenCalledWith({
      messageId: mockMessage.id,
      seq: String(mockMessage.seq),
      queueId: "queue-1",
      pushEndpoint: mockQueue.pushEndpoint,
      topicId: null,
      attempt: 0,
    });
  });

  it("does not call DELIVERY_QUEUE.send when queue has no pushEndpoint", async () => {
    bypassAuth(vi.mocked(authenticate));
    setupDb({ ...mockQueue, pushEndpoint: null });

    const res = await app.fetch(
      post("/api/messages/queue-1", { data: { key: "value" } }, AUTH_HEADER),
      mockEnv,
    );

    expect(res.status).toBe(201);
    expect(mockDeliveryQueue.send).not.toHaveBeenCalled();
  });

  it("returns 404 when queue does not exist", async () => {
    bypassAuth(vi.mocked(authenticate));
    setupDb(null);

    const res = await app.fetch(
      post("/api/messages/nonexistent", { data: { key: "value" } }, AUTH_HEADER),
      mockEnv,
    );

    expect(res.status).toBe(404);
    expect(mockDeliveryQueue.send).not.toHaveBeenCalled();
  });

  it("returns 400 when data payload is missing", async () => {
    bypassAuth(vi.mocked(authenticate));
    setupDb(mockQueue);

    const res = await app.fetch(post("/api/messages/queue-1", {}, AUTH_HEADER), mockEnv);

    expect(res.status).toBe(400);
    expect(mockDeliveryQueue.send).not.toHaveBeenCalled();
  });

  it("returns 500 when the messages INSERT returns no row", async () => {
    bypassAuth(vi.mocked(authenticate));
    const { selectMock } = buildSelectChain([mockQueue]);
    const { insertMock } = buildInsertChain([]);
    const { updateMock } = buildUpdateChain();
    mockCreateDb({
      select: selectMock,
      insert: insertMock,
      update: updateMock,
    });

    const res = await app.fetch(
      post("/api/messages/queue-1", { data: { key: "value" } }, AUTH_HEADER),
      mockEnv,
    );

    expect(res.status).toBe(500);
    const body = (await res.json()) as { status: string; message: string };
    expect(body.status).toBe("error");
    expect(body.message).toBe("Failed to create message");
    expect(mockDeliveryQueue.send).not.toHaveBeenCalled();
  });

  it("returns 502 and surfaces the enqueue failure for push queues", async () => {
    bypassAuth(vi.mocked(authenticate));
    setupDb(mockQueue, { deliveryMode: "push", enqueueState: "pending" });
    mockDeliveryQueue.send.mockRejectedValueOnce(new Error("delivery queue unavailable"));

    const res = await app.fetch(
      post("/api/messages/queue-1", { data: { key: "value" } }, AUTH_HEADER),
      mockEnv,
    );

    expect(res.status).toBe(502);
    const body = (await res.json()) as {
      status: string;
      message: string;
      data: { message: { enqueueState: string } };
    };
    expect(body.status).toBe("error");
    expect(body.message).toBe("delivery queue unavailable");
    expect(body.data.message.enqueueState).toBe("failed");
  });

  it("returns 201 with new message when Idempotency-Key is not a duplicate", async () => {
    bypassAuth(vi.mocked(authenticate));

    const limitMock = vi
      .fn()
      .mockResolvedValueOnce([mockQueue]) // queue lookup
      .mockResolvedValueOnce([]); // idempotency lookup — not found
    const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
    const fromMock = vi.fn().mockReturnValue({ where: whereMock });
    const selectMock = vi.fn().mockReturnValue({ from: fromMock });
    const { insertMock } = buildInsertChain([mockMessage]);
    const { updateMock } = buildUpdateChain();
    mockCreateDb({
      select: selectMock,
      insert: insertMock,
      update: updateMock,
    });

    const res = await app.fetch(
      post(
        "/api/messages/queue-1",
        { data: { key: "value" } },
        { ...AUTH_HEADER, "Idempotency-Key": "idem-key-1" },
      ),
      mockEnv,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      status: string;
      data: { message: { id: string; seq: string } };
    };
    expect(body.data.message.id).toBe("msg-1");
    expect(body.data.message.seq).toBe("42");
  });

  it("returns 200 with existing message when Idempotency-Key is a duplicate", async () => {
    bypassAuth(vi.mocked(authenticate));

    const limitMock = vi
      .fn()
      .mockResolvedValueOnce([mockQueue]) // queue lookup
      .mockResolvedValueOnce([mockMessage]); // idempotency lookup — found
    const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
    const fromMock = vi.fn().mockReturnValue({ where: whereMock });
    const selectMock = vi.fn().mockReturnValue({ from: fromMock });
    const { insertMock } = buildInsertChain([]);
    const { updateMock } = buildUpdateChain();
    mockCreateDb({
      select: selectMock,
      insert: insertMock,
      update: updateMock,
    });

    const res = await app.fetch(
      post(
        "/api/messages/queue-1",
        { data: { key: "value" } },
        { ...AUTH_HEADER, "Idempotency-Key": "idem-key-1" },
      ),
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      data: { message: { id: string; seq: string } };
    };
    expect(body.data.message.id).toBe("msg-1");
    expect(body.data.message.seq).toBe("42");
    expect(mockDeliveryQueue.send).not.toHaveBeenCalled();
  });
});

describe("Message routes — ownership checks", () => {
  it("rejects cross-tenant sends before inserting or delivering", async () => {
    bypassAuth(vi.mocked(authenticate));

    const foreignQueue = { ...mockQueue, ownerId: "user-999" };
    const { selectMock } = buildSelectChain([foreignQueue]);
    const insertMock = vi.fn();
    const updateMock = vi.fn();

    mockCreateDb({
      select: selectMock,
      insert: insertMock,
      update: updateMock,
    });

    const res = await app.fetch(
      post("/api/messages/queue-1", { data: { key: "value" } }, AUTH_HEADER),
      mockEnv,
    );

    expect(res.status).toBe(403);
    expect(insertMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(mockDeliveryQueue.send).not.toHaveBeenCalled();
  });

  it("rejects cross-tenant receives", async () => {
    bypassAuth(vi.mocked(authenticate));

    const foreignQueue = { ...mockQueue, ownerId: "user-999" };
    const { selectMock } = buildSelectChain([foreignQueue]);
    const updateMock = vi.fn();

    mockCreateDb({
      select: selectMock,
      update: updateMock,
    });

    const res = await app.fetch(get("/api/messages/queue-1", AUTH_HEADER), mockEnv);

    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects cross-tenant single-message reads", async () => {
    bypassAuth(vi.mocked(authenticate));

    const foreignQueue = { ...mockQueue, ownerId: "user-999" };
    const { selectMock } = buildSelectChain([foreignQueue]);

    mockCreateDb({ select: selectMock });

    const res = await app.fetch(get("/api/messages/queue-1/msg-1", AUTH_HEADER), mockEnv);

    expect(res.status).toBe(403);
  });

  it("rejects cross-tenant deletes before touching storage", async () => {
    bypassAuth(vi.mocked(authenticate));

    const foreignQueue = { ...mockQueue, ownerId: "user-999" };
    const { selectMock } = buildSelectChain([foreignQueue]);
    const deleteMock = vi.fn();

    mockCreateDb({
      select: selectMock,
      delete: deleteMock,
    });

    const res = await app.fetch(del("/api/messages/queue-1/msg-1", AUTH_HEADER), mockEnv);

    expect(res.status).toBe(403);
    expect(deleteMock).not.toHaveBeenCalled();
  });
});

describe("Message routes — response contracts", () => {
  it("returns receive payloads with messages and visibilityTimeout", async () => {
    bypassAuth(vi.mocked(authenticate));

    const queueLimitMock = vi.fn().mockResolvedValue([mockQueue]);
    const queueWhereMock = vi.fn().mockReturnValue({ limit: queueLimitMock });
    const queueFromMock = vi.fn().mockReturnValue({ where: queueWhereMock });

    const selectMock = vi.fn().mockImplementationOnce(() => ({ from: queueFromMock }));
    const { updateMock } = buildUpdateChain();
    const executeMock = vi.fn().mockResolvedValue([
      {
        ...mockMessage,
        received: true,
        receivedAt: new Date("2026-04-24T00:00:00.000Z"),
        visibilityExpiresAt: new Date("2026-04-24T00:00:45.000Z"),
        receivedCount: mockMessage.receivedCount + 1,
      },
    ]);

    mockCreateDb({
      select: selectMock,
      execute: executeMock,
      update: updateMock,
    });

    const res = await app.fetch(
      get("/api/messages/queue-1?maxMessages=1&visibilityTimeout=45", AUTH_HEADER),
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      results: number;
      data: {
        messages: Array<{
          id: string;
          queueId: string;
          createdAt: string;
          expiresAt: string;
          receivedCount: number;
        }>;
        visibilityTimeout: number;
      };
    };
    expect(body.status).toBe("success");
    expect(body.results).toBe(1);
    expect(body.data.messages).toEqual([
      expect.objectContaining({
        id: mockMessage.id,
        queueId: mockMessage.queueId,
        createdAt: mockMessage.createdAt.toISOString(),
        expiresAt: mockMessage.expiresAt.toISOString(),
        received: true,
        receivedCount: mockMessage.receivedCount + 1,
      }),
    ]);
    expect(body.data.visibilityTimeout).toBe(45);
  });

  it("returns single-message payloads under the shared message key", async () => {
    bypassAuth(vi.mocked(authenticate));

    const queueLimitMock = vi.fn().mockResolvedValue([mockQueue]);
    const queueWhereMock = vi.fn().mockReturnValue({ limit: queueLimitMock });
    const queueFromMock = vi.fn().mockReturnValue({ where: queueWhereMock });

    const messageLimitMock = vi.fn().mockResolvedValue([mockMessage]);
    const messageWhereMock = vi.fn().mockReturnValue({ limit: messageLimitMock });
    const messageFromMock = vi.fn().mockReturnValue({ where: messageWhereMock });

    const selectMock = vi
      .fn()
      .mockImplementationOnce(() => ({ from: queueFromMock }))
      .mockImplementationOnce(() => ({ from: messageFromMock }));

    mockCreateDb({ select: selectMock });

    const res = await app.fetch(get("/api/messages/queue-1/msg-1", AUTH_HEADER), mockEnv);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      data: {
        message: {
          id: string;
          queueId: string;
          createdAt: string;
          expiresAt: string;
          receivedCount: number;
        };
      };
    };
    expect(body.status).toBe("success");
    expect(body.data.message).toEqual(
      expect.objectContaining({
        id: mockMessage.id,
        queueId: mockMessage.queueId,
        createdAt: mockMessage.createdAt.toISOString(),
        expiresAt: mockMessage.expiresAt.toISOString(),
        receivedCount: mockMessage.receivedCount,
      }),
    );
  });

  it("returns delete payloads with the deleted message id", async () => {
    bypassAuth(vi.mocked(authenticate));

    const queueLimitMock = vi.fn().mockResolvedValue([mockQueue]);
    const queueWhereMock = vi.fn().mockReturnValue({ limit: queueLimitMock });
    const queueFromMock = vi.fn().mockReturnValue({ where: queueWhereMock });

    const messageLimitMock = vi.fn().mockResolvedValue([mockMessage]);
    const messageWhereMock = vi.fn().mockReturnValue({ limit: messageLimitMock });
    const messageFromMock = vi.fn().mockReturnValue({ where: messageWhereMock });

    const selectMock = vi
      .fn()
      .mockImplementationOnce(() => ({ from: queueFromMock }))
      .mockImplementationOnce(() => ({ from: messageFromMock }));
    const deleteWhereMock = vi.fn().mockResolvedValue([]);
    const deleteMock = vi.fn().mockReturnValue({ where: deleteWhereMock });

    mockCreateDb({
      select: selectMock,
      delete: deleteMock,
    });

    const res = await app.fetch(del("/api/messages/queue-1/msg-1", AUTH_HEADER), mockEnv);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      data: { deletedMessageId: string };
    };
    expect(body.status).toBe("success");
    expect(body.data.deletedMessageId).toBe("msg-1");
  });
});

describe("Message routes — visibility leases", () => {
  it("returns leased messages as received and hides them during the visibility timeout", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-24T00:00:00.000Z"));
    bypassAuth(vi.mocked(authenticate));

    const state = setupLeaseDb([
      {
        ...mockMessage,
        deliveryMode: "pull",
        enqueueState: "not_needed",
        received: false,
        receivedAt: null,
        visibilityExpiresAt: null,
      },
    ]);

    const firstRes = await app.fetch(
      get("/api/messages/queue-1?maxMessages=1&visibilityTimeout=45", AUTH_HEADER),
      mockEnv,
    );

    expect(firstRes.status).toBe(200);
    const firstBody = (await firstRes.json()) as {
      results: number;
      data: {
        visibilityTimeout: number;
        messages: Array<{
          id: string;
          received: boolean;
          receivedCount: number;
        }>;
      };
    };
    expect(firstBody.results).toBe(1);
    expect(firstBody.data.visibilityTimeout).toBe(45);
    expect(firstBody.data.messages).toEqual([
      expect.objectContaining({
        id: mockMessage.id,
        received: true,
        receivedCount: 1,
      }),
    ]);

    const secondRes = await app.fetch(
      get("/api/messages/queue-1?maxMessages=1&visibilityTimeout=45", AUTH_HEADER),
      mockEnv,
    );

    expect(secondRes.status).toBe(200);
    const secondBody = (await secondRes.json()) as {
      results: number;
      data: { messages: Array<{ id: string }> };
    };
    expect(secondBody.results).toBe(0);
    expect(secondBody.data.messages).toEqual([]);
    expect(state.messages).toEqual([
      expect.objectContaining({
        id: mockMessage.id,
        received: true,
        receivedCount: 1,
      }),
    ]);
  });

  it("makes leased messages visible again after the visibility timeout expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-24T00:00:00.000Z"));
    bypassAuth(vi.mocked(authenticate));

    const state = setupLeaseDb([
      {
        ...mockMessage,
        deliveryMode: "pull",
        enqueueState: "not_needed",
        received: false,
        receivedAt: null,
        visibilityExpiresAt: null,
      },
    ]);

    await app.fetch(
      get("/api/messages/queue-1?maxMessages=1&visibilityTimeout=10", AUTH_HEADER),
      mockEnv,
    );

    vi.advanceTimersByTime(11_000);

    const res = await app.fetch(
      get("/api/messages/queue-1?maxMessages=1&visibilityTimeout=10", AUTH_HEADER),
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      results: number;
      data: {
        messages: Array<{
          id: string;
          received: boolean;
          receivedCount: number;
        }>;
        visibilityTimeout: number;
      };
    };
    expect(body.results).toBe(1);
    expect(body.data.visibilityTimeout).toBe(10);
    expect(body.data.messages).toEqual([
      expect.objectContaining({
        id: mockMessage.id,
        received: true,
        receivedCount: 2,
      }),
    ]);
    expect(state.messages).toEqual([
      expect.objectContaining({
        id: mockMessage.id,
        received: true,
        receivedCount: 2,
      }),
    ]);
  });

  it("treats delete as an ack by removing the leased message before it can reappear", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-24T00:00:00.000Z"));
    bypassAuth(vi.mocked(authenticate));

    const state = {
      messages: [
        {
          ...mockMessage,
          received: false,
          receivedAt: null,
          visibilityExpiresAt: null,
        },
      ] as LeaseMessage[],
    };

    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn((table: unknown) => {
        if (table === queueTable) {
          return {
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockQueue]),
            }),
          };
        }

        if (table === messageTable) {
          return {
            where: vi.fn().mockReturnValue({
              limit: vi
                .fn()
                .mockResolvedValue(state.messages.length > 0 ? [{ ...state.messages[0] }] : []),
            }),
          };
        }

        return {
          where: vi.fn().mockResolvedValue([]),
        };
      }),
    });

    const executeMock = vi.fn().mockImplementation(async () => {
      const now = Date.now();
      const visibleMessage = state.messages.find(
        (message) =>
          message.deliveryMode === "pull" &&
          message.expiresAt.getTime() > now &&
          (!message.received ||
            !message.visibilityExpiresAt ||
            message.visibilityExpiresAt.getTime() <= now),
      );

      if (!visibleMessage) {
        return [];
      }

      const claimedMessage = {
        ...visibleMessage,
        received: true,
        receivedAt: new Date(now),
        visibilityExpiresAt: new Date(now + 5_000),
        receivedCount: visibleMessage.receivedCount + 1,
      };

      state.messages = state.messages.map((message) =>
        message.id === claimedMessage.id ? claimedMessage : message,
      );

      return [claimedMessage];
    });

    const updateMock = vi.fn((table: unknown) => ({
      set: vi.fn(() => ({
        where: vi.fn().mockImplementation(async () => {
          return table === queueMetricsTable ? [] : [];
        }),
      })),
    }));

    const deleteMock = vi.fn((table: unknown) => ({
      where: vi.fn().mockImplementation(async () => {
        if (table === messageTable) {
          state.messages = [];
        }

        return [];
      }),
    }));

    mockCreateDb({
      select: selectMock,
      execute: executeMock,
      update: updateMock,
      delete: deleteMock,
    });

    await app.fetch(
      get("/api/messages/queue-1?maxMessages=1&visibilityTimeout=5", AUTH_HEADER),
      mockEnv,
    );

    const deleteRes = await app.fetch(del("/api/messages/queue-1/msg-1", AUTH_HEADER), mockEnv);

    expect(deleteRes.status).toBe(200);
    const deleteBody = (await deleteRes.json()) as {
      data: { deletedMessageId: string };
    };
    expect(deleteBody.data.deletedMessageId).toBe("msg-1");
    expect(state.messages).toEqual([]);

    vi.advanceTimersByTime(10_000);

    const receiveRes = await app.fetch(
      get("/api/messages/queue-1?maxMessages=1&visibilityTimeout=5", AUTH_HEADER),
      mockEnv,
    );

    expect(receiveRes.status).toBe(200);
    const receiveBody = (await receiveRes.json()) as {
      results: number;
      data: { messages: Array<{ id: string }> };
    };
    expect(receiveBody.results).toBe(0);
    expect(receiveBody.data.messages).toEqual([]);
  });

  it("does not lease push-managed messages through the pull API", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-24T00:00:00.000Z"));
    bypassAuth(vi.mocked(authenticate));

    const state = setupLeaseDb([
      {
        ...mockMessage,
        deliveryMode: "push",
        enqueueState: "enqueued",
        received: false,
        receivedAt: null,
        visibilityExpiresAt: null,
      },
    ]);

    const res = await app.fetch(
      get("/api/messages/queue-1?maxMessages=1&visibilityTimeout=45", AUTH_HEADER),
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      results: number;
      data: { messages: Array<{ id: string }> };
    };
    expect(body.results).toBe(0);
    expect(body.data.messages).toEqual([]);
    expect(state.messages[0]?.received).toBe(false);
  });
});
