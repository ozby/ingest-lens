import { Hono } from "hono";
import { and, count, eq, gt, inArray } from "drizzle-orm";
import { createDb, type Env } from "../db/client";
import {
  intakeAttempts,
  queues,
  messages,
  serverMetrics,
  queueMetrics,
} from "../db/schema";
import { requireOwnedQueue } from "./ownership";
import { authenticate } from "../middleware/auth";
import { rateLimiter } from "../middleware/rateLimiter";

type AuthVariables = {
  user: { userId: string; username: string };
};

export const dashboardRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

dashboardRoutes.use("*", authenticate);
dashboardRoutes.use("*", rateLimiter);

// GET /api/dashboard/server — server-level metrics
dashboardRoutes.get("/server", async (c) => {
  const db = createDb(c.env);
  const now = new Date();

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
    .where(
      and(eq(messages.received, true), gt(messages.visibilityExpiresAt, now)),
    );

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

// GET /api/dashboard/server/activity — server activity history
dashboardRoutes.get("/server/activity", async (c) => {
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

  const metricsWithActivity = metrics as unknown as {
    activityHistory?: Array<{
      time: string;
      requests: number;
      messages: number;
      errors: number;
    }>;
  };
  const activityHistory = Array.isArray(metricsWithActivity.activityHistory)
    ? metricsWithActivity.activityHistory
    : [];

  return c.json({
    status: "success",
    data: { activityHistory },
  });
});

// GET /api/dashboard/queues — all queue metrics
dashboardRoutes.get("/queues", async (c) => {
  const ownerId = c.get("user").userId;
  const db = createDb(c.env);

  const ownedQueues = await db
    .select({ id: queues.id })
    .from(queues)
    .where(eq(queues.ownerId, ownerId));

  if (ownedQueues.length === 0) {
    return c.json({
      status: "success",
      results: 0,
      data: { queueMetrics: [] },
    });
  }

  const result = await db
    .select()
    .from(queueMetrics)
    .where(
      inArray(
        queueMetrics.queueId,
        ownedQueues.map((queue) => queue.id),
      ),
    );

  return c.json({
    status: "success",
    results: result.length,
    data: { queueMetrics: result },
  });
});

// GET /api/dashboard/queues/:queueId — single queue metrics
dashboardRoutes.get("/queues/:queueId", async (c) => {
  const queueId = c.req.param("queueId");
  const db = createDb(c.env);
  const now = new Date();

  const queue = await requireOwnedQueue(c, queueId, {
    unauthorized: "Not authorized to view metrics for this queue",
  });
  if (queue instanceof Response) {
    return queue;
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
    .where(
      and(
        eq(messages.queueId, queueId),
        eq(messages.received, true),
        gt(messages.visibilityExpiresAt, now),
      ),
    );

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

// GET /api/dashboard/intake — intake lifecycle counts and attempt list
dashboardRoutes.get("/intake", async (c) => {
  const ownerId = c.get("user").userId;
  const mappingTraceId = c.req.query("mappingTraceId");
  const db = createDb(c.env);

  const rows = await db
    .select()
    .from(intakeAttempts)
    .where(eq(intakeAttempts.ownerId, ownerId));

  const attempts = rows.filter((row) =>
    mappingTraceId ? row.mappingTraceId === mappingTraceId : true,
  );

  const counts = attempts.reduce(
    (summary, attempt) => {
      summary[attempt.status] = (summary[attempt.status] ?? 0) + 1;
      return summary;
    },
    {} as Record<string, number>,
  );

  return c.json({
    status: "success",
    data: {
      counts,
      attempts,
    },
  });
});
