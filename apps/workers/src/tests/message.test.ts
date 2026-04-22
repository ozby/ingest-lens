import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../index";
import { createDb } from "../db/client";
import { authenticate } from "../middleware/auth";
import {
  bypassAuth,
  buildSelectChain,
  buildInsertChain,
  buildUpdateChain,
  createMockEnv,
  mockQueue,
  mockMessage,
  post,
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

type QueueWithNullEndpoint = Omit<typeof mockQueue, "pushEndpoint"> & { pushEndpoint: null };

function setupDb(queue: typeof mockQueue | QueueWithNullEndpoint | null) {
  const { selectMock } = buildSelectChain(queue ? [queue] : []);
  const { insertMock } = buildInsertChain([mockMessage]);
  const { updateMock } = buildUpdateChain();
  vi.mocked(createDb).mockReturnValue({
    select: selectMock,
    insert: insertMock,
    update: updateMock,
  } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authenticate).mockImplementation(async (c: any) =>
    c.json({ status: "error", message: "Authentication required" }, 401),
  );
  mockDeliveryQueue.send.mockResolvedValue(undefined);
});

describe("Message routes — POST /api/messages/:queueId", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await app.fetch(post("/api/messages/queue-1", { data: { key: "value" } }), mockEnv);
    expect(res.status).toBe(401);
  });

  it("enqueues via DELIVERY_QUEUE.send when queue has a pushEndpoint", async () => {
    bypassAuth(vi.mocked(authenticate));
    setupDb(mockQueue);

    const res = await app.fetch(
      post("/api/messages/queue-1", { data: { key: "value" } }, AUTH_HEADER),
      mockEnv,
    );

    expect(res.status).toBe(201);
    expect(mockDeliveryQueue.send).toHaveBeenCalledOnce();
    expect(mockDeliveryQueue.send).toHaveBeenCalledWith({
      messageId: mockMessage.id,
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
    vi.mocked(createDb).mockReturnValue({
      select: selectMock,
      insert: insertMock,
      update: updateMock,
    } as any);

    const res = await app.fetch(
      post(
        "/api/messages/queue-1",
        { data: { key: "value" } },
        { ...AUTH_HEADER, "Idempotency-Key": "idem-key-1" },
      ),
      mockEnv,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { status: string; data: { message: { id: string } } };
    expect(body.data.message.id).toBe("msg-1");
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
    const insertMock = vi.fn();
    vi.mocked(createDb).mockReturnValue({ select: selectMock, insert: insertMock } as any);

    const res = await app.fetch(
      post(
        "/api/messages/queue-1",
        { data: { key: "value" } },
        { ...AUTH_HEADER, "Idempotency-Key": "idem-key-1" },
      ),
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; data: { message: { id: string } } };
    expect(body.data.message.id).toBe("msg-1");
    expect(insertMock).not.toHaveBeenCalled();
    expect(mockDeliveryQueue.send).not.toHaveBeenCalled();
  });
});
