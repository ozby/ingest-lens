import { eq } from "drizzle-orm";
import { intakeAttempts } from "../../db/schema";
import { createDb, type Env } from "../../db/client";

type AttemptRow = typeof intakeAttempts.$inferSelect;

export async function loadAttemptForOwner(
  env: Env,
  ownerId: string,
  attemptId: string,
): Promise<AttemptRow | null> {
  const db = createDb(env);
  const [row] = await db
    .select()
    .from(intakeAttempts)
    .where(eq(intakeAttempts.id, attemptId))
    .limit(1);

  if (!row || row.ownerId !== ownerId) {
    return null;
  }

  return row;
}
