-- Add CHECK constraints for status enums to enforce valid values at the DB level.
-- These mirror the TypeScript discriminated union types that previously had no DB-level enforcement.

ALTER TABLE intake_attempts
  ADD COLUMN IF NOT EXISTS _status_check_placeholder text;

-- intake_attempts.status: must be one of the known attempt statuses
ALTER TABLE intake_attempts
  ADD CONSTRAINT intake_attempts_status_check
  CHECK (status IN ('pending_review', 'approved', 'rejected', 'abstained', 'ingested', 'ingest_failed', 'invalid_output', 'runtime_failure'));

-- intake_attempts.ingest_status: must be one of the known ingest statuses
ALTER TABLE intake_attempts
  ADD CONSTRAINT intake_attempts_ingest_status_check
  CHECK (ingest_status IN ('not_started', 'pending', 'enqueued', 'ingested', 'failed'));

-- messages.delivery_mode: must be push or pull
ALTER TABLE messages
  ADD CONSTRAINT messages_delivery_mode_check
  CHECK (delivery_mode IN ('push', 'pull'));

-- messages.enqueue_state: must be one of the known enqueue states
ALTER TABLE messages
  ADD CONSTRAINT messages_enqueue_state_check
  CHECK (enqueue_state IN ('not_needed', 'pending', 'enqueued', 'failed'));

-- intake_attempts.source_kind: must be one of the known source kinds
ALTER TABLE intake_attempts
  ADD CONSTRAINT intake_attempts_source_kind_check
  CHECK (source_kind IN ('ats_fixture', 'ats_live', 'webhook', 'manual_upload'));

-- users: password max length to prevent PBKDF2 DoS
ALTER TABLE users
  ADD CONSTRAINT users_password_max_length_check
  CHECK (length(password) <= 1024);

-- Drop placeholder column if it was created
ALTER TABLE intake_attempts
  DROP COLUMN IF EXISTS _status_check_placeholder;