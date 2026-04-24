import type { Context } from "hono";
import { eq } from "drizzle-orm";
import { createDb, type Env } from "../db/client";
import { queues, topics } from "../db/schema";

type AuthVariables = {
  user: { userId: string; username: string };
};

type AppContext = Context<{
  Bindings: Env;
  Variables: AuthVariables;
}>;

type OwnershipMessages = {
  notFound: string;
  unauthorized: string;
};

const DEFAULT_QUEUE_MESSAGES: OwnershipMessages = {
  notFound: "Queue not found",
  unauthorized: "Not authorized to access this queue",
};

const DEFAULT_TOPIC_MESSAGES: OwnershipMessages = {
  notFound: "Topic not found",
  unauthorized: "Not authorized to access this topic",
};

export async function requireOwnedQueue(
  c: AppContext,
  queueId: string,
  messages: Partial<OwnershipMessages> = {},
): Promise<typeof queues.$inferSelect | Response> {
  const db = createDb(c.env);
  const ownerId = c.get("user").userId;
  const resolved = { ...DEFAULT_QUEUE_MESSAGES, ...messages };

  const [queue] = await db
    .select()
    .from(queues)
    .where(eq(queues.id, queueId))
    .limit(1);

  if (!queue) {
    return c.json({ status: "error", message: resolved.notFound }, 404);
  }

  if (queue.ownerId !== ownerId) {
    return c.json({ status: "error", message: resolved.unauthorized }, 403);
  }

  return queue;
}

export async function requireOwnedTopic(
  c: AppContext,
  topicId: string,
  messages: Partial<OwnershipMessages> = {},
): Promise<typeof topics.$inferSelect | Response> {
  const db = createDb(c.env);
  const ownerId = c.get("user").userId;
  const resolved = { ...DEFAULT_TOPIC_MESSAGES, ...messages };

  const [topic] = await db
    .select()
    .from(topics)
    .where(eq(topics.id, topicId))
    .limit(1);

  if (!topic) {
    return c.json({ status: "error", message: resolved.notFound }, 404);
  }

  if (topic.ownerId !== ownerId) {
    return c.json({ status: "error", message: resolved.unauthorized }, 403);
  }

  return topic;
}
