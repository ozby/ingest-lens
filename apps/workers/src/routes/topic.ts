import { Hono } from "hono";
import { eq, inArray } from "drizzle-orm";
import { createDb, type Env } from "../db/client";
import { topics, queues, messages } from "../db/schema";
import { authenticate } from "../middleware/auth";
import { rateLimiter } from "../middleware/rateLimiter";

type AuthVariables = {
  user: { userId: string; username: string };
};

export const topicRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

topicRoutes.use("*", authenticate);
topicRoutes.use("*", rateLimiter);

// POST /api/topics — create topic
topicRoutes.post("/", async (c) => {
  const body = await c.req.json<{ name: string }>();
  const { name } = body;

  if (!name) {
    return c.json({ status: "error", message: "Topic name is required" }, 400);
  }

  const ownerId = c.get("user").userId;
  const db = createDb(c.env);

  const [topic] = await db
    .insert(topics)
    .values({ name, ownerId, subscribedQueues: [] })
    .returning();

  return c.json({ status: "success", data: { topic } }, 201);
});

// GET /api/topics — list topics for owner
topicRoutes.get("/", async (c) => {
  const ownerId = c.get("user").userId;
  const db = createDb(c.env);

  const result = await db.select().from(topics).where(eq(topics.ownerId, ownerId));

  return c.json({
    status: "success",
    results: result.length,
    data: { topics: result },
  });
});

// GET /api/topics/:topicId/ws — WebSocket upgrade via TopicRoom DO (must be before /:id)
topicRoutes.get("/:topicId/ws", async (c) => {
  const topicId = c.req.param("topicId");
  const id = c.env.TOPIC_ROOMS.idFromName(topicId);
  const stub = c.env.TOPIC_ROOMS.get(id);
  return stub.fetch(c.req.raw);
});

// GET /api/topics/:id — get single topic
topicRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const ownerId = c.get("user").userId;
  const db = createDb(c.env);

  const [topic] = await db.select().from(topics).where(eq(topics.id, id)).limit(1);

  if (!topic) {
    return c.json({ status: "error", message: "Topic not found" }, 404);
  }

  if (topic.ownerId !== ownerId) {
    return c.json({ status: "error", message: "Not authorized to access this topic" }, 403);
  }

  return c.json({ status: "success", data: { topic } });
});

// DELETE /api/topics/:id — delete topic
topicRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const ownerId = c.get("user").userId;
  const db = createDb(c.env);

  const [topic] = await db.select().from(topics).where(eq(topics.id, id)).limit(1);

  if (!topic) {
    return c.json({ status: "error", message: `Topic not found with ID: ${id}` }, 404);
  }

  if (topic.ownerId !== ownerId) {
    return c.json({ status: "error", message: "Not authorized to delete this topic" }, 403);
  }

  await db.delete(topics).where(eq(topics.id, id));

  return c.json({ status: "success", data: null }, 200);
});

// POST /api/topics/:topicId/subscribe — subscribe queue to topic
topicRoutes.post("/:topicId/subscribe", async (c) => {
  const topicId = c.req.param("topicId");
  const body = await c.req.json<{ queueId: string }>();
  const { queueId } = body;

  if (!queueId) {
    return c.json({ status: "error", message: "queueId is required" }, 400);
  }

  const ownerId = c.get("user").userId;
  const db = createDb(c.env);

  const [topic] = await db.select().from(topics).where(eq(topics.id, topicId)).limit(1);
  if (!topic) {
    return c.json({ status: "error", message: "Topic not found" }, 404);
  }

  const [queue] = await db.select().from(queues).where(eq(queues.id, queueId)).limit(1);
  if (!queue) {
    return c.json({ status: "error", message: "Queue not found" }, 404);
  }

  if (topic.ownerId !== ownerId) {
    return c.json({ status: "error", message: "Not authorized to modify this topic" }, 403);
  }

  if (topic.subscribedQueues.includes(queueId)) {
    return c.json({ status: "error", message: "Queue is already subscribed to this topic" }, 400);
  }

  const [updated] = await db
    .update(topics)
    .set({ subscribedQueues: [...topic.subscribedQueues, queueId] })
    .where(eq(topics.id, topicId))
    .returning();

  return c.json({ status: "success", data: { topic: updated } });
});

// POST /api/topics/:topicId/publish — publish message to all subscribed queues
topicRoutes.post("/:topicId/publish", async (c) => {
  const topicId = c.req.param("topicId");
  const body = await c.req.json<{ data: Record<string, unknown> }>();
  const { data } = body;

  if (!data || typeof data !== "object") {
    return c.json({ status: "error", message: "Message data must be an object" }, 400);
  }

  const ownerId = c.get("user").userId;
  const db = createDb(c.env);

  const [topic] = await db.select().from(topics).where(eq(topics.id, topicId)).limit(1);
  if (!topic) {
    return c.json({ status: "error", message: "Topic not found" }, 404);
  }

  if (topic.ownerId !== ownerId) {
    return c.json({ status: "error", message: "Not authorized to publish to this topic" }, 403);
  }

  if (topic.subscribedQueues.length === 0) {
    return c.json({ status: "error", message: "Topic has no subscribers" }, 400);
  }

  const subscribedQueues = await db
    .select()
    .from(queues)
    .where(inArray(queues.id, topic.subscribedQueues));

  const createdMessages = [];
  for (const queue of subscribedQueues) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + queue.retentionPeriod);

    const [message] = await db
      .insert(messages)
      .values({
        data,
        queueId: queue.id,
        expiresAt,
        received: false,
        receivedCount: 0,
      })
      .returning();

    createdMessages.push(message);

    // Enqueue delivery via Cloudflare Queues for reliable ack/retry
    if (queue.pushEndpoint) {
      await c.env.DELIVERY_QUEUE.send({
        messageId: message.id,
        seq: String(message.seq),
        queueId: queue.id,
        pushEndpoint: queue.pushEndpoint,
        topicId,
        attempt: 0,
      });
    }
  }

  return c.json(
    {
      status: "success",
      results: createdMessages.length,
      data: { messages: createdMessages },
    },
    201,
  );
});
