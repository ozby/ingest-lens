import { lt } from "drizzle-orm";
import { createDb, type Env } from "../db/client";
import { intakeAttempts } from "../db/schema";

/**
 * Scheduled handler that TTL-purges `reviewPayload` on intake attempts whose
 * `reviewPayloadExpiresAt` has elapsed. Reads are already guarded by
 * `getAttemptPayload`, but the raw payload stays on disk until this purge
 * clears it — so the stored payload does not outlive its configured TTL.
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
}
