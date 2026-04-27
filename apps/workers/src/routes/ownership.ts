import type { Context } from "hono";
import { eq, inArray } from "drizzle-orm";
import { createDb, type Env } from "../db/client";
import { queues, topicSubscriptions, topics } from "../db/schema";
import type { AuthVariables } from "../middleware/auth";

type AppContext = Context<{
  Bindings: Env;
  Variables: AuthVariables;
}>;

type DbLike = Pick<ReturnType<typeof createDb>, "select">;

type TopicWithSubscriptions = typeof topics.$inferSelect & {
  subscribedQueues: string[];
};

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

async function loadTopicSubscriptionMap(
  db: DbLike,
  topicIds: string[],
): Promise<Map<string, string[]>> {
  if (topicIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select()
    .from(topicSubscriptions)
    .where(inArray(topicSubscriptions.topicId, topicIds));

  const subscriptions = new Map<string, string[]>();
  for (const row of rows) {
    const queueIds = subscriptions.get(row.topicId) ?? [];
    queueIds.push(row.queueId);
    subscriptions.set(row.topicId, queueIds);
  }

  return subscriptions;
}

export async function hydrateTopicsWithSubscriptions(
  db: DbLike,
  topicRows: Array<typeof topics.$inferSelect>,
): Promise<TopicWithSubscriptions[]> {
  const subscriptionsByTopic = await loadTopicSubscriptionMap(
    db,
    topicRows.map((topic) => topic.id),
  );

  return topicRows.map((topic) => ({
    ...topic,
    subscribedQueues: subscriptionsByTopic.get(topic.id) ?? [],
  }));
}

export async function requireOwnedQueue(
  c: AppContext,
  queueId: string,
  messages: Partial<OwnershipMessages> = {},
): Promise<typeof queues.$inferSelect | Response> {
  const db = createDb(c.env);
  const ownerId = c.get("user").userId;
  const resolved = { ...DEFAULT_QUEUE_MESSAGES, ...messages };

  const [queue] = await db.select().from(queues).where(eq(queues.id, queueId)).limit(1);

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
): Promise<TopicWithSubscriptions | Response> {
  const db = createDb(c.env);
  const ownerId = c.get("user").userId;
  const resolved = { ...DEFAULT_TOPIC_MESSAGES, ...messages };

  const [topic] = await db.select().from(topics).where(eq(topics.id, topicId)).limit(1);

  if (!topic) {
    return c.json({ status: "error", message: resolved.notFound }, 404);
  }

  if (topic.ownerId !== ownerId) {
    return c.json({ status: "error", message: resolved.unauthorized }, 403);
  }

  const [hydratedTopic] = await hydrateTopicsWithSubscriptions(db, [topic]);
  if (!hydratedTopic) {
    return c.json({ status: "error", message: resolved.notFound }, 404);
  }

  return hydratedTopic;
}
