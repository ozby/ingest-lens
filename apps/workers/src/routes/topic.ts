import { Hono } from "hono";
import { eq, inArray } from "drizzle-orm";
import { createDb, type Env } from "../db/client";
import { topicSubscriptions, topics, queues } from "../db/schema";
import { serializeMessage } from "./message-response";
import { hydrateTopicsWithSubscriptions, requireOwnedQueue, requireOwnedTopic } from "./ownership";
import { authenticate, type AuthVariables } from "../middleware/auth";
import { rateLimiter } from "../middleware/rateLimiter";
import { createAndDispatchTopicMessages } from "../messages/lifecycle";

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

  const [topic] = await db.insert(topics).values({ name, ownerId }).returning();

  return c.json(
    {
      status: "success",
      data: {
        topic: {
          ...topic,
          subscribedQueues: [],
        },
      },
    },
    201,
  );
});

// GET /api/topics — list topics for owner
topicRoutes.get("/", async (c) => {
  const ownerId = c.get("user").userId;
  const db = createDb(c.env);

  const result = await db.select().from(topics).where(eq(topics.ownerId, ownerId));
  const hydratedTopics = await hydrateTopicsWithSubscriptions(db, result);

  return c.json({
    status: "success",
    results: hydratedTopics.length,
    data: { topics: hydratedTopics },
  });
});

// GET /api/topics/:topicId/ws — WebSocket upgrade via TopicRoom DO (must be before /:id)
topicRoutes.get("/:topicId/ws", async (c) => {
  const topicId = c.req.param("topicId");
  const topic = await requireOwnedTopic(c, topicId);
  if (topic instanceof Response) {
    return topic;
  }

  const id = c.env.TOPIC_ROOMS.idFromName(topic.id);
  const stub = c.env.TOPIC_ROOMS.get(id);
  return stub.fetch(c.req.raw);
});

// GET /api/topics/:id — get single topic
topicRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const topic = await requireOwnedTopic(c, id);

  if (topic instanceof Response) {
    return topic;
  }

  return c.json({ status: "success", data: { topic } });
});

// DELETE /api/topics/:id — delete topic
topicRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const db = createDb(c.env);

  const topic = await requireOwnedTopic(c, id, {
    notFound: `Topic not found with ID: ${id}`,
    unauthorized: "Not authorized to delete this topic",
  });

  if (topic instanceof Response) {
    return topic;
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

  const db = createDb(c.env);

  const topic = await requireOwnedTopic(c, topicId, {
    unauthorized: "Not authorized to modify this topic",
  });
  if (topic instanceof Response) {
    return topic;
  }

  const queue = await requireOwnedQueue(c, queueId);
  if (queue instanceof Response) {
    return queue;
  }

  if (topic.subscribedQueues.includes(queueId)) {
    return c.json({ status: "error", message: "Queue is already subscribed to this topic" }, 400);
  }

  await db.insert(topicSubscriptions).values({ topicId, queueId });

  return c.json({
    status: "success",
    data: {
      topic: {
        ...topic,
        subscribedQueues: [...topic.subscribedQueues, queueId],
      },
    },
  });
});

// POST /api/topics/:topicId/publish — publish message to all subscribed queues
topicRoutes.post("/:topicId/publish", async (c) => {
  const topicId = c.req.param("topicId");
  const body = await c.req.json<{ data: Record<string, unknown> }>();
  const { data } = body;

  if (!data || typeof data !== "object") {
    return c.json({ status: "error", message: "Message data must be an object" }, 400);
  }

  const db = createDb(c.env);

  const topic = await requireOwnedTopic(c, topicId, {
    unauthorized: "Not authorized to publish to this topic",
  });
  if (topic instanceof Response) {
    return topic;
  }

  if (topic.subscribedQueues.length === 0) {
    return c.json({ status: "error", message: "Topic has no subscribers" }, 400);
  }

  const subscribedQueues = await db
    .select()
    .from(queues)
    .where(inArray(queues.id, topic.subscribedQueues));

  let dispatched: Awaited<ReturnType<typeof createAndDispatchTopicMessages>>;
  try {
    dispatched = await createAndDispatchTopicMessages(c.env, db, subscribedQueues, data, topicId);
  } catch (error) {
    return c.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Failed to create message",
      },
      500,
    );
  }
  const { messages: createdMessages, enqueueFailures } = dispatched;

  if (enqueueFailures.length > 0) {
    return c.json(
      {
        status: "error",
        message: "Failed to enqueue one or more topic deliveries",
        data: {
          messages: createdMessages.map((message) => serializeMessage(message)),
          enqueueFailures,
        },
      },
      502,
    );
  }

  return c.json(
    {
      status: "success",
      results: createdMessages.length,
      data: { messages: createdMessages.map((message) => serializeMessage(message)) },
    },
    201,
  );
});
