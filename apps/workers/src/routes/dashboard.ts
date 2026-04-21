import { Hono } from "hono";
import { eq, count } from "drizzle-orm";
import { createDb, type Env } from "../db/client";
import { queues, messages, serverMetrics, queueMetrics } from "../db/schema";
import { authenticate } from "../middleware/auth";

type AuthVariables = {
  user: { userId: string; username: string };
};

export const dashboardRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

dashboardRoutes.use("*", authenticate);

// GET /api/dashboard/server — server-level metrics
dashboardRoutes.get("/server", async (c) => {
  const db = createDb(c.env);

  let [metrics] = await db.select().from(serverMetrics).limit(1);
  if (!metrics) {
    [metrics] = await db
      .insert(serverMetrics)
      .values({
        startTime: new Date(),
        totalRequests: 0,
        activeConnections: 0,
        messagesProcessed: 0,
        errorCount: 0,
        avgResponseTime: 0,
      })
      .returning();
  }

  const [{ totalQueues }] = await db
    .select({ totalQueues: count() })
    .from(queues);
  const [{ totalMessages }] = await db
    .select({ totalMessages: count() })
    .from(messages);
  const [{ activeMessages }] = await db
    .select({ activeMessages: count() })
    .from(messages)
    .where(eq(messages.received, true));

  return c.json({
    status: "success",
    data: {
      serverMetrics: metrics,
      stats: {
        totalQueues,
        totalMessages,
        activeMessages,
      },
    },
  });
});

// GET /api/dashboard/queues — all queue metrics
dashboardRoutes.get("/queues", async (c) => {
  const db = createDb(c.env);

  const result = await db.select().from(queueMetrics);

  return c.json({
    status: "success",
    results: result.length,
    data: { queueMetrics: result },
  });
});

// GET /api/dashboard/queues/:queueId — single queue metrics
dashboardRoutes.get("/queues/:queueId", async (c) => {
  const queueId = c.req.param("queueId");
  const ownerId = c.get("user").userId;
  const db = createDb(c.env);

  const [queue] = await db
    .select()
    .from(queues)
    .where(eq(queues.id, queueId))
    .limit(1);
  if (!queue) {
    return c.json({ status: "error", message: "Queue not found" }, 404);
  }

  if (queue.ownerId !== ownerId) {
    return c.json(
      {
        status: "error",
        message: "Not authorized to view metrics for this queue",
      },
      403,
    );
  }

  let [metrics] = await db
    .select()
    .from(queueMetrics)
    .where(eq(queueMetrics.queueId, queueId))
    .limit(1);

  if (!metrics) {
    [metrics] = await db
      .insert(queueMetrics)
      .values({
        queueId,
        messageCount: 0,
        messagesSent: 0,
        messagesReceived: 0,
        avgWaitTime: 0,
      })
      .returning();
  }

  const [{ totalMessages }] = await db
    .select({ totalMessages: count() })
    .from(messages)
    .where(eq(messages.queueId, queueId));

  const [{ activeMessages }] = await db
    .select({ activeMessages: count() })
    .from(messages)
    .where(eq(messages.queueId, queueId));

  const [oldestMessage] = await db
    .select({ createdAt: messages.createdAt })
    .from(messages)
    .where(eq(messages.queueId, queueId))
    .orderBy(messages.createdAt)
    .limit(1);

  return c.json({
    status: "success",
    data: {
      queueMetrics: metrics,
      stats: {
        totalMessages,
        activeMessages,
        oldestMessageAge: oldestMessage
          ? Date.now() - oldestMessage.createdAt.getTime()
          : 0,
      },
    },
  });
});
