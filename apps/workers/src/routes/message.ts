import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { createDb, type Env } from "../db/client";
import { messages, queueMetrics } from "../db/schema";
import { serializeMessage, serializeMessages } from "./message-response";
import { requireOwnedQueue } from "./ownership";
import { authenticate, type AuthVariables } from "../middleware/auth";
import { rateLimiter } from "../middleware/rateLimiter";
import { createAndDispatchQueueMessage } from "../messages/lifecycle";

const DEFAULT_MAX_MESSAGES = 10;
const DEFAULT_VISIBILITY_TIMEOUT = 30;

type LeaseMessageRow = typeof messages.$inferSelect;
type SnakeLeaseMessageRow = {
  id: string;
  seq: LeaseMessageRow["seq"];
  data: LeaseMessageRow["data"];
  queue_id: string;
  idempotency_key: string | null;
  delivery_mode: LeaseMessageRow["deliveryMode"];
  enqueue_state: LeaseMessageRow["enqueueState"];
  push_delivered_at: Date | null;
  last_enqueue_error: string | null;
  received: boolean;
  received_at: Date | null;
  visibility_expires_at: Date | null;
  expires_at: Date;
  received_count: number;
  created_at: Date;
  updated_at: Date;
};

export const messageRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

messageRoutes.use("*", authenticate);
messageRoutes.use("*", rateLimiter);

async function claimVisibleMessagesAtomically(
  db: ReturnType<typeof createDb>,
  queueId: string,
  now: Date,
  visibilityExpiresAt: Date,
  maxMessages: number,
): Promise<LeaseMessageRow[]> {
  const nowIso = now.toISOString();
  const visibilityExpiresAtIso = visibilityExpiresAt.toISOString();
  const claimedRows = await db.execute(sql`
    WITH claimed AS (
      SELECT id
      FROM messages
      WHERE queue_id = ${queueId}
        AND delivery_mode = 'pull'
        AND expires_at > ${nowIso}
        AND (received = false OR visibility_expires_at <= ${nowIso})
      ORDER BY seq
      LIMIT ${maxMessages}
      FOR UPDATE SKIP LOCKED
    ),
    updated AS (
      UPDATE messages
      SET
        received = true,
        received_at = ${nowIso},
        visibility_expires_at = ${visibilityExpiresAtIso},
        received_count = messages.received_count + 1,
        updated_at = ${nowIso}
      WHERE id IN (SELECT id FROM claimed)
      RETURNING *
    )
    SELECT *
    FROM updated
    ORDER BY seq
  `);

  return (claimedRows as unknown as Array<LeaseMessageRow | SnakeLeaseMessageRow>).map(
    normalizeLeaseMessageRow,
  );
}

function normalizeLeaseMessageRow(row: LeaseMessageRow | SnakeLeaseMessageRow): LeaseMessageRow {
  if ("queueId" in row) {
    return row;
  }

  return {
    id: row.id,
    seq: row.seq,
    data: row.data,
    queueId: row.queue_id,
    idempotencyKey: row.idempotency_key,
    deliveryMode: row.delivery_mode,
    enqueueState: row.enqueue_state,
    pushDeliveredAt: row.push_delivered_at,
    lastEnqueueError: row.last_enqueue_error,
    received: row.received,
    receivedAt: row.received_at,
    visibilityExpiresAt: row.visibility_expires_at,
    expiresAt: row.expires_at,
    receivedCount: row.received_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// POST /api/messages/:queueId — send message
messageRoutes.post("/:queueId", async (c) => {
  const queueId = c.req.param("queueId");
  const body = await c.req.json<{ data: Record<string, unknown> }>();
  const { data } = body;

  if (!data || typeof data !== "object") {
    return c.json({ status: "error", message: "Message data must be an object" }, 400);
  }

  const db = createDb(c.env);

  const queue = await requireOwnedQueue(c, queueId, {}, db);
  if (queue instanceof Response) {
    return queue;
  }

  const idempotencyKey = c.req.header("Idempotency-Key") ?? null;

  const created = await createAndDispatchQueueMessage(c.env, db, queue, data, null, {
    idempotencyKey,
  });
  if (!created) {
    return c.json({ status: "error", message: "Failed to create message" }, 500);
  }

  if (created.duplicate) {
    return c.json({ status: "success", data: { message: serializeMessage(created.message) } }, 200);
  }

  if (created.enqueueError) {
    return c.json(
      {
        status: "error",
        message: created.enqueueError,
        data: { message: serializeMessage(created.message) },
      },
      502,
    );
  }

  return c.json({ status: "success", data: { message: serializeMessage(created.message) } }, 201);
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

  const queue = await requireOwnedQueue(c, queueId, {}, db);
  if (queue instanceof Response) {
    return queue;
  }

  const now = new Date();
  const visibilityExpiresAt = new Date(now.getTime() + clampedVisibilityTimeout * 1000);
  const result = await claimVisibleMessagesAtomically(
    db,
    queueId,
    now,
    visibilityExpiresAt,
    Math.min(maxMessages, 10),
  );

  if (result.length === 0) {
    return c.json({
      status: "success",
      results: 0,
      data: { messages: [], visibilityTimeout: clampedVisibilityTimeout },
    });
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
      messages: serializeMessages(result),
      visibilityTimeout: clampedVisibilityTimeout,
    },
  });
});

// GET /api/messages/:queueId/:messageId — get single message
messageRoutes.get("/:queueId/:messageId", async (c) => {
  const queueId = c.req.param("queueId");
  const messageId = c.req.param("messageId");
  const db = createDb(c.env);

  const queue = await requireOwnedQueue(c, queueId, {}, db);
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

  const queue = await requireOwnedQueue(c, queueId, {}, db);
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

  if (message.deliveryMode !== "pull") {
    return c.json(
      {
        status: "error",
        message: "Push-delivered messages are not acknowledged via the pull API",
      },
      409,
    );
  }

  await db.delete(messages).where(and(eq(messages.id, messageId), eq(messages.queueId, queueId)));

  return c.json({ status: "success", data: { deletedMessageId: messageId } }, 200);
});
