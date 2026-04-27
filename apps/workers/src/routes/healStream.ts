import { Hono, type Context } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { approvedMappingRevisions, intakeAttempts } from "../db/schema";
import { createDb, type Env } from "../db/client";
import { authenticate, type AuthVariables } from "../middleware/auth";

type AppContext = Context<{
  Bindings: Env;
  Variables: AuthVariables;
}>;

type RollbackContext =
  | { error: Response }
  | {
      current: typeof approvedMappingRevisions.$inferSelect;
      previous: typeof approvedMappingRevisions.$inferSelect;
      suggestions: NonNullable<
        NonNullable<(typeof intakeAttempts.$inferSelect)["suggestionBatch"]>["suggestions"]
      >;
    };

async function loadRollbackContext(
  c: AppContext,
  contractId: string,
  contractVersion: string,
  ownerId: string,
): Promise<RollbackContext> {
  const db = createDb(c.env);
  const revisions = await db
    .select()
    .from(approvedMappingRevisions)
    .where(
      and(
        eq(approvedMappingRevisions.contractId, contractId),
        eq(approvedMappingRevisions.contractVersion, contractVersion),
        eq(approvedMappingRevisions.ownerId, ownerId),
      ),
    )
    .orderBy(desc(approvedMappingRevisions.createdAt))
    .limit(2);

  const [current, previous] = revisions;
  if (!current) {
    return {
      error: c.json(
        { status: "error", message: "No approved revision found for this source." },
        404,
      ),
    };
  }
  if (!previous) {
    return {
      error: c.json({ status: "error", message: "No previous revision to roll back to." }, 409),
    };
  }

  const [previousAttempt] = await db
    .select()
    .from(intakeAttempts)
    .where(
      and(eq(intakeAttempts.id, previous.intakeAttemptId), eq(intakeAttempts.ownerId, ownerId)),
    )
    .limit(1);

  const suggestions = previousAttempt?.suggestionBatch?.suggestions?.filter((suggestion) =>
    previous.approvedSuggestionIds.includes(suggestion.id),
  );
  if (!suggestions || suggestions.length === 0) {
    return {
      error: c.json(
        {
          status: "error",
          message: "Previous approved suggestions are unavailable for rollback.",
        },
        409,
      ),
    };
  }

  return { current, previous, suggestions };
}

export const healStreamRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

healStreamRoutes.use("*", authenticate);

/**
 * GET /api/heal/stream/:sourceSystem/:contractId/:contractVersion
 *
 * Subscribe to heal events for a source combo via SSE.
 * Delegates to HealStreamDO /subscribe.
 */
healStreamRoutes.get("/stream/:sourceSystem/:contractId/:contractVersion", async (c) => {
  const { sourceSystem, contractId, contractVersion } = c.req.param();
  const doName = `${sourceSystem}:${contractId}:${contractVersion}`;

  const doId = c.env.HEAL_STREAM.idFromName(doName);
  const stub = c.env.HEAL_STREAM.get(doId);

  const response = await stub.fetch(
    new Request("https://do-internal/subscribe", { method: "GET" }),
  );

  return response;
});

/**
 * PATCH /api/heal/stream/:sourceSystem/:contractId/:contractVersion/rollback
 *
 * Operator-facing revert endpoint. Finds the current and previous
 * approvedMappingRevision for this source combo from Neon, then calls
 * HealStreamDO /rollback.
 *
 * Returns 200 { status: "ok", rolledBackTo: previousRevision.id }
 */
healStreamRoutes.patch("/stream/:sourceSystem/:contractId/:contractVersion/rollback", async (c) => {
  const { sourceSystem, contractId, contractVersion } = c.req.param();
  const ownerId = c.get("user").userId;
  const rollbackContext = await loadRollbackContext(c, contractId, contractVersion, ownerId);
  if ("error" in rollbackContext) {
    return rollbackContext.error;
  }
  const { current, previous, suggestions } = rollbackContext;

  const doName = `${sourceSystem}:${contractId}:${contractVersion}`;
  const doId = c.env.HEAL_STREAM.idFromName(doName);
  const stub = c.env.HEAL_STREAM.get(doId);

  const rollbackRes = await stub.fetch(
    new Request("https://do-internal/rollback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentRevisionId: current.id,
        previousRevision: {
          id: previous.id,
          ownerId,
          intakeAttemptId: previous.intakeAttemptId,
          mappingTraceId: previous.mappingTraceId,
          contractId: previous.contractId,
          contractVersion: previous.contractVersion,
          targetRecordType: previous.targetRecordType,
          approvedSuggestionIds: previous.approvedSuggestionIds,
          sourceHash: previous.sourceHash,
          sourceKind: previous.sourceKind,
          sourceFixtureId: previous.sourceFixtureId ?? null,
          deliveryTarget: previous.deliveryTarget,
          shapeFingerprint: previous.shapeFingerprint ?? null,
          suggestions,
        },
      }),
    }),
  );

  if (!rollbackRes.ok) {
    return c.json({ status: "error", message: "Rollback failed in DO." }, 500);
  }

  return c.json({ status: "ok", rolledBackTo: previous.id });
});
