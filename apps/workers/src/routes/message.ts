import { Hono } from "hono";
import { eq, and, sql } from "drizzle-orm";
import { createDb, type Env } from "../db/client";
import { queues, messages, queueMetrics } from "../db/schema";
import { authenticate } from "../middleware/auth";

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

// POST /api/messages/:queueId — send message
messageRoutes.post("/:queueId", async (c) => {
  const queueId = c.req.param("queueId");
  const body = await c.req.json<{ data: Record<string, unknown> }>();
  const { data } = body;

  if (!data || typeof data !== "object") {
    return c.json(
      { status: "error", message: "Message data must be an object" },
      400,
    );
  }

  const db = createDb(c.env);

  const [queue] = await db
    .select()
    .from(queues)
    .where(eq(queues.id, queueId))
    .limit(1);
  if (!queue) {
    return c.json({ status: "error", message: "Queue not found" }, 404);
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
    })
    .returning();

  // Increment queue metrics
  await db
    .update(queueMetrics)
    .set({
      messageCount: sql`${queueMetrics.messageCount} + 1`,
      messagesSent: sql`${queueMetrics.messagesSent} + 1`,
    })
    .where(eq(queueMetrics.queueId, queueId));

  // Fan-out to push endpoint if configured (fire-and-forget via waitUntil)
  if (queue.pushEndpoint) {
    c.executionCtx.waitUntil(
      fetch(queue.pushEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      }).catch(() => {
        // swallow push errors
      }),
    );
  }

  return c.json({ status: "success", data: { message } }, 201);
});

// GET /api/messages/:queueId — receive messages
messageRoutes.get("/:queueId", async (c) => {
  const queueId = c.req.param("queueId");
  const maxMessages = parseInt(
    c.req.query("maxMessages") ?? String(DEFAULT_MAX_MESSAGES),
    10,
  );
  const visibilityTimeout = parseInt(
    c.req.query("visibilityTimeout") ?? String(DEFAULT_VISIBILITY_TIMEOUT),
    10,
  );

  const db = createDb(c.env);

  const [queue] = await db
    .select()
    .from(queues)
    .where(eq(queues.id, queueId))
    .limit(1);
  if (!queue) {
    return c.json({ status: "error", message: "Queue not found" }, 404);
  }

  const result = await db
    .select()
    .from(messages)
    .where(and(eq(messages.queueId, queueId), eq(messages.received, false)))
    .limit(Math.min(maxMessages, 10));

  if (result.length === 0) {
    return c.json({
      status: "success",
      results: 0,
      data: { messages: [], visibilityTimeout },
    });
  }

  const messageIds = result.map((m) => m.id);
  const receivedAt = new Date();

  // Mark messages as received
  for (const id of messageIds) {
    await db
      .update(messages)
      .set({
        received: true,
        receivedAt,
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
    data: { messages: result, visibilityTimeout },
  });
});

// GET /api/messages/:queueId/:messageId — get single message
messageRoutes.get("/:queueId/:messageId", async (c) => {
  const queueId = c.req.param("queueId");
  const messageId = c.req.param("messageId");
  const db = createDb(c.env);

  const [message] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.queueId, queueId)))
    .limit(1);

  if (!message) {
    return c.json({ status: "error", message: "Message not found" }, 404);
  }

  return c.json({ status: "success", data: message });
});

// DELETE /api/messages/:queueId/:messageId — delete (ack) message
messageRoutes.delete("/:queueId/:messageId", async (c) => {
  const queueId = c.req.param("queueId");
  const messageId = c.req.param("messageId");
  const db = createDb(c.env);

  const [queue] = await db
    .select()
    .from(queues)
    .where(eq(queues.id, queueId))
    .limit(1);
  if (!queue) {
    return c.json({ status: "error", message: "Queue not found" }, 404);
  }

  const [message] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.queueId, queueId)))
    .limit(1);

  if (!message) {
    return c.json({ status: "error", message: "Message not found" }, 404);
  }

  await db
    .delete(messages)
    .where(and(eq(messages.id, messageId), eq(messages.queueId, queueId)));

  return c.json({ status: "success", data: null }, 200);
});
