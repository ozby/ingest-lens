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
import type { DeliveryTarget, MappingSuggestionBatch } from "@repo/types";

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

// ---------------------------------------------------------------------------
// Intake Attempts
// ---------------------------------------------------------------------------
export const intakeAttempts = pgTable("intake_attempts", {
  id: text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  ownerId: text("owner_id").notNull(),
  mappingTraceId: text("mapping_trace_id").notNull(),
  contractId: text("contract_id").notNull(),
  contractVersion: text("contract_version").notNull(),
  mappingVersionId: text("mapping_version_id"),
  sourceSystem: text("source_system").notNull(),
  sourceKind: text("source_kind").notNull(),
  sourceFixtureId: text("source_fixture_id"),
  sourceHash: text("source_hash").notNull(),
  deliveryTarget: jsonb("delivery_target").$type<DeliveryTarget>().notNull(),
  status: text("status").notNull(),
  ingestStatus: text("ingest_status").notNull(),
  driftCategory: text("drift_category").notNull(),
  modelName: text("model_name").notNull(),
  promptVersion: text("prompt_version").notNull(),
  overallConfidence: real("overall_confidence").notNull().default(0),
  redactedSummary: text("redacted_summary").notNull(),
  validationErrors: jsonb("validation_errors")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  suggestionBatch: jsonb("suggestion_batch").$type<MappingSuggestionBatch>(),
  reviewPayload: jsonb("review_payload"),
  reviewPayloadExpiresAt: timestamp("review_payload_expires_at"),
  rejectionReason: text("rejection_reason"),
  ingestError: text("ingest_error"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Approved Mapping Revisions
// ---------------------------------------------------------------------------
export const approvedMappingRevisions = pgTable("approved_mapping_revisions", {
  id: text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  ownerId: text("owner_id").notNull(),
  intakeAttemptId: text("intake_attempt_id").notNull(),
  mappingTraceId: text("mapping_trace_id").notNull(),
  contractId: text("contract_id").notNull(),
  contractVersion: text("contract_version").notNull(),
  targetRecordType: text("target_record_type").notNull(),
  approvedSuggestionIds: text("approved_suggestion_ids")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  sourceHash: text("source_hash").notNull(),
  sourceKind: text("source_kind").notNull(),
  sourceFixtureId: text("source_fixture_id"),
  deliveryTarget: jsonb("delivery_target").$type<DeliveryTarget>().notNull(),
  shapeFingerprint: text("shape_fingerprint"),
  healedAt: timestamp("healed_at"),
  rolledBackFrom: text("rolled_back_from"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
