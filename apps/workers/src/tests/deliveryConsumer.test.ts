import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleDeliveryBatch } from "../consumers/deliveryConsumer";
import type { DeliveryPayload, Env } from "../db/client";

const mockRow = {
  id: "msg-1",
  data: { hello: "world" },
  queueId: "queue-1",
  expiresAt: new Date("2030-01-01"),
  received: false,
  receivedCount: 0,
  createdAt: new Date("2026-01-01"),
  receivedAt: null,
};

function makeMsg(body: DeliveryPayload, ack = vi.fn(), retry = vi.fn()): Message<DeliveryPayload> {
  return {
    body,
    ack,
    retry,
    id: "cf-msg-id",
    timestamp: new Date(),
    attempts: body.attempt + 1,
  } as unknown as Message<DeliveryPayload>;
}

// We need to mock the db/client module so createDb returns our mock
vi.mock("../db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/client")>();
  return {
    ...actual,
    createDb: vi.fn(),
  };
});

import { createDb } from "../db/client";

function setupCreateDb(selectRows: unknown[]) {
  const limitMock = vi.fn().mockResolvedValue(selectRows);
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });

  vi.mocked(createDb).mockReturnValue({ select: selectMock } as any);
  return { selectMock, fromMock, whereMock, limitMock };
}

const baseEnv: Env = {
  HYPERDRIVE: null as unknown as Hyperdrive,
  DATABASE_URL: "postgresql://localhost/test",
  JWT_SECRET: "test-secret",
  DELIVERY_QUEUE: null as unknown as Queue<DeliveryPayload>,
  RATE_LIMITER: null as unknown as RateLimit,
};

const basePayload: DeliveryPayload = {
  messageId: "msg-1",
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
    const msg = makeMsg(basePayload, ack, retry);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const batch = {
      queue: "delivery-queue",
      messages: [msg],
      retryAll: vi.fn(),
      ackAll: vi.fn(),
      metadata: null,
    } as unknown as MessageBatch<DeliveryPayload>;

    await handleDeliveryBatch(batch, baseEnv);

    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
  });

  it("retries with backoff when DB row found and response is 5xx", async () => {
    setupCreateDb([mockRow]);
    const ack = vi.fn();
    const retry = vi.fn();
    const msg = makeMsg(basePayload, ack, retry);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const batch = {
      queue: "delivery-queue",
      messages: [msg],
      retryAll: vi.fn(),
      ackAll: vi.fn(),
      metadata: null,
    } as unknown as MessageBatch<DeliveryPayload>;

    await handleDeliveryBatch(batch, baseEnv);

    expect(retry).toHaveBeenCalledOnce();
    expect(retry).toHaveBeenCalledWith({ delaySeconds: 5 });
    expect(ack).not.toHaveBeenCalled();
  });

  it("retries with backoff when fetch throws a network error", async () => {
    setupCreateDb([mockRow]);
    const ack = vi.fn();
    const retry = vi.fn();
    const msg = makeMsg(basePayload, ack, retry);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network failure")));

    const batch = {
      queue: "delivery-queue",
      messages: [msg],
      retryAll: vi.fn(),
      ackAll: vi.fn(),
      metadata: null,
    } as unknown as MessageBatch<DeliveryPayload>;

    await handleDeliveryBatch(batch, baseEnv);

    expect(retry).toHaveBeenCalledOnce();
    expect(retry).toHaveBeenCalledWith({ delaySeconds: 5 });
    expect(ack).not.toHaveBeenCalled();
  });

  it("acks when DB row is missing (nothing to deliver)", async () => {
    setupCreateDb([]);
    const ack = vi.fn();
    const retry = vi.fn();
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

    await handleDeliveryBatch(batch, baseEnv);

    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handles each message independently in a batch", async () => {
    // First message: DB found + 2xx → ack
    // Second message: DB missing → ack
    // Third message: DB found + 5xx → retry
    const limitMockImpl = vi
      .fn()
      .mockResolvedValueOnce([mockRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([mockRow]);

    const whereMock = vi.fn().mockReturnValue({ limit: limitMockImpl });
    const fromMock = vi.fn().mockReturnValue({ where: whereMock });
    const selectMock = vi.fn().mockReturnValue({ from: fromMock });
    vi.mocked(createDb).mockReturnValue({ select: selectMock } as any);

    const ack1 = vi.fn();
    const retry1 = vi.fn();
    const ack2 = vi.fn();
    const retry2 = vi.fn();
    const ack3 = vi.fn();
    const retry3 = vi.fn();

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

    await handleDeliveryBatch(batch, baseEnv);

    expect(ack1).toHaveBeenCalledOnce();
    expect(retry1).not.toHaveBeenCalled();

    expect(ack2).toHaveBeenCalledOnce();
    expect(retry2).not.toHaveBeenCalled();

    expect(retry3).toHaveBeenCalledOnce();
    expect(retry3).toHaveBeenCalledWith({ delaySeconds: 5 });
    expect(ack3).not.toHaveBeenCalled();
  });

  it("uses correct backoff for higher attempt counts", async () => {
    setupCreateDb([mockRow]);
    const ack = vi.fn();
    const retry = vi.fn();
    const msg = makeMsg({ ...basePayload, attempt: 3 }, ack, retry);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502 }));

    const batch = {
      queue: "delivery-queue",
      messages: [msg],
      retryAll: vi.fn(),
      ackAll: vi.fn(),
      metadata: null,
    } as unknown as MessageBatch<DeliveryPayload>;

    await handleDeliveryBatch(batch, baseEnv);

    expect(retry).toHaveBeenCalledWith({ delaySeconds: 40 });
  });
});
