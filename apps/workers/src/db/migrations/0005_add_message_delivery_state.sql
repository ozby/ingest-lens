ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "delivery_mode" text DEFAULT 'pull' NOT NULL;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "enqueue_state" text DEFAULT 'not_needed' NOT NULL;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "push_delivered_at" timestamp;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "last_enqueue_error" text;
--> statement-breakpoint
UPDATE "messages"
SET
  "delivery_mode" = CASE WHEN EXISTS (
    SELECT 1
    FROM "queues"
    WHERE "queues"."id" = "messages"."queue_id"
      AND "queues"."push_endpoint" IS NOT NULL
  ) THEN 'push' ELSE 'pull' END,
  "enqueue_state" = CASE WHEN EXISTS (
    SELECT 1
    FROM "queues"
    WHERE "queues"."id" = "messages"."queue_id"
      AND "queues"."push_endpoint" IS NOT NULL
  ) THEN 'enqueued' ELSE 'not_needed' END
WHERE "delivery_mode" = 'pull' AND "enqueue_state" = 'not_needed';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "queues_owner_idx" ON "queues" USING btree ("owner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topics_owner_idx" ON "topics" USING btree ("owner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_pull_lease_idx" ON "messages" USING btree (
  "queue_id",
  "delivery_mode",
  "expires_at",
  "received",
  "visibility_expires_at",
  "seq"
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_enqueue_state_idx" ON "messages" USING btree (
  "delivery_mode",
  "enqueue_state",
  "created_at"
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intake_attempts_owner_created_idx" ON "intake_attempts" USING btree (
  "owner_id",
  "created_at"
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intake_attempts_mapping_trace_idx" ON "intake_attempts" USING btree (
  "mapping_trace_id"
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approved_mapping_revisions_owner_contract_created_idx"
ON "approved_mapping_revisions" USING btree (
  "owner_id",
  "contract_id",
  "contract_version",
  "created_at"
);
