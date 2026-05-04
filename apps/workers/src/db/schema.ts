import {
  pgTable,
  text,
  integer,
  boolean,
  bigserial,
  timestamp,
  jsonb,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { DeliveryTarget, MappingSuggestionBatch } from "@repo/types";

export const MESSAGE_DELIVERY_MODES = ["pull", "push"] as const;
export type MessageDeliveryMode = (typeof MESSAGE_DELIVERY_MODES)[number];

export const MESSAGE_ENQUEUE_STATES = ["not_needed", "pending", "enqueued", "failed"] as const;
export type MessageEnqueueState = (typeof MESSAGE_ENQUEUE_STATES)[number];

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

export const authUsers = pgTable("auth_users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id"),
  },
  (table) => ({
    userIdx: index("auth_sessions_user_idx").on(table.userId),
  }),
);

export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("auth_accounts_user_idx").on(table.userId),
    providerAccountIdx: uniqueIndex("auth_accounts_provider_account_idx").on(
      table.providerId,
      table.accountId,
    ),
  }),
);

export const authVerifications = pgTable(
  "auth_verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    identifierIdx: index("auth_verifications_identifier_idx").on(table.identifier),
  }),
);

export const authOrganizations = pgTable(
  "auth_organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: index("auth_organizations_slug_idx").on(table.slug),
  }),
);

export const authMembers = pgTable(
  "auth_members",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => authOrganizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    organizationIdx: index("auth_members_organization_idx").on(table.organizationId),
    userIdx: index("auth_members_user_idx").on(table.userId),
    organizationUserIdx: uniqueIndex("auth_members_organization_user_idx").on(
      table.organizationId,
      table.userId,
    ),
  }),
);

export const authInvitations = pgTable(
  "auth_invitations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => authOrganizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at").notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    organizationIdx: index("auth_invitations_organization_idx").on(table.organizationId),
    emailIdx: index("auth_invitations_email_idx").on(table.email),
  }),
);

export const authJwks = pgTable("auth_jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
});

export const authDeviceCodes = pgTable(
  "auth_device_codes",
  {
    id: text("id").primaryKey(),
    deviceCode: text("device_code").notNull().unique(),
    userCode: text("user_code").notNull().unique(),
    userId: text("user_id"),
    expiresAt: timestamp("expires_at").notNull(),
    status: text("status").notNull(),
    lastPolledAt: timestamp("last_polled_at"),
    pollingInterval: integer("polling_interval"),
    clientId: text("client_id"),
    scope: text("scope"),
  },
  (table) => ({
    userIdx: index("auth_device_codes_user_idx").on(table.userId),
  }),
);

// ---------------------------------------------------------------------------
// Queues
// ---------------------------------------------------------------------------
export const queues = pgTable(
  "queues",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    retentionPeriod: integer("retention_period").notNull().default(14),
    schema: jsonb("schema"),
    pushEndpoint: text("push_endpoint"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    ownerIdx: index("queues_owner_idx").on(table.ownerId),
  }),
);

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
    queueId: text("queue_id")
      .notNull()
      .references(() => queues.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key"),
    deliveryMode: text("delivery_mode").$type<MessageDeliveryMode>().notNull().default("pull"),
    enqueueState: text("enqueue_state")
      .$type<MessageEnqueueState>()
      .notNull()
      .default("not_needed"),
    pushDeliveredAt: timestamp("push_delivered_at"),
    lastEnqueueError: text("last_enqueue_error"),
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
    pullLeaseIdx: index("messages_pull_lease_idx").on(
      table.queueId,
      table.deliveryMode,
      table.expiresAt,
      table.received,
      table.visibilityExpiresAt,
      table.seq,
    ),
    enqueueStateIdx: index("messages_enqueue_state_idx").on(
      table.deliveryMode,
      table.enqueueState,
      table.createdAt,
    ),
  }),
);

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------
export const topics = pgTable(
  "topics",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    ownerIdx: index("topics_owner_idx").on(table.ownerId),
  }),
);

export const topicSubscriptions = pgTable(
  "topic_subscriptions",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    topicId: text("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    queueId: text("queue_id")
      .notNull()
      .references(() => queues.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    topicQueueUnique: uniqueIndex("topic_subscriptions_topic_queue_idx").on(
      table.topicId,
      table.queueId,
    ),
    topicIdx: index("topic_subscriptions_topic_idx").on(table.topicId),
    queueIdx: index("topic_subscriptions_queue_idx").on(table.queueId),
  }),
);

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
  queueId: text("queue_id")
    .notNull()
    .unique()
    .references(() => queues.id, { onDelete: "cascade" }),
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
export const intakeAttempts = pgTable(
  "intake_attempts",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
  },
  (table) => ({
    ownerCreatedIdx: index("intake_attempts_owner_created_idx").on(table.ownerId, table.createdAt),
    mappingTraceIdx: index("intake_attempts_mapping_trace_idx").on(table.mappingTraceId),
  }),
);

// ---------------------------------------------------------------------------
// Approved Mapping Revisions
// ---------------------------------------------------------------------------
export const approvedMappingRevisions = pgTable(
  "approved_mapping_revisions",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    intakeAttemptId: text("intake_attempt_id")
      .notNull()
      .references(() => intakeAttempts.id, { onDelete: "cascade" }),
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
  },
  (table) => ({
    ownerContractCreatedIdx: index("approved_mapping_revisions_owner_contract_created_idx").on(
      table.ownerId,
      table.contractId,
      table.contractVersion,
      table.createdAt,
    ),
  }),
);
