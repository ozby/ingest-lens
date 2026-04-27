import { lt } from "drizzle-orm";
import { createDb, type Env } from "../db/client";
import { intakeAttempts, messages } from "../db/schema";

/**
 * Scheduled handler that:
 * 1. TTL-purges `reviewPayload` on intake attempts whose
 *    `reviewPayloadExpiresAt` has elapsed.
 * 2. Deletes expired queue messages so Postgres retention matches the API
 *    contract instead of leaving `expiresAt` as metadata only.
 *
 * Clears the column to `null` rather than deleting the attempt row: the
 * attempt history (status, driftCategory, mappingVersionId, telemetry) is
 * still valuable after the review window expires.
 */
export async function handleScheduled(
  _controller: ScheduledController,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  if (!env.HYPERDRIVE && !env.DATABASE_URL) {
    return;
  }

  const db = createDb(env);
  const now = new Date();

  await db
    .update(intakeAttempts)
    .set({ reviewPayload: null })
    .where(lt(intakeAttempts.reviewPayloadExpiresAt, now));

  await db.delete(messages).where(lt(messages.expiresAt, now));
}
