CREATE TABLE IF NOT EXISTS "topic_subscriptions" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "topic_id" text NOT NULL,
  "queue_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "topic_subscriptions_topic_queue_idx"
ON "topic_subscriptions" USING btree ("topic_id", "queue_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topic_subscriptions_topic_idx"
ON "topic_subscriptions" USING btree ("topic_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topic_subscriptions_queue_idx"
ON "topic_subscriptions" USING btree ("queue_id");
--> statement-breakpoint
INSERT INTO "topic_subscriptions" ("topic_id", "queue_id")
SELECT "topics"."id", "subscription"."queue_id"
FROM "topics"
CROSS JOIN LATERAL unnest("topics"."subscribed_queues") AS "subscription"("queue_id")
ON CONFLICT ("topic_id", "queue_id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "topics" DROP COLUMN IF EXISTS "subscribed_queues";
