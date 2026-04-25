/**
 * Drizzle schema for the lab.* Postgres schema.
 *
 * All tables live in the "lab" schema — never "public" (F-12).
 * Connection helper applies SET search_path TO lab on each connection.
 */
import { pgSchema, text, integer, bigint, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const labSchema = pgSchema("lab");

// ---------------------------------------------------------------------------
// lab.sessions
// ---------------------------------------------------------------------------
export const sessions = labSchema.table("sessions", {
  id: text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  scenarioId: text("scenario_id").notNull(),
  status: text("status").notNull().default("active"), // active | completed | failed
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  meta: jsonb("meta"),
});

// ---------------------------------------------------------------------------
// lab.runs
// ---------------------------------------------------------------------------
export const runs = labSchema.table("runs", {
  id: text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  sessionId: text("session_id").notNull(),
  pathId: text("path_id").notNull(),
  status: text("status").notNull().default("running"), // running | completed | failed
  deliveredCount: integer("delivered_count").notNull().default(0),
  inversionCount: integer("inversion_count").notNull().default(0),
  durationMs: integer("duration_ms"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// ---------------------------------------------------------------------------
// lab.events_archive  (append-only; 7-day retention; keyed by sessionId + eventId)
// ---------------------------------------------------------------------------
export const eventsArchive = labSchema.table("events_archive", {
  id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(),
  sessionId: text("session_id").notNull(),
  eventId: text("event_id").notNull(),
  seq: integer("seq").notNull(), // monotonic per-session
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// lab.heartbeat
// ---------------------------------------------------------------------------
export const heartbeat = labSchema.table("heartbeat", {
  id: text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  activeSessionCount: integer("active_session_count").notNull().default(0),
  gaugeCapacity: integer("gauge_capacity").notNull().default(100),
  checkedAt: timestamp("checked_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// lab.heartbeat_audit  (admin-bypass audit rows; consumed by Lane E Task 5.7 — F-06)
// ---------------------------------------------------------------------------
export const heartbeatAudit = labSchema.table("heartbeat_audit", {
  id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(),
  action: text("action").notNull(), // e.g. "kill_switch_flip", "admin_bypass"
  actorId: text("actor_id"),
  details: jsonb("details"),
  isAdminBypass: boolean("is_admin_bypass").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
