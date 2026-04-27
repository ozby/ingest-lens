import { and, eq, sql } from "drizzle-orm";
import type { DeliveryPayload, Env } from "../db/client";
import { createDb } from "../db/client";
import {
  messages,
  queueMetrics,
  type MessageDeliveryMode,
  type MessageEnqueueState,
  type queues,
} from "../db/schema";

type DbLike = Pick<ReturnType<typeof createDb>, "insert" | "select" | "update">;

type QueueRow = Pick<typeof queues.$inferSelect, "id" | "retentionPeriod" | "pushEndpoint">;

type MessageRow = typeof messages.$inferSelect;

type CreateQueueMessageOptions = {
  idempotencyKey?: string | null;
};

type InsertedMessageResult = {
  message: MessageRow;
  duplicate: boolean;
  enqueueError?: string;
};

type TopicFanoutFailure = {
  queueId: string;
  message: string;
};

type TopicDispatchResult = {
  messages: MessageRow[];
  enqueueFailures: TopicFanoutFailure[];
};

type PushDeliveryContext = {
  env: Env;
  db: DbLike;
  message: MessageRow;
  queue: QueueRow & { pushEndpoint: string };
  topicId: string | null;
};

export function deliveryModeForQueue(queue: QueueRow): MessageDeliveryMode {
  return queue.pushEndpoint ? "push" : "pull";
}

export function initialEnqueueStateForQueue(queue: QueueRow): MessageEnqueueState {
  return queue.pushEndpoint ? "pending" : "not_needed";
}

export function computeMessageExpiry(queue: Pick<QueueRow, "retentionPeriod">): Date {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + queue.retentionPeriod);
  return expiresAt;
}

export function deriveIngestIdempotencyKey(
  mappingTraceId: string,
  mappingVersionId: string,
): string {
  return `${mappingTraceId}:${mappingVersionId}`;
}

function buildMessageValues(
  queue: QueueRow,
  data: Record<string, unknown>,
  idempotencyKey?: string | null,
) {
  return {
    data,
    queueId: queue.id,
    expiresAt: computeMessageExpiry(queue),
    received: false,
    receivedCount: 0,
    idempotencyKey: idempotencyKey ?? null,
    deliveryMode: deliveryModeForQueue(queue),
    enqueueState: initialEnqueueStateForQueue(queue),
    pushDeliveredAt: null,
    lastEnqueueError: null,
  } as const;
}

async function incrementQueueMessageMetrics(db: DbLike, queueId: string): Promise<void> {
  await db
    .update(queueMetrics)
    .set({
      messageCount: sql`${queueMetrics.messageCount} + 1`,
      messagesSent: sql`${queueMetrics.messagesSent} + 1`,
    })
    .where(eq(queueMetrics.queueId, queueId));
}

function shouldRetryPushEnqueue(message: MessageRow): boolean {
  return (
    message.deliveryMode === "push" &&
    message.pushDeliveredAt === null &&
    (message.enqueueState === "failed" || message.enqueueState === "pending")
  );
}

export async function insertQueueMessage(
  db: DbLike,
  queue: QueueRow,
  data: Record<string, unknown>,
  options: CreateQueueMessageOptions = {},
): Promise<InsertedMessageResult | null> {
  const { idempotencyKey = null } = options;
  const values = buildMessageValues(queue, data, idempotencyKey);

  if (idempotencyKey) {
    const inserted = await db
      .insert(messages)
      .values(values)
      .onConflictDoNothing({
        target: [messages.queueId, messages.idempotencyKey],
      })
      .returning();
    const message = inserted[0];
    if (message) {
      await incrementQueueMessageMetrics(db, queue.id);
      return { message, duplicate: false };
    }

    const [existing] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.queueId, queue.id), eq(messages.idempotencyKey, idempotencyKey)))
      .limit(1);
    if (!existing) {
      return null;
    }

    return { message: existing, duplicate: true };
  }

  const inserted = await db.insert(messages).values(values).returning();
  const message = inserted[0];
  if (!message) {
    return null;
  }

  await incrementQueueMessageMetrics(db, queue.id);
  return { message, duplicate: false };
}

export async function enqueuePersistedPushMessage({
  env,
  db,
  message,
  queue,
  topicId,
}: PushDeliveryContext): Promise<void> {
  try {
    const payload: DeliveryPayload = {
      messageId: message.id,
      seq: String(message.seq),
      queueId: queue.id,
      pushEndpoint: queue.pushEndpoint,
      topicId,
      attempt: 0,
    };
    await env.DELIVERY_QUEUE.send(payload);
    await db
      .update(messages)
      .set({
        enqueueState: "enqueued",
        lastEnqueueError: null,
        updatedAt: new Date(),
      })
      .where(eq(messages.id, message.id));
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Failed to enqueue push delivery";
    await db
      .update(messages)
      .set({
        enqueueState: "failed",
        lastEnqueueError: messageText,
        updatedAt: new Date(),
      })
      .where(eq(messages.id, message.id));
    throw error;
  }
}

async function ensurePushMessageDispatched(
  env: Env,
  db: DbLike,
  message: MessageRow,
  queue: QueueRow,
  topicId: string | null,
): Promise<InsertedMessageResult> {
  if (!queue.pushEndpoint) {
    return { message, duplicate: false };
  }

  if (!shouldRetryPushEnqueue(message)) {
    return { message, duplicate: false };
  }

  try {
    await enqueuePersistedPushMessage({
      env,
      db,
      message,
      queue: { ...queue, pushEndpoint: queue.pushEndpoint },
      topicId,
    });
    return {
      message: {
        ...message,
        deliveryMode: "push",
        enqueueState: "enqueued",
        lastEnqueueError: null,
      },
      duplicate: false,
    };
  } catch (error) {
    const enqueueError = error instanceof Error ? error.message : "Failed to enqueue push delivery";
    return {
      message: {
        ...message,
        deliveryMode: "push",
        enqueueState: "failed",
        lastEnqueueError: enqueueError,
      },
      duplicate: false,
      enqueueError,
    };
  }
}

export async function createAndDispatchQueueMessage(
  env: Env,
  db: DbLike,
  queue: QueueRow,
  data: Record<string, unknown>,
  topicId: string | null,
  options: CreateQueueMessageOptions = {},
): Promise<InsertedMessageResult | null> {
  const inserted = await insertQueueMessage(db, queue, data, options);
  if (!inserted) {
    return null;
  }

  if (inserted.duplicate) {
    if (!queue.pushEndpoint) {
      return inserted;
    }

    const retried = await ensurePushMessageDispatched(env, db, inserted.message, queue, topicId);
    return {
      ...retried,
      duplicate: true,
    };
  }

  if (!queue.pushEndpoint) {
    return inserted;
  }

  return ensurePushMessageDispatched(env, db, inserted.message, queue, topicId);
}

export async function createAndDispatchTopicMessages(
  env: Env,
  db: ReturnType<typeof createDb>,
  subscribedQueues: Array<typeof queues.$inferSelect>,
  data: Record<string, unknown>,
  topicId: string,
  options: CreateQueueMessageOptions = {},
): Promise<TopicDispatchResult> {
  const persisted = await db.transaction(async (tx) => {
    const createdMessages: Array<{
      message: MessageRow;
      queue: typeof queues.$inferSelect;
      duplicate: boolean;
    }> = [];

    for (const queue of subscribedQueues) {
      const inserted = await insertQueueMessage(
        tx as unknown as ReturnType<typeof createDb>,
        queue,
        data,
        options,
      );
      if (!inserted) {
        throw new Error("Failed to create message");
      }

      createdMessages.push({
        message: inserted.message,
        queue,
        duplicate: inserted.duplicate,
      });
    }

    return createdMessages;
  });

  const messages: MessageRow[] = [];
  const enqueueFailures: TopicFanoutFailure[] = [];

  for (const persistedMessage of persisted) {
    if (!persistedMessage.queue.pushEndpoint) {
      messages.push(persistedMessage.message);
      continue;
    }

    const dispatched = await ensurePushMessageDispatched(
      env,
      db,
      persistedMessage.message,
      persistedMessage.queue,
      topicId,
    );

    messages.push(dispatched.message);
    if (dispatched.enqueueError) {
      enqueueFailures.push({
        queueId: persistedMessage.queue.id,
        message: dispatched.enqueueError,
      });
    }
  }

  return { messages, enqueueFailures };
}
