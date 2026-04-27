import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { handleDeliveryBatch } from "../consumers/deliveryConsumer";
import type { DeliveryPayload } from "../db/client";
import { buildSelectChain, buildUpdateChain, createMockEnv, mockCreateDb } from "./helpers";

vi.mock("../db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/client")>();
  return { ...actual, createDb: vi.fn() };
});

const mockRow = {
  id: "msg-1",
  seq: 42n,
  data: { hello: "world" },
  queueId: "queue-1",
  deliveryMode: "push",
  enqueueState: "enqueued",
  pushDeliveredAt: null,
  lastEnqueueError: null,
  expiresAt: new Date("2030-01-01"),
  received: false,
  receivedCount: 0,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  receivedAt: null,
  visibilityExpiresAt: null,
};

function makeMsg(
  body: DeliveryPayload,
  ack: Mock,
  retry: Mock,
  attempts?: number,
): Message<DeliveryPayload> {
  return {
    body,
    ack,
    retry,
    id: "cf-msg-id",
    timestamp: new Date("2026-01-01"),
    attempts: attempts ?? (body.attempt ?? 0) + 1,
  } as unknown as Message<DeliveryPayload>;
}

function setupCreateDb(selectRows: unknown[]) {
  const chain = buildSelectChain(selectRows);
  const update = buildUpdateChain([]);
  mockCreateDb({ select: chain.selectMock, update: update.updateMock });
  return { ...chain, ...update };
}

const basePayload: DeliveryPayload = {
  messageId: "msg-1",
  seq: "42",
  queueId: "queue-1",
  pushEndpoint: "https://example.com/webhook",
  topicId: null,
  attempt: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("handleDeliveryBatch", () => {
  it("acks when DB row found and response is 2xx", async () => {
    setupCreateDb([mockRow]);
    const ack = vi.fn();
    const retry = vi.fn();
    const writeDataPoint = vi.fn();
    const env = createMockEnv(undefined, undefined, { writeDataPoint });
    const msg = makeMsg(basePayload, ack, retry);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const batch = {
      queue: "delivery-queue",
      messages: [msg],
      retryAll: vi.fn(),
      ackAll: vi.fn(),
      metadata: null,
    } as unknown as MessageBatch<DeliveryPayload>;

    await handleDeliveryBatch(batch, env);

    expect(ack).toHaveBeenCalledOnce();
    const [, pushRequestArg] = vi.mocked(fetch).mock.calls[0] ?? [];
    const pushRequest = pushRequestArg as RequestInit;
    expect(JSON.parse(pushRequest.body as string)).toEqual(
      expect.objectContaining({ id: "msg-1", seq: "42" }),
    );
    expect(retry).not.toHaveBeenCalled();
    expect(writeDataPoint).toHaveBeenCalledOnce();
    expect(writeDataPoint).toHaveBeenCalledWith(
      expect.objectContaining({
        blobs: expect.arrayContaining(["queue-1", "msg-1", "ack"]),
        indexes: ["queue-1"],
      }),
    );
  });

  it("retries with backoff when DB row found and response is 5xx", async () => {
    setupCreateDb([mockRow]);
    const ack = vi.fn();
    const retry = vi.fn();
    const writeDataPoint = vi.fn();
    const env = createMockEnv(undefined, undefined, { writeDataPoint });
    const msg = makeMsg(basePayload, ack, retry);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const batch = {
      queue: "delivery-queue",
      messages: [msg],
      retryAll: vi.fn(),
      ackAll: vi.fn(),
      metadata: null,
    } as unknown as MessageBatch<DeliveryPayload>;

    await handleDeliveryBatch(batch, env);

    expect(retry).toHaveBeenCalledOnce();
    expect(retry).toHaveBeenCalledWith({ delaySeconds: 5 });
    expect(ack).not.toHaveBeenCalled();
    expect(writeDataPoint).toHaveBeenCalledOnce();
    expect(writeDataPoint).toHaveBeenCalledWith(
      expect.objectContaining({
        blobs: expect.arrayContaining(["queue-1", "msg-1", "retry"]),
        indexes: ["queue-1"],
      }),
    );
  });

  it("retries with backoff when fetch throws a network error", async () => {
    setupCreateDb([mockRow]);
    const ack = vi.fn();
    const retry = vi.fn();
    const writeDataPoint = vi.fn();
    const env = createMockEnv(undefined, undefined, { writeDataPoint });
    const msg = makeMsg(basePayload, ack, retry);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network failure")));

    const batch = {
      queue: "delivery-queue",
      messages: [msg],
      retryAll: vi.fn(),
      ackAll: vi.fn(),
      metadata: null,
    } as unknown as MessageBatch<DeliveryPayload>;

    await handleDeliveryBatch(batch, env);

    expect(retry).toHaveBeenCalledOnce();
    expect(retry).toHaveBeenCalledWith({ delaySeconds: 5 });
    expect(ack).not.toHaveBeenCalled();
    expect(writeDataPoint).toHaveBeenCalledOnce();
    expect(writeDataPoint).toHaveBeenCalledWith(
      expect.objectContaining({
        blobs: expect.arrayContaining(["queue-1", "msg-1", "retry"]),
        indexes: ["queue-1"],
      }),
    );
  });

  it("acks when DB row is missing (nothing to deliver)", async () => {
    setupCreateDb([]);
    const ack = vi.fn();
    const retry = vi.fn();
    const writeDataPoint = vi.fn();
    const env = createMockEnv(undefined, undefined, { writeDataPoint });
    const msg = makeMsg(basePayload, ack, retry);

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const batch = {
      queue: "delivery-queue",
      messages: [msg],
      retryAll: vi.fn(),
      ackAll: vi.fn(),
      metadata: null,
    } as unknown as MessageBatch<DeliveryPayload>;

    await handleDeliveryBatch(batch, env);

    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeDataPoint).toHaveBeenCalledOnce();
    expect(writeDataPoint).toHaveBeenCalledWith(
      expect.objectContaining({
        blobs: expect.arrayContaining(["queue-1", "msg-1", "dropped"]),
        indexes: ["queue-1"],
      }),
    );
  });

  it("handles each message independently in a batch", async () => {
    // First message: DB found + 2xx → ack
    // Second message: DB missing → ack (dropped)
    // Third message: DB found + 5xx → retry
    const limitMockImpl = vi
      .fn()
      .mockResolvedValueOnce([mockRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([mockRow]);

    const whereMock = vi.fn().mockReturnValue({ limit: limitMockImpl });
    const fromMock = vi.fn().mockReturnValue({ where: whereMock });
    const selectMock = vi.fn().mockReturnValue({ from: fromMock });
    const { updateMock } = buildUpdateChain([]);
    mockCreateDb({ select: selectMock, update: updateMock });

    const ack1 = vi.fn();
    const retry1 = vi.fn();
    const ack2 = vi.fn();
    const retry2 = vi.fn();
    const ack3 = vi.fn();
    const retry3 = vi.fn();
    const writeDataPoint = vi.fn();
    const env = createMockEnv(undefined, undefined, { writeDataPoint });

    const msg1 = makeMsg({ ...basePayload, messageId: "msg-1" }, ack1, retry1);
    const msg2 = makeMsg({ ...basePayload, messageId: "msg-2" }, ack2, retry2);
    const msg3 = makeMsg({ ...basePayload, messageId: "msg-3" }, ack3, retry3);

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, status: 200 })
        .mockResolvedValueOnce({ ok: false, status: 500 }),
    );

    const batch = {
      queue: "delivery-queue",
      messages: [msg1, msg2, msg3],
      retryAll: vi.fn(),
      ackAll: vi.fn(),
      metadata: null,
    } as unknown as MessageBatch<DeliveryPayload>;

    await handleDeliveryBatch(batch, env);

    expect(ack1).toHaveBeenCalledOnce();
    expect(retry1).not.toHaveBeenCalled();
    expect(ack2).toHaveBeenCalledOnce();
    expect(retry2).not.toHaveBeenCalled();
    expect(retry3).toHaveBeenCalledOnce();
    expect(retry3).toHaveBeenCalledWith({ delaySeconds: 5 });
    expect(ack3).not.toHaveBeenCalled();
    expect(writeDataPoint).toHaveBeenCalledTimes(3);
  });

  it("calls TOPIC_ROOMS notify after ack when topicId is non-null", async () => {
    setupCreateDb([mockRow]);
    const ack = vi.fn();
    const retry = vi.fn();
    const writeDataPoint = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const mockGet = vi.fn().mockReturnValue({ fetch: mockFetch });
    const mockIdFromName = vi.fn().mockReturnValue("stub-id");
    const mockTopicRooms = { idFromName: mockIdFromName, get: mockGet };
    const env = createMockEnv(undefined, undefined, { writeDataPoint }, mockTopicRooms);
    const msg = makeMsg({ ...basePayload, topicId: "topic-1" }, ack, retry);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const batch = {
      queue: "delivery-queue",
      messages: [msg],
      retryAll: vi.fn(),
      ackAll: vi.fn(),
      metadata: null,
    } as unknown as MessageBatch<DeliveryPayload>;

    await handleDeliveryBatch(batch, env);

    expect(ack).toHaveBeenCalledOnce();
    expect(mockIdFromName).toHaveBeenCalledWith("topic-1");
    expect(mockGet).toHaveBeenCalledWith("stub-id");
    expect(mockFetch).toHaveBeenCalledOnce();
    const [notifyRequestArg] = mockFetch.mock.calls[0] ?? [];
    const notifyRequest = notifyRequestArg as Request;
    expect(notifyRequest.method).toBe("POST");
    expect(notifyRequest.headers.get("Content-Type")).toBe("application/json");
    await expect(notifyRequest.json()).resolves.toEqual({
      messageId: "msg-1",
      seq: "42",
      queueId: "queue-1",
      topicId: "topic-1",
    });
  });

  it("falls back to row.seq when an older queue payload is missing seq", async () => {
    setupCreateDb([mockRow]);
    const ack = vi.fn();
    const retry = vi.fn();
    const writeDataPoint = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const mockGet = vi.fn().mockReturnValue({ fetch: mockFetch });
    const mockIdFromName = vi.fn().mockReturnValue("stub-id");
    const mockTopicRooms = { idFromName: mockIdFromName, get: mockGet };
    const env = createMockEnv(undefined, undefined, { writeDataPoint }, mockTopicRooms);
    const legacyPayload = {
      messageId: "msg-1",
      queueId: "queue-1",
      pushEndpoint: "https://example.com/webhook",
      topicId: "topic-1",
      attempt: 0,
    } as DeliveryPayload;
    const msg = makeMsg(legacyPayload, ack, retry);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const batch = {
      queue: "delivery-queue",
      messages: [msg],
      retryAll: vi.fn(),
      ackAll: vi.fn(),
      metadata: null,
    } as unknown as MessageBatch<DeliveryPayload>;

    await handleDeliveryBatch(batch, env);

    expect(ack).toHaveBeenCalledOnce();
    const [notifyRequestArg] = mockFetch.mock.calls[0] ?? [];
    const notifyRequest = notifyRequestArg as Request;
    await expect(notifyRequest.json()).resolves.toEqual({
      messageId: "msg-1",
      seq: "42",
      queueId: "queue-1",
      topicId: "topic-1",
    });
  });

  it("logs a notify failure when TopicRoom returns a non-2xx response", async () => {
    setupCreateDb([mockRow]);
    const ack = vi.fn();
    const retry = vi.fn();
    const writeDataPoint = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const mockFetch = vi.fn().mockResolvedValue(new Response("bad", { status: 503 }));
    const mockGet = vi.fn().mockReturnValue({ fetch: mockFetch });
    const mockIdFromName = vi.fn().mockReturnValue("stub-id");
    const mockTopicRooms = { idFromName: mockIdFromName, get: mockGet };
    const env = createMockEnv(undefined, undefined, { writeDataPoint }, mockTopicRooms);
    const msg = makeMsg({ ...basePayload, topicId: "topic-1" }, ack, retry);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const batch = {
      queue: "delivery-queue",
      messages: [msg],
      retryAll: vi.fn(),
      ackAll: vi.fn(),
      metadata: null,
    } as unknown as MessageBatch<DeliveryPayload>;

    await handleDeliveryBatch(batch, env);

    expect(ack).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith("TopicRoom notify failed", {
      messageId: "msg-1",
      queueId: "queue-1",
      topicId: "topic-1",
      status: 503,
    });
  });

  it("logs a notify exception when TopicRoom throws after push ack", async () => {
    setupCreateDb([mockRow]);
    const ack = vi.fn();
    const retry = vi.fn();
    const writeDataPoint = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const mockFetch = vi.fn().mockRejectedValue(new Error("do unavailable"));
    const mockGet = vi.fn().mockReturnValue({ fetch: mockFetch });
    const mockIdFromName = vi.fn().mockReturnValue("stub-id");
    const mockTopicRooms = { idFromName: mockIdFromName, get: mockGet };
    const env = createMockEnv(undefined, undefined, { writeDataPoint }, mockTopicRooms);
    const msg = makeMsg({ ...basePayload, topicId: "topic-1" }, ack, retry);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const batch = {
      queue: "delivery-queue",
      messages: [msg],
      retryAll: vi.fn(),
      ackAll: vi.fn(),
      metadata: null,
    } as unknown as MessageBatch<DeliveryPayload>;

    await handleDeliveryBatch(batch, env);

    expect(ack).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith("TopicRoom notify threw", {
      messageId: "msg-1",
      queueId: "queue-1",
      topicId: "topic-1",
    });
  });

  it("does not call TOPIC_ROOMS notify after ack when topicId is null", async () => {
    setupCreateDb([mockRow]);
    const ack = vi.fn();
    const retry = vi.fn();
    const writeDataPoint = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const mockGet = vi.fn().mockReturnValue({ fetch: mockFetch });
    const mockIdFromName = vi.fn().mockReturnValue("stub-id");
    const mockTopicRooms = { idFromName: mockIdFromName, get: mockGet };
    const env = createMockEnv(undefined, undefined, { writeDataPoint }, mockTopicRooms);
    const msg = makeMsg({ ...basePayload, topicId: null }, ack, retry);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const batch = {
      queue: "delivery-queue",
      messages: [msg],
      retryAll: vi.fn(),
      ackAll: vi.fn(),
      metadata: null,
    } as unknown as MessageBatch<DeliveryPayload>;

    await handleDeliveryBatch(batch, env);

    expect(ack).toHaveBeenCalledOnce();
    expect(mockIdFromName).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("uses correct backoff for higher attempt counts", async () => {
    setupCreateDb([mockRow]);
    const ack = vi.fn();
    const retry = vi.fn();
    const writeDataPoint = vi.fn();
    const env = createMockEnv(undefined, undefined, { writeDataPoint });
    const msg = makeMsg({ ...basePayload, attempt: 3 }, ack, retry);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502 }));

    const batch = {
      queue: "delivery-queue",
      messages: [msg],
      retryAll: vi.fn(),
      ackAll: vi.fn(),
      metadata: null,
    } as unknown as MessageBatch<DeliveryPayload>;

    await handleDeliveryBatch(batch, env);

    expect(retry).toHaveBeenCalledWith({ delaySeconds: 40 });
  });

  // B1 regression: consumer must use msg.attempts (platform metadata) not body.attempt
  // Simulates producer stamping attempt:0 but the platform reporting 5th delivery after restarts.
  // Before fix: BACKOFF[body.attempt=0] = 5s. After fix: BACKOFF[msg.attempts-1=4] = 80s.
  it("B1: backoff uses platform attempts, not body.attempt, across redelivery", async () => {
    setupCreateDb([mockRow]);
    const ack = vi.fn();
    const retry = vi.fn();
    const env = createMockEnv();
    const msg = makeMsg(basePayload, ack, retry, 5); // body.attempt=0, msg.attempts=5

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const batch = {
      queue: "delivery-queue",
      messages: [msg],
      retryAll: vi.fn(),
      ackAll: vi.fn(),
      metadata: null,
    } as unknown as MessageBatch<DeliveryPayload>;

    await handleDeliveryBatch(batch, env);

    expect(retry).toHaveBeenCalledWith({ delaySeconds: 80 });
  });

  // B2-permanent regression: 4xx permanent failures should collapse retries (delaySeconds:0)
  // so max_retries=5 routes them to the DLQ quickly. Currently retries with backoff (bug).
  it("B2-permanent: 401 collapses retries via delaySeconds:0 for DLQ routing", async () => {
    setupCreateDb([mockRow]);
    const ack = vi.fn();
    const retry = vi.fn();
    const env = createMockEnv();
    const msg = makeMsg(basePayload, ack, retry);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    const batch = {
      queue: "delivery-queue",
      messages: [msg],
      retryAll: vi.fn(),
      ackAll: vi.fn(),
      metadata: null,
    } as unknown as MessageBatch<DeliveryPayload>;

    await handleDeliveryBatch(batch, env);

    expect(retry).toHaveBeenCalledWith({ delaySeconds: 0 });
    expect(ack).not.toHaveBeenCalled();
  });

  // B2-transient guard: 429 is a transient error (rate limited) — must retry with backoff,
  // not collapse to DLQ like a permanent 4xx.
  it("B2-transient: 429 retries with backoff, not collapsed to DLQ", async () => {
    setupCreateDb([mockRow]);
    const ack = vi.fn();
    const retry = vi.fn();
    const env = createMockEnv();
    const msg = makeMsg(basePayload, ack, retry); // attempts=1 → delaySeconds=5

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));

    const batch = {
      queue: "delivery-queue",
      messages: [msg],
      retryAll: vi.fn(),
      ackAll: vi.fn(),
      metadata: null,
    } as unknown as MessageBatch<DeliveryPayload>;

    await handleDeliveryBatch(batch, env);

    expect(retry).toHaveBeenCalledWith({ delaySeconds: 5 });
    expect(ack).not.toHaveBeenCalled();
  });

  // R10 deploy-safety: new consumer must accept old-shape body (attempt:0 still present)
  // and use msg.attempts for backoff — no crash, correct delay.
  it("R10: old body with attempt:0 accepted; backoff still uses msg.attempts", async () => {
    setupCreateDb([mockRow]);
    const ack = vi.fn();
    const retry = vi.fn();
    const env = createMockEnv();
    const msg = makeMsg(basePayload, ack, retry, 4); // body.attempt=0, msg.attempts=4

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const batch = {
      queue: "delivery-queue",
      messages: [msg],
      retryAll: vi.fn(),
      ackAll: vi.fn(),
      metadata: null,
    } as unknown as MessageBatch<DeliveryPayload>;

    await handleDeliveryBatch(batch, env);

    expect(retry).toHaveBeenCalledWith({ delaySeconds: 40 }); // BACKOFF[3], not BACKOFF[0]
    expect(ack).not.toHaveBeenCalled();
  });
});
