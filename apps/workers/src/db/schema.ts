import {
  pgTable,
  text,
  integer,
  boolean,
  bigserial,
  timestamp,
  jsonb,
  real,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Queues
// ---------------------------------------------------------------------------
export const queues = pgTable("queues", {
  id: text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  ownerId: text("owner_id").notNull(),
  retentionPeriod: integer("retention_period").notNull().default(14),
  schema: jsonb("schema"),
  pushEndpoint: text("push_endpoint"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
export const messages = pgTable(
  "messages",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    seq: bigserial("seq", { mode: "bigint" }).notNull(),
    data: jsonb("data").notNull(),
    queueId: text("queue_id").notNull(),
    idempotencyKey: text("idempotency_key"),
    received: boolean("received").notNull().default(false),
    receivedAt: timestamp("received_at"),
    visibilityExpiresAt: timestamp("visibility_expires_at"),
    expiresAt: timestamp("expires_at").notNull(),
    receivedCount: integer("received_count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    queueIdempotencyUnique: uniqueIndex("messages_queue_idempotency_idx").on(
      table.queueId,
      table.idempotencyKey,
    ),
  }),
);

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------
export const topics = pgTable("topics", {
  id: text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  ownerId: text("owner_id").notNull(),
  subscribedQueues: text("subscribed_queues")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Server Metrics
// ---------------------------------------------------------------------------
export const serverMetrics = pgTable("server_metrics", {
  id: text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  startTime: timestamp("start_time").defaultNow().notNull(),
  totalRequests: integer("total_requests").notNull().default(0),
  activeConnections: integer("active_connections").notNull().default(0),
  messagesProcessed: integer("messages_processed").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  avgResponseTime: real("avg_response_time").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Queue Metrics
// ---------------------------------------------------------------------------
export const queueMetrics = pgTable("queue_metrics", {
  id: text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  queueId: text("queue_id").notNull().unique(),
  messageCount: integer("message_count").notNull().default(0),
  messagesSent: integer("messages_sent").notNull().default(0),
  messagesReceived: integer("messages_received").notNull().default(0),
  avgWaitTime: real("avg_wait_time").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
