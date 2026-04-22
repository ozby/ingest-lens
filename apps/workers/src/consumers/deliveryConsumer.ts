import { eq } from "drizzle-orm";
import { createDb, type DeliveryPayload, type Env } from "../db/client";
import { messages } from "../db/schema";

const BACKOFF_SECONDS = [5, 10, 20, 40, 80];

export async function handleDeliveryBatch(
  batch: MessageBatch<DeliveryPayload>,
  env: Env,
): Promise<void> {
  const db = createDb(env);

  for (const msg of batch.messages) {
    const { messageId, pushEndpoint, attempt } = msg.body;

    const [row] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);

    if (!row) {
      msg.ack();
      continue;
    }

    try {
      const res = await fetch(pushEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row),
      });

      if (res.ok) {
        msg.ack();
      } else {
        const delaySeconds = BACKOFF_SECONDS[Math.min(attempt, BACKOFF_SECONDS.length - 1)];
        msg.retry({ delaySeconds });
      }
    } catch {
      const delaySeconds = BACKOFF_SECONDS[Math.min(attempt, BACKOFF_SECONDS.length - 1)];
      msg.retry({ delaySeconds });
    }
  }
}
