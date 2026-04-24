import { Hono } from "hono";
import { and, eq, lte, or, sql } from "drizzle-orm";
import { createDb, type Env } from "../db/client";
import { messages, queueMetrics } from "../db/schema";
import { serializeMessage, serializeMessages } from "./message-response";
import { requireOwnedQueue } from "./ownership";
import { authenticate } from "../middleware/auth";
import { rateLimiter } from "../middleware/rateLimiter";

const DEFAULT_MAX_MESSAGES = 10;
const DEFAULT_VISIBILITY_TIMEOUT = 30;

type AuthVariables = {
  user: { userId: string; username: string };
};

export const messageRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

messageRoutes.use("*", authenticate);
messageRoutes.use("*", rateLimiter);

// POST /api/messages/:queueId — send message
messageRoutes.post("/:queueId", async (c) => {
  const queueId = c.req.param("queueId");
  const body = await c.req.json<{ data: Record<string, unknown> }>();
  const { data } = body;

  if (!data || typeof data !== "object") {
    return c.json({ status: "error", message: "Message data must be an object" }, 400);
  }

  const db = createDb(c.env);

  const queue = await requireOwnedQueue(c, queueId);
  if (queue instanceof Response) {
    return queue;
  }

  const idempotencyKey = c.req.header("Idempotency-Key") ?? null;

  if (idempotencyKey) {
    const [existing] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.queueId, queueId), eq(messages.idempotencyKey, idempotencyKey)))
      .limit(1);
    if (existing) {
      return c.json({ status: "success", data: { message: serializeMessage(existing) } }, 200);
    }
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + queue.retentionPeriod);

  const [message] = await db
    .insert(messages)
    .values({
      data,
      queueId,
      expiresAt,
      received: false,
      receivedCount: 0,
      idempotencyKey,
    })
    .returning();

  if (!message) {
    return c.json({ status: "error", message: "Failed to create message" }, 500);
  }

  // Increment queue metrics
  await db
    .update(queueMetrics)
    .set({
      messageCount: sql`${queueMetrics.messageCount} + 1`,
      messagesSent: sql`${queueMetrics.messagesSent} + 1`,
    })
    .where(eq(queueMetrics.queueId, queueId));

  // Enqueue delivery via Cloudflare Queues for reliable ack/retry
  if (queue.pushEndpoint) {
    await c.env.DELIVERY_QUEUE.send({
      messageId: message.id,
      seq: String(message.seq),
      queueId,
      pushEndpoint: queue.pushEndpoint,
      topicId: null,
      attempt: 0,
    });
  }

  return c.json({ status: "success", data: { message: serializeMessage(message) } }, 201);
});

// GET /api/messages/:queueId — receive messages
messageRoutes.get("/:queueId", async (c) => {
  const queueId = c.req.param("queueId");
  const maxMessages = parseInt(c.req.query("maxMessages") ?? String(DEFAULT_MAX_MESSAGES), 10);
  const visibilityTimeout = parseInt(
    c.req.query("visibilityTimeout") ?? String(DEFAULT_VISIBILITY_TIMEOUT),
    10,
  );
  const clampedVisibilityTimeout =
    Number.isFinite(visibilityTimeout) && visibilityTimeout > 0
      ? visibilityTimeout
      : DEFAULT_VISIBILITY_TIMEOUT;

  const db = createDb(c.env);

  const queue = await requireOwnedQueue(c, queueId);
  if (queue instanceof Response) {
    return queue;
  }

  const now = new Date();
  const visibilityExpiresAt = new Date(now.getTime() + clampedVisibilityTimeout * 1000);

  await db
    .update(messages)
    .set({
      received: false,
      visibilityExpiresAt: null,
    })
    .where(
      and(
        eq(messages.queueId, queueId),
        eq(messages.received, true),
        lte(messages.visibilityExpiresAt, now),
      ),
    );

  const result = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.queueId, queueId),
        or(eq(messages.received, false), lte(messages.visibilityExpiresAt, now)),
      ),
    )
    .limit(Math.min(maxMessages, 10));

  if (result.length === 0) {
    return c.json({
      status: "success",
      results: 0,
      data: { messages: [], visibilityTimeout: clampedVisibilityTimeout },
    });
  }

  const messageIds = result.map((m) => m.id);
  const leasedMessages = result.map((message) => ({
    ...message,
    received: true,
    receivedAt: now,
    visibilityExpiresAt,
    receivedCount: message.receivedCount + 1,
  }));

  for (const id of messageIds) {
    await db
      .update(messages)
      .set({
        received: true,
        receivedAt: now,
        visibilityExpiresAt,
        receivedCount: sql`${messages.receivedCount} + 1`,
      })
      .where(eq(messages.id, id));
  }

  // Update queue metrics
  await db
    .update(queueMetrics)
    .set({
      messagesReceived: sql`${queueMetrics.messagesReceived} + ${result.length}`,
    })
    .where(eq(queueMetrics.queueId, queueId));

  return c.json({
    status: "success",
    results: result.length,
    data: {
      messages: serializeMessages(leasedMessages),
      visibilityTimeout: clampedVisibilityTimeout,
    },
  });
});

// GET /api/messages/:queueId/:messageId — get single message
messageRoutes.get("/:queueId/:messageId", async (c) => {
  const queueId = c.req.param("queueId");
  const messageId = c.req.param("messageId");
  const db = createDb(c.env);

  const queue = await requireOwnedQueue(c, queueId);
  if (queue instanceof Response) {
    return queue;
  }

  const [message] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.queueId, queueId)))
    .limit(1);

  if (!message) {
    return c.json({ status: "error", message: "Message not found" }, 404);
  }

  return c.json({ status: "success", data: { message: serializeMessage(message) } });
});

// DELETE /api/messages/:queueId/:messageId — delete (ack) message
messageRoutes.delete("/:queueId/:messageId", async (c) => {
  const queueId = c.req.param("queueId");
  const messageId = c.req.param("messageId");
  const db = createDb(c.env);

  const queue = await requireOwnedQueue(c, queueId);
  if (queue instanceof Response) {
    return queue;
  }

  const [message] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.queueId, queueId)))
    .limit(1);

  if (!message) {
    return c.json({ status: "error", message: "Message not found" }, 404);
  }

  await db.delete(messages).where(and(eq(messages.id, messageId), eq(messages.queueId, queueId)));

  return c.json({ status: "success", data: { deletedMessageId: messageId } }, 200);
});
