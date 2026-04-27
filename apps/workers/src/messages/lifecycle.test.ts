import { describe, it, expect, vi } from "vitest";
import {
  deliveryModeForQueue,
  initialEnqueueStateForQueue,
  computeMessageExpiry,
  deriveIngestIdempotencyKey,
  insertQueueMessage,
  enqueuePersistedPushMessage,
  createAndDispatchQueueMessage,
  createAndDispatchTopicMessages,
} from "./lifecycle";
import { messages as messageTable } from "../db/schema";

type MessageRow = typeof messageTable.$inferSelect;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const now = new Date("2026-01-01");

const pushQueue = {
  id: "q-push",
  name: "push-queue",
  ownerId: "user-1",
  retentionPeriod: 7,
  pushEndpoint: "https://hooks.example.com/webhook",
  schema: null as unknown as Record<string, unknown>,
  createdAt: now,
  updatedAt: now,
};

const pullQueue = {
  id: "q-pull",
  name: "pull-queue",
  ownerId: "user-1",
  retentionPeriod: 30,
  pushEndpoint: null as string | null,
  schema: null as unknown as Record<string, unknown>,
  createdAt: now,
  updatedAt: now,
};

const baseMessage: MessageRow = {
  id: "msg-1",
  seq: 1n,
  data: { key: "value" },
  queueId: "q-push",
  idempotencyKey: null,
  deliveryMode: "push",
  enqueueState: "pending",
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockDb(
  overrides: Partial<Record<"insertReturn" | "selectReturn" | "updateThrow", unknown>> = {},
) {
  const returningMock = vi.fn().mockResolvedValue(overrides.insertReturn ?? [{ ...baseMessage }]);
  const onConflictDoNothingMock = vi.fn().mockReturnValue({ returning: returningMock });
  const valuesMock = vi.fn().mockReturnValue({
    returning: returningMock,
    onConflictDoNothing: onConflictDoNothingMock,
  });
  const insertMock = vi.fn().mockReturnValue({ values: valuesMock });

  const limitMock = vi.fn().mockResolvedValue(overrides.selectReturn ?? [{ ...baseMessage }]);
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });

  const updateWhereMock = vi.fn().mockResolvedValue([{ ...baseMessage }]);
  const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
  const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });

  const transactionMock = vi.fn(async (cb: (tx: unknown) => unknown) => {
    const txDb = {
      insert: insertMock,
      select: selectMock,
      update: updateMock,
    };
    return cb(txDb);
  });

  return {
    insert: insertMock,
    select: selectMock,
    update: updateMock,
    transaction: transactionMock,
    updateWhereMock,
    updateSetMock,
    insertMock,
    valuesMock,
    returningMock,
    onConflictDoNothingMock,
  };
}

// ---------------------------------------------------------------------------
// deliveryModeForQueue
// ---------------------------------------------------------------------------

describe("deliveryModeForQueue", () => {
  it("returns 'push' when queue has a pushEndpoint", () => {
    expect(deliveryModeForQueue(pushQueue)).toBe("push");
  });

  it("returns 'pull' when queue has no pushEndpoint", () => {
    expect(deliveryModeForQueue(pullQueue)).toBe("pull");
  });

  it("returns 'pull' when pushEndpoint is undefined", () => {
    expect(
      deliveryModeForQueue({
        id: "q",
        retentionPeriod: 7,
        pushEndpoint: undefined as unknown as null,
      }),
    ).toBe("pull");
  });
});

// ---------------------------------------------------------------------------
// initialEnqueueStateForQueue
// ---------------------------------------------------------------------------

describe("initialEnqueueStateForQueue", () => {
  it("returns 'pending' for push queues", () => {
    expect(initialEnqueueStateForQueue(pushQueue)).toBe("pending");
  });

  it("returns 'not_needed' for pull queues", () => {
    expect(initialEnqueueStateForQueue(pullQueue)).toBe("not_needed");
  });
});

// ---------------------------------------------------------------------------
// computeMessageExpiry
// ---------------------------------------------------------------------------

describe("computeMessageExpiry", () => {
  it("adds retentionPeriod days to the current date", () => {
    const before = new Date();
    const result = computeMessageExpiry({ retentionPeriod: 7 });
    const diffMs = result.getTime() - before.getTime();
    expect(diffMs).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
    expect(diffMs).toBeLessThan(8 * 24 * 60 * 60 * 1000);
  });
});

// ---------------------------------------------------------------------------
// deriveIngestIdempotencyKey
// ---------------------------------------------------------------------------

describe("deriveIngestIdempotencyKey", () => {
  it("joins mappingTraceId and mappingVersionId with colon", () => {
    expect(deriveIngestIdempotencyKey("trace-1", "v2")).toBe("trace-1:v2");
  });
});

// ---------------------------------------------------------------------------
// insertQueueMessage
// ---------------------------------------------------------------------------

describe("insertQueueMessage", () => {
  it("inserts a message for a push queue", async () => {
    const db = makeMockDb();
    const result = await insertQueueMessage(db as any, pushQueue, { key: "value" });
    expect(result).not.toBeNull();
    expect(result!.duplicate).toBe(false);
    expect(result!.message.id).toBe("msg-1");
    expect(db.insertMock).toHaveBeenCalled();
  });

  it("inserts a message for a pull queue", async () => {
    const db = makeMockDb();
    const result = await insertQueueMessage(db as any, pullQueue, { key: "value" });
    expect(result).not.toBeNull();
    expect(result!.duplicate).toBe(false);
  });

  it("returns null when insert yields no rows", async () => {
    const db = makeMockDb({ insertReturn: [] });
    const result = await insertQueueMessage(db as any, pushQueue, { key: "value" });
    expect(result).toBeNull();
  });

  it("handles idempotencyKey with onConflictDoNothing when key is provided", async () => {
    const db = makeMockDb();
    const result = await insertQueueMessage(
      db as any,
      pushQueue,
      { key: "value" },
      { idempotencyKey: "ik-1" },
    );
    expect(result).not.toBeNull();
    expect(result!.duplicate).toBe(false);
    expect(db.onConflictDoNothingMock).toHaveBeenCalled();
  });

  it("returns duplicate: true when idempotency insert was a conflict", async () => {
    const db = makeMockDb({
      insertReturn: [], // conflict → no row returned
      selectReturn: [{ ...baseMessage }],
    });
    const result = await insertQueueMessage(
      db as any,
      pushQueue,
      { key: "value" },
      { idempotencyKey: "ik-1" },
    );
    expect(result).not.toBeNull();
    expect(result!.duplicate).toBe(true);
  });

  it("returns null when idempotency conflict and existing row not found", async () => {
    const db = makeMockDb({
      insertReturn: [],
      selectReturn: [],
    });
    const result = await insertQueueMessage(
      db as any,
      pushQueue,
      { key: "value" },
      { idempotencyKey: "ik-1" },
    );
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// enqueuePersistedPushMessage
// ---------------------------------------------------------------------------

describe("enqueuePersistedPushMessage", () => {
  it("sends to DELIVERY_QUEUE and updates message state to enqueued", async () => {
    const sendMock = vi.fn().mockResolvedValue(undefined);
    const env = { DELIVERY_QUEUE: { send: sendMock } } as any;
    const db = makeMockDb();

    await enqueuePersistedPushMessage({
      env,
      db: db as any,
      message: { ...baseMessage, enqueueState: "pending" as const },
      queue: { ...pushQueue, pushEndpoint: pushQueue.pushEndpoint! },
      topicId: null,
    });

    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "msg-1",
        pushEndpoint: pushQueue.pushEndpoint,
        topicId: null,
        attempt: 0,
      }),
    );
    expect(db.updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ enqueueState: "enqueued" }),
    );
  });

  it("updates message to failed and re-throws on queue send failure", async () => {
    const sendMock = vi.fn().mockRejectedValue(new Error("queue down"));
    const env = { DELIVERY_QUEUE: { send: sendMock } } as any;
    const db = makeMockDb();

    await expect(
      enqueuePersistedPushMessage({
        env,
        db: db as any,
        message: { ...baseMessage },
        queue: { ...pushQueue, pushEndpoint: pushQueue.pushEndpoint! },
        topicId: "topic-1",
      }),
    ).rejects.toThrow("queue down");

    expect(db.updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enqueueState: "failed",
        lastEnqueueError: "queue down",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// createAndDispatchQueueMessage
// ---------------------------------------------------------------------------

describe("createAndDispatchQueueMessage", () => {
  it("inserts and dispatches a push message", async () => {
    const sendMock = vi.fn().mockResolvedValue(undefined);
    const env = { DELIVERY_QUEUE: { send: sendMock } } as any;
    const db = makeMockDb();

    const result = await createAndDispatchQueueMessage(
      env,
      db as any,
      pushQueue,
      { key: "value" },
      null,
    );

    expect(result).not.toBeNull();
    expect(result!.duplicate).toBe(false);
    expect(result!.enqueueError).toBeUndefined();
    expect(sendMock).toHaveBeenCalledOnce();
  });

  it("inserts but does not dispatch a pull message", async () => {
    const sendMock = vi.fn().mockResolvedValue(undefined);
    const env = { DELIVERY_QUEUE: { send: sendMock } } as any;
    const db = makeMockDb();

    const result = await createAndDispatchQueueMessage(
      env,
      db as any,
      pullQueue,
      { key: "value" },
      null,
    );

    expect(result).not.toBeNull();
    expect(result!.duplicate).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns null when insert fails", async () => {
    const sendMock = vi.fn();
    const env = { DELIVERY_QUEUE: { send: sendMock } } as any;
    const db = makeMockDb({ insertReturn: [] });

    const result = await createAndDispatchQueueMessage(
      env,
      db as any,
      pushQueue,
      { key: "value" },
      null,
    );
    expect(result).toBeNull();
  });

  it("returns enqueueError when queue send fails", async () => {
    const sendMock = vi.fn().mockRejectedValue(new Error("unavailable"));
    const env = { DELIVERY_QUEUE: { send: sendMock } } as any;
    const db = makeMockDb();

    const result = await createAndDispatchQueueMessage(
      env,
      db as any,
      pushQueue,
      { key: "value" },
      null,
    );
    expect(result).not.toBeNull();
    expect(result!.enqueueError).toBe("unavailable");
  });

  it("handles duplicate idempotency for a push queue", async () => {
    const sendMock = vi.fn().mockResolvedValue(undefined);
    const env = { DELIVERY_QUEUE: { send: sendMock } } as any;
    const db = makeMockDb({
      insertReturn: [],
      selectReturn: [{ ...baseMessage, deliveryMode: "push", enqueueState: "pending" as const }],
    });

    const result = await createAndDispatchQueueMessage(
      env,
      db as any,
      pushQueue,
      { key: "value" },
      null,
      {
        idempotencyKey: "ik-1",
      },
    );

    expect(result).not.toBeNull();
    expect(result!.duplicate).toBe(true);
  });

  it("skips dispatch when duplicate message already enqueued", async () => {
    const sendMock = vi.fn();
    const env = { DELIVERY_QUEUE: { send: sendMock } } as any;
    const db = makeMockDb({
      insertReturn: [],
      selectReturn: [{ ...baseMessage, deliveryMode: "push", enqueueState: "enqueued" as const }],
    });

    const result = await createAndDispatchQueueMessage(
      env,
      db as any,
      pushQueue,
      { key: "value" },
      null,
      {
        idempotencyKey: "ik-1",
      },
    );

    expect(result).not.toBeNull();
    expect(result!.duplicate).toBe(true);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createAndDispatchTopicMessages
// ---------------------------------------------------------------------------

describe("createAndDispatchTopicMessages", () => {
  const pushSub1 = { ...pushQueue, id: "q-push-1" };
  const pushSub2 = {
    ...pushQueue,
    id: "q-push-2",
    pushEndpoint: "https://hooks.example.com/webhook2",
  };
  const pullSub = { ...pullQueue, id: "q-pull-1" };

  it("dispatches messages to all push queues in a topic", async () => {
    const sendMock = vi.fn().mockResolvedValue(undefined);
    const env = { DELIVERY_QUEUE: { send: sendMock } } as any;
    const db = makeMockDb({ insertReturn: [{ ...baseMessage }] });

    const result = await createAndDispatchTopicMessages(
      env,
      db as any,
      [pushSub1, pushSub2],
      { key: "value" },
      "topic-1",
    );

    expect(result.messages).toHaveLength(2);
    expect(result.enqueueFailures).toHaveLength(0);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("dispatches push messages and skips pull queues", async () => {
    const sendMock = vi.fn().mockResolvedValue(undefined);
    const env = { DELIVERY_QUEUE: { send: sendMock } } as any;
    const db = makeMockDb({ insertReturn: [{ ...baseMessage }] });

    const result = await createAndDispatchTopicMessages(
      env,
      db as any,
      [pushSub1, pullSub],
      { key: "value" },
      "topic-1",
    );

    expect(result.messages).toHaveLength(2);
    expect(result.enqueueFailures).toHaveLength(0);
    expect(sendMock).toHaveBeenCalledOnce(); // only pushSub1
  });

  it("reports enqueue failures for failed push dispatches", async () => {
    const sendMock = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("timeout"));
    const env = { DELIVERY_QUEUE: { send: sendMock } } as any;
    const db = makeMockDb({ insertReturn: [{ ...baseMessage }] });

    const result = await createAndDispatchTopicMessages(
      env,
      db as any,
      [pushSub1, pushSub2],
      { key: "value" },
      "topic-1",
    );

    expect(result.messages).toHaveLength(2);
    expect(result.enqueueFailures).toHaveLength(1);
    expect(result.enqueueFailures[0]).toEqual({
      queueId: "q-push-2",
      message: "timeout",
    });
  });
});
