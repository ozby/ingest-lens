-- Migration: 0001_create_lab_schema
-- Creates the lab.* schema and all five tables.
-- Idempotent: uses IF NOT EXISTS throughout.
-- Apply with: psql $DATABASE_URL -f migrations/0001_create_lab_schema.sql
-- Role: must be run as a superuser or role with CREATE SCHEMA privilege.

CREATE SCHEMA IF NOT EXISTS lab;

-- lab.sessions
CREATE TABLE IF NOT EXISTS lab.sessions (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  meta        JSONB
);

-- lab.runs
CREATE TABLE IF NOT EXISTS lab.runs (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     TEXT NOT NULL,
  path_id        TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'running',
  delivered_count INTEGER NOT NULL DEFAULT 0,
  inversion_count INTEGER NOT NULL DEFAULT 0,
  duration_ms    INTEGER,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ
);

-- lab.events_archive (append-only; 7-day retention)
CREATE TABLE IF NOT EXISTS lab.events_archive (
  id         BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  session_id TEXT NOT NULL,
  event_id   TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  payload    JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, event_id)
);

-- lab.heartbeat
CREATE TABLE IF NOT EXISTS lab.heartbeat (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  active_session_count INTEGER NOT NULL DEFAULT 0,
  gauge_capacity       INTEGER NOT NULL DEFAULT 100,
  checked_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- lab.heartbeat_audit (admin-bypass audit; consumed by Lane E Task 5.7 — F-06)
CREATE TABLE IF NOT EXISTS lab.heartbeat_audit (
  id              BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  action          TEXT NOT NULL,
  actor_id        TEXT,
  details         JSONB,
  is_admin_bypass BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Retention policy: events older than 7 days can be deleted by a scheduled job.
-- Example cron (run daily):
--   DELETE FROM lab.events_archive WHERE created_at < NOW() - INTERVAL '7 days';
