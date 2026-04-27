DELETE FROM "approved_mapping_revisions"
WHERE "intake_attempt_id" NOT IN (
  SELECT "id" FROM "intake_attempts"
);
--> statement-breakpoint
DELETE FROM "queue_metrics"
WHERE "queue_id" NOT IN (
  SELECT "id" FROM "queues"
);
--> statement-breakpoint
DELETE FROM "topic_subscriptions"
WHERE "topic_id" NOT IN (
    SELECT "id" FROM "topics"
  )
  OR "queue_id" NOT IN (
    SELECT "id" FROM "queues"
  );
--> statement-breakpoint
DELETE FROM "messages"
WHERE "queue_id" NOT IN (
  SELECT "id" FROM "queues"
);
--> statement-breakpoint
ALTER TABLE "messages"
ADD CONSTRAINT "messages_queue_id_queues_id_fk"
FOREIGN KEY ("queue_id") REFERENCES "queues"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "topic_subscriptions"
ADD CONSTRAINT "topic_subscriptions_topic_id_topics_id_fk"
FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "topic_subscriptions"
ADD CONSTRAINT "topic_subscriptions_queue_id_queues_id_fk"
FOREIGN KEY ("queue_id") REFERENCES "queues"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "queue_metrics"
ADD CONSTRAINT "queue_metrics_queue_id_queues_id_fk"
FOREIGN KEY ("queue_id") REFERENCES "queues"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "approved_mapping_revisions"
ADD CONSTRAINT "approved_mapping_revisions_intake_attempt_id_intake_attempts_id_fk"
FOREIGN KEY ("intake_attempt_id") REFERENCES "intake_attempts"("id") ON DELETE cascade;
