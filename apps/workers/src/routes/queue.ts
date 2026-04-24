import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { createDb, type Env } from "../db/client";
import { queues, queueMetrics } from "../db/schema";
import { authenticate } from "../middleware/auth";
import { rateLimiter } from "../middleware/rateLimiter";

type AuthVariables = {
  user: { userId: string; username: string };
};

export const queueRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

queueRoutes.use("*", authenticate);
queueRoutes.use("*", rateLimiter);

// POST /api/queues — create queue
queueRoutes.post("/", async (c) => {
  const body = await c.req.json<{
    name: string;
    retentionPeriod?: number;
    schema?: Record<string, unknown>;
    pushEndpoint?: string;
  }>();

  const { name, retentionPeriod, schema, pushEndpoint } = body;

  if (!name) {
    return c.json({ status: "error", message: "Queue name is required" }, 400);
  }

  const ownerId = c.get("user").userId;
  const db = createDb(c.env);

  const [queue] = await db
    .insert(queues)
    .values({
      name,
      ownerId,
      retentionPeriod: retentionPeriod ?? 14,
      schema: schema ?? null,
      pushEndpoint: pushEndpoint ?? null,
    })
    .returning();

  if (!queue) {
    return c.json({ status: "error", message: "Failed to create queue" }, 500);
  }

  await db.insert(queueMetrics).values({
    queueId: queue.id,
    messageCount: 0,
    messagesSent: 0,
    messagesReceived: 0,
    avgWaitTime: 0,
  });

  return c.json({ status: "success", data: { queue } }, 201);
});

// GET /api/queues — list queues for owner
queueRoutes.get("/", async (c) => {
  const ownerId = c.get("user").userId;
  const nameFilter = c.req.query("name");
  const db = createDb(c.env);

  const conditions = [eq(queues.ownerId, ownerId)];
  if (nameFilter) {
    conditions.push(eq(queues.name, nameFilter));
  }

  const result = await db
    .select()
    .from(queues)
    .where(and(...conditions));

  return c.json({
    status: "success",
    results: result.length,
    data: { queues: result },
  });
});

// GET /api/queues/:id — get single queue
queueRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const ownerId = c.get("user").userId;
  const db = createDb(c.env);

  const [queue] = await db.select().from(queues).where(eq(queues.id, id)).limit(1);

  if (!queue) {
    return c.json({ status: "error", message: `Queue not found with ID: ${id}` }, 404);
  }

  if (queue.ownerId !== ownerId) {
    return c.json(
      {
        status: "error",
        message: "You do not have permission to access this queue",
      },
      403,
    );
  }

  return c.json({ status: "success", data: { queue } });
});

// DELETE /api/queues/:id — delete queue
queueRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const ownerId = c.get("user").userId;
  const db = createDb(c.env);

  const [queue] = await db.select().from(queues).where(eq(queues.id, id)).limit(1);

  if (!queue) {
    return c.json({ status: "error", message: `Queue not found with ID: ${id}` }, 404);
  }

  if (queue.ownerId !== ownerId) {
    return c.json(
      {
        status: "error",
        message: "You do not have permission to delete this queue",
      },
      403,
    );
  }

  await db.delete(queues).where(eq(queues.id, id));

  return c.json({ status: "success", data: null }, 200);
});
