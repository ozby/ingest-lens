CREATE TABLE IF NOT EXISTS "intake_attempts" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" text NOT NULL,
  "mapping_trace_id" text NOT NULL,
  "contract_id" text NOT NULL,
  "contract_version" text NOT NULL,
  "mapping_version_id" text,
  "source_system" text NOT NULL,
  "source_kind" text NOT NULL,
  "source_fixture_id" text,
  "source_hash" text NOT NULL,
  "delivery_target" jsonb NOT NULL,
  "status" text NOT NULL,
  "ingest_status" text NOT NULL,
  "drift_category" text NOT NULL,
  "model_name" text NOT NULL,
  "prompt_version" text NOT NULL,
  "overall_confidence" real DEFAULT 0 NOT NULL,
  "redacted_summary" text NOT NULL,
  "validation_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "suggestion_batch" jsonb,
  "review_payload" jsonb,
  "review_payload_expires_at" timestamp,
  "rejection_reason" text,
  "ingest_error" text,
  "approved_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "approved_mapping_revisions" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" text NOT NULL,
  "intake_attempt_id" text NOT NULL,
  "mapping_trace_id" text NOT NULL,
  "contract_id" text NOT NULL,
  "contract_version" text NOT NULL,
  "target_record_type" text NOT NULL,
  "approved_suggestion_ids" text[] DEFAULT '{}'::text[] NOT NULL,
  "source_hash" text NOT NULL,
  "source_kind" text NOT NULL,
  "source_fixture_id" text,
  "delivery_target" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
