import { Hono, type Context } from "hono";
import { eq, inArray } from "drizzle-orm";
import type {
  ApprovedMappingRevision,
  CreateIntakeSuggestionRequest,
  IntakeAttemptRecord,
  MappingSuggestion,
  RejectIntakeSuggestionRequest,
} from "@repo/types";
import { approvedMappingRevisions, intakeAttempts, messages, queues } from "../db/schema";
import { createDb, type Env } from "../db/client";
import { authenticate } from "../middleware/auth";
import { rateLimiter } from "../middleware/rateLimiter";
import { DEFAULT_MAPPING_PROMPT_VERSION, suggestMappings } from "../intake/aiMappingAdapter";
import { validateIntakeRequest, defaultHashPayload } from "../intake/validateIntakeRequest";
import { createNormalizedEnvelope } from "../intake/normalizedEnvelope";
import { normalizeWithMapping } from "../intake/normalizeWithMapping";
import { recordIntakeLifecycle } from "../telemetry";
import { requireOwnedQueue, requireOwnedTopic } from "./ownership";
import { getFixtureReference } from "../intake/contracts";
import { getDemoFixtureById, listDemoFixtures } from "../intake/demoFixtures";

type AuthVariables = {
  user: { userId: string; username: string };
};

type AppContext = Context<{
  Bindings: Env;
  Variables: AuthVariables;
}>;

type AttemptRow = typeof intakeAttempts.$inferSelect;
type MappingVersionRow = typeof approvedMappingRevisions.$inferSelect;

export const intakeRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

intakeRoutes.use("*", authenticate);
intakeRoutes.use("*", rateLimiter);

function toAttemptRecord(row: AttemptRow): IntakeAttemptRecord {
  return {
    intakeAttemptId: row.id,
    mappingTraceId: row.mappingTraceId,
    contractId: row.contractId,
    contractVersion: row.contractVersion,
    mappingVersionId: row.mappingVersionId ?? undefined,
    sourceSystem: row.sourceSystem,
    sourceKind: row.sourceKind as IntakeAttemptRecord["sourceKind"],
    sourceFixtureId: row.sourceFixtureId ?? undefined,
    sourceHash: row.sourceHash,
    reviewPayloadExpiresAt: row.reviewPayloadExpiresAt?.toISOString(),
    deliveryTarget: row.deliveryTarget,
    status: row.status as IntakeAttemptRecord["status"],
    ingestStatus: row.ingestStatus as IntakeAttemptRecord["ingestStatus"],
    driftCategory: row.driftCategory as IntakeAttemptRecord["driftCategory"],
    modelName: row.modelName,
    promptVersion: row.promptVersion,
    overallConfidence: row.overallConfidence,
    redactedSummary: row.redactedSummary,
    validationErrors: row.validationErrors,
    suggestionBatch: row.suggestionBatch ?? undefined,
    rejectionReason: row.rejectionReason ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    approvedAt: row.approvedAt?.toISOString(),
  };
}

function toMappingRevision(row: MappingVersionRow): ApprovedMappingRevision {
  return {
    mappingVersionId: row.id,
    intakeAttemptId: row.intakeAttemptId,
    mappingTraceId: row.mappingTraceId,
    contractId: row.contractId,
    contractVersion: row.contractVersion,
    targetRecordType: row.targetRecordType,
    approvedSuggestionIds: row.approvedSuggestionIds,
    sourceHash: row.sourceHash,
    sourceKind: row.sourceKind as ApprovedMappingRevision["sourceKind"],
    sourceFixtureId: row.sourceFixtureId ?? undefined,
    deliveryTarget: row.deliveryTarget,
    createdAt: row.createdAt.toISOString(),
  };
}

function createId(): string {
  return crypto.randomUUID();
}

function getDeliveryTargetInfo(deliveryTarget: { queueId?: string; topicId?: string }): {
  deliveryTargetId: string;
  deliveryTargetKind: "queue" | "topic";
} {
  if (deliveryTarget.queueId) {
    return {
      deliveryTargetId: deliveryTarget.queueId,
      deliveryTargetKind: "queue",
    };
  }

  return {
    deliveryTargetId: deliveryTarget.topicId ?? "unknown-target",
    deliveryTargetKind: "topic",
  };
}

async function publishToTarget(
  c: AppContext,
  envelope: Record<string, unknown>,
  deliveryTarget: { queueId?: string; topicId?: string },
): Promise<void> {
  const db = createDb(c.env);

  if (deliveryTarget.queueId) {
    const queue = await requireOwnedQueue(c, deliveryTarget.queueId, {
      unauthorized: "Not authorized to approve this queue target",
    });
    if (queue instanceof Response) {
      throw new Error("Queue target is unavailable for approval.");
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + queue.retentionPeriod);

    const [message] = await db
      .insert(messages)
      .values({
        data: envelope,
        queueId: queue.id,
        expiresAt,
        received: false,
        receivedCount: 0,
      })
      .returning();

    if (!message) {
      throw new Error("Failed to insert message into queue target.");
    }

    if (queue.pushEndpoint) {
      await c.env.DELIVERY_QUEUE.send({
        messageId: message.id,
        seq: String(message.seq),
        queueId: queue.id,
        pushEndpoint: queue.pushEndpoint,
        topicId: null,
        attempt: 0,
      });
    }

    return;
  }

  const topicId = deliveryTarget.topicId;
  if (!topicId) {
    throw new Error("Delivery target is missing.");
  }

  const topic = await requireOwnedTopic(c, topicId, {
    unauthorized: "Not authorized to approve this topic target",
  });
  if (topic instanceof Response) {
    throw new Error("Topic target is unavailable for approval.");
  }

  if (topic.subscribedQueues.length === 0) {
    throw new Error("Topic has no subscribed queues.");
  }

  const subscribedQueues = await db
    .select()
    .from(queues)
    .where(inArray(queues.id, topic.subscribedQueues));

  // Outbox-style: persist all fan-out messages atomically inside the
  // transaction, then emit DELIVERY_QUEUE.send calls AFTER commit. If any
  // INSERT fails the entire batch rolls back and no queue sends are emitted,
  // so subscribers never observe a partial fan-out.
  const pendingSends = await db.transaction(async (tx) => {
    const batched: Array<{
      messageId: string;
      seq: string;
      queueId: string;
      pushEndpoint: string;
      topicId: string;
      attempt: number;
    }> = [];

    for (const queue of subscribedQueues) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + queue.retentionPeriod);

      const [message] = await tx
        .insert(messages)
        .values({
          data: envelope,
          queueId: queue.id,
          expiresAt,
          received: false,
          receivedCount: 0,
        })
        .returning();

      if (!message) {
        throw new Error("Failed to insert message into topic fan-out target.");
      }

      if (queue.pushEndpoint) {
        batched.push({
          messageId: message.id,
          seq: String(message.seq),
          queueId: queue.id,
          pushEndpoint: queue.pushEndpoint,
          topicId,
          attempt: 0,
        });
      }
    }

    return batched;
  });

  for (const payload of pendingSends) {
    await c.env.DELIVERY_QUEUE.send(payload);
  }
}

function selectApprovedSuggestions(
  suggestions: readonly MappingSuggestion[],
  approvedSuggestionIds?: readonly string[],
): MappingSuggestion[] {
  if (!approvedSuggestionIds || approvedSuggestionIds.length === 0) {
    return [...suggestions];
  }

  const approvedSet = new Set(approvedSuggestionIds);
  return suggestions.filter((suggestion) => approvedSet.has(suggestion.id));
}

function getAttemptPayload(attempt: AttemptRow): Record<string, unknown> | null {
  if (attempt.sourceFixtureId) {
    return getFixtureReference(attempt.sourceFixtureId)?.payload ?? null;
  }

  if (attempt.reviewPayloadExpiresAt && attempt.reviewPayloadExpiresAt.getTime() < Date.now()) {
    return null;
  }

  return (attempt.reviewPayload as Record<string, unknown> | null) ?? null;
}

intakeRoutes.get("/public-fixtures", async (c) =>
  c.json({
    status: "success",
    data: {
      fixtures: listDemoFixtures(),
    },
  }),
);

intakeRoutes.get("/public-fixtures/:fixtureId", async (c) => {
  const fixture = getDemoFixtureById(c.req.param("fixtureId"));

  if (!fixture) {
    return c.json({ status: "error", message: "Fixture not found" }, 404);
  }

  return c.json({
    status: "success",
    data: {
      fixture,
    },
  });
});

intakeRoutes.get("/mapping-suggestions", async (c) => {
  const ownerId = c.get("user").userId;
  const statusFilter = c.req.query("status");
  const db = createDb(c.env);

  const rows = await db.select().from(intakeAttempts).where(eq(intakeAttempts.ownerId, ownerId));

  const filtered = rows.filter((row) => (statusFilter ? row.status === statusFilter : true));

  return c.json({
    status: "success",
    results: filtered.length,
    data: { attempts: filtered.map(toAttemptRecord) },
  });
});

intakeRoutes.post("/mapping-suggestions", async (c) => {
  const ownerId = c.get("user").userId;
  const body = await c.req.json<CreateIntakeSuggestionRequest>();
  const validation = validateIntakeRequest(body, {
    clock: () => new Date(),
    hashPayload: defaultHashPayload,
    idGenerator: createId,
  });

  if (!validation.ok) {
    return c.json(
      {
        status: "error",
        message: "Invalid intake request",
        errors: validation.errors,
      },
      400,
    );
  }

  const mapped = await suggestMappings(
    {
      payload: validation.value.payload,
      sourceSystem: validation.value.sourceSystem,
      contractId: validation.value.contract.id,
      contractVersion: validation.value.contract.version,
      promptVersion: DEFAULT_MAPPING_PROMPT_VERSION,
      targetFields: validation.value.contract.targetFields,
    },
    {
      env: c.env,
    },
  );

  const now = new Date();
  const attemptId = createId();
  const mappingTraceId = mapped.kind === "success" ? mapped.batch.mappingTraceId : createId();
  const driftCategory =
    mapped.kind === "success"
      ? (mapped.batch.driftCategories[0] ?? "renamed_field")
      : "ambiguous_mapping";
  const validationErrors = mapped.kind === "invalid_output" ? mapped.errors : [];

  const db = createDb(c.env);
  const [row] = await db
    .insert(intakeAttempts)
    .values({
      id: attemptId,
      ownerId,
      mappingTraceId,
      contractId: validation.value.contract.id,
      contractVersion: validation.value.contract.version,
      sourceSystem: validation.value.sourceSystem,
      sourceKind: validation.value.sourceKind,
      sourceFixtureId: validation.value.sourceFixture?.id,
      sourceHash: validation.value.sourceHash,
      deliveryTarget: validation.value.deliveryTarget,
      status:
        mapped.kind === "success"
          ? "pending_review"
          : mapped.kind === "abstain"
            ? "abstained"
            : mapped.kind === "invalid_output"
              ? "invalid_output"
              : "runtime_failure",
      ingestStatus: "not_started",
      driftCategory,
      modelName: mapped.decisionLog.model,
      promptVersion: mapped.decisionLog.promptVersion,
      overallConfidence: mapped.decisionLog.confidence.overall,
      redactedSummary: validation.value.redactedSummary,
      validationErrors,
      suggestionBatch: mapped.kind === "success" ? mapped.batch : null,
      reviewPayload: validation.value.reviewPayload,
      reviewPayloadExpiresAt: validation.value.reviewPayloadExpiresAt
        ? new Date(validation.value.reviewPayloadExpiresAt)
        : null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) {
    return c.json({ status: "error", message: "Failed to record intake attempt" }, 500);
  }

  const attempt = toAttemptRecord(row);
  const deliveryTargetInfo = getDeliveryTargetInfo(attempt.deliveryTarget);
  recordIntakeLifecycle(c.env, {
    contractId: attempt.contractId,
    deliveryTargetId: deliveryTargetInfo.deliveryTargetId,
    deliveryTargetKind: deliveryTargetInfo.deliveryTargetKind,
    driftCategory: attempt.driftCategory,
    event: "suggestion.created",
    ingestStatus: attempt.ingestStatus,
    mappingTraceId: attempt.mappingTraceId,
    modelName: attempt.modelName,
    overallConfidence: attempt.overallConfidence,
    promptVersion: attempt.promptVersion,
    sourceKind: attempt.sourceKind,
    sourceSystem: attempt.sourceSystem,
    status: attempt.status,
    validationErrorCount: attempt.validationErrors.length,
  });

  return c.json({ status: "success", data: { attempt } }, 201);
});

intakeRoutes.post("/mapping-suggestions/:id/reject", async (c) => {
  const ownerId = c.get("user").userId;
  const attemptId = c.req.param("id");
  const body = await c.req.json<RejectIntakeSuggestionRequest>();
  const db = createDb(c.env);

  const [existing] = await db
    .select()
    .from(intakeAttempts)
    .where(eq(intakeAttempts.id, attemptId))
    .limit(1);

  if (!existing || existing.ownerId !== ownerId) {
    return c.json({ status: "error", message: "Attempt not found" }, 404);
  }

  if (existing.status === "rejected") {
    return c.json({
      status: "success",
      data: { attempt: toAttemptRecord(existing) },
    });
  }

  if (existing.status === "approved" || existing.status === "ingested") {
    return c.json({ status: "error", message: "Approved attempts cannot be rejected." }, 409);
  }

  const [updated] = await db
    .update(intakeAttempts)
    .set({
      status: "rejected",
      rejectionReason: body.reason,
      updatedAt: new Date(),
    })
    .where(eq(intakeAttempts.id, attemptId))
    .returning();

  if (!updated) {
    return c.json({ status: "error", message: "Intake attempt not found" }, 404);
  }

  return c.json({ status: "success", data: { attempt: toAttemptRecord(updated) } });
});

intakeRoutes.post("/mapping-suggestions/:id/approve", async (c) => {
  const ownerId = c.get("user").userId;
  const attemptId = c.req.param("id");
  const body = await c.req.json<{ approvedSuggestionIds?: string[] }>();
  const db = createDb(c.env);

  const [attemptRow] = await db
    .select()
    .from(intakeAttempts)
    .where(eq(intakeAttempts.id, attemptId))
    .limit(1);

  if (!attemptRow || attemptRow.ownerId !== ownerId) {
    return c.json({ status: "error", message: "Attempt not found" }, 404);
  }

  if (attemptRow.mappingVersionId) {
    const [mappingVersionRow] = await db
      .select()
      .from(approvedMappingRevisions)
      .where(eq(approvedMappingRevisions.id, attemptRow.mappingVersionId))
      .limit(1);

    if (body.approvedSuggestionIds !== undefined && mappingVersionRow) {
      const requested = [...body.approvedSuggestionIds].sort();
      const existing = [...mappingVersionRow.approvedSuggestionIds].sort();
      const differs =
        requested.length !== existing.length ||
        requested.some((id, index) => id !== existing[index]);
      if (differs) {
        return c.json(
          {
            status: "error",
            message: `Attempt ${attemptRow.id} has already been approved with a different suggestion set.`,
          },
          409,
        );
      }
    }

    return c.json({
      status: "success",
      data: {
        attempt: toAttemptRecord(attemptRow),
        mappingVersion: mappingVersionRow ? toMappingRevision(mappingVersionRow) : undefined,
      },
    });
  }

  if (!attemptRow.suggestionBatch) {
    return c.json(
      { status: "error", message: "Attempt does not contain reviewable suggestions." },
      409,
    );
  }

  const payload = getAttemptPayload(attemptRow);
  if (!payload) {
    return c.json(
      { status: "error", message: "Review payload has expired. Re-run the suggestion." },
      410,
    );
  }

  const approvedSuggestions = selectApprovedSuggestions(
    attemptRow.suggestionBatch.suggestions,
    body.approvedSuggestionIds,
  );

  if (approvedSuggestions.length === 0) {
    return c.json(
      { status: "error", message: "At least one approved suggestion is required." },
      400,
    );
  }

  const mappingVersionId = createId();
  const now = new Date();
  const record = normalizeWithMapping({
    payload,
    suggestions: approvedSuggestions,
  });

  const persisted = await db.transaction(async (tx) => {
    const [revision] = await tx
      .insert(approvedMappingRevisions)
      .values({
        id: mappingVersionId,
        ownerId,
        intakeAttemptId: attemptRow.id,
        mappingTraceId: attemptRow.mappingTraceId,
        contractId: attemptRow.contractId,
        contractVersion: attemptRow.contractVersion,
        targetRecordType: attemptRow.contractId.replace(/-v\d+$/, "").replace(/-/g, "_"),
        approvedSuggestionIds: approvedSuggestions.map((suggestion) => suggestion.id),
        sourceHash: attemptRow.sourceHash,
        sourceKind: attemptRow.sourceKind,
        sourceFixtureId: attemptRow.sourceFixtureId,
        deliveryTarget: attemptRow.deliveryTarget,
        createdAt: now,
      })
      .returning();

    const [attempt] = await tx
      .update(intakeAttempts)
      .set({
        status: "approved",
        ingestStatus: "pending",
        mappingVersionId,
        approvedAt: now,
        updatedAt: now,
      })
      .where(eq(intakeAttempts.id, attemptRow.id))
      .returning();

    if (!revision || !attempt) {
      throw new Error("Approval persistence returned no rows; rolling back.");
    }
    return { revision, attempt };
  });

  const mappingVersionRow = persisted.revision;
  const approvedAttemptRow = persisted.attempt;

  const approvedAttempt = toAttemptRecord(approvedAttemptRow);
  const mappingVersion = toMappingRevision(mappingVersionRow);
  const normalizedRecord = createNormalizedEnvelope({
    attempt: approvedAttempt,
    mappingVersion,
    record,
  });

  try {
    await publishToTarget(
      c,
      normalizedRecord as unknown as Record<string, unknown>,
      approvedAttempt.deliveryTarget,
    );
  } catch (error) {
    const [failedAttemptRow] = await db
      .update(intakeAttempts)
      .set({
        status: "ingest_failed",
        ingestStatus: "failed",
        ingestError: error instanceof Error ? error.message : "Publish failed",
        updatedAt: new Date(),
      })
      .where(eq(intakeAttempts.id, attemptRow.id))
      .returning();

    if (!failedAttemptRow) {
      return c.json({ status: "error", message: "Failed to record ingest failure" }, 500);
    }

    const failedAttempt = toAttemptRecord(failedAttemptRow);
    const deliveryTargetInfo = getDeliveryTargetInfo(failedAttempt.deliveryTarget);
    recordIntakeLifecycle(c.env, {
      contractId: failedAttempt.contractId,
      deliveryTargetId: deliveryTargetInfo.deliveryTargetId,
      deliveryTargetKind: deliveryTargetInfo.deliveryTargetKind,
      driftCategory: failedAttempt.driftCategory,
      event: "suggestion.ingest_failed",
      ingestStatus: failedAttempt.ingestStatus,
      mappingTraceId: failedAttempt.mappingTraceId,
      modelName: failedAttempt.modelName,
      overallConfidence: failedAttempt.overallConfidence,
      promptVersion: failedAttempt.promptVersion,
      sourceKind: failedAttempt.sourceKind,
      sourceSystem: failedAttempt.sourceSystem,
      status: failedAttempt.status,
      validationErrorCount: failedAttempt.validationErrors.length,
    });

    return c.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Publish failed",
        data: {
          attempt: failedAttempt,
          mappingVersion,
          normalizedRecord,
        },
      },
      502,
    );
  }

  const [ingestedAttemptRow] = await db
    .update(intakeAttempts)
    .set({
      status: "ingested",
      ingestStatus: "ingested",
      ingestError: null,
      updatedAt: new Date(),
    })
    .where(eq(intakeAttempts.id, attemptRow.id))
    .returning();

  if (!ingestedAttemptRow) {
    return c.json({ status: "error", message: "Failed to record ingest success" }, 500);
  }

  const ingestedAttempt = toAttemptRecord(ingestedAttemptRow);
  const deliveryTargetInfo = getDeliveryTargetInfo(ingestedAttempt.deliveryTarget);
  recordIntakeLifecycle(c.env, {
    contractId: ingestedAttempt.contractId,
    deliveryTargetId: deliveryTargetInfo.deliveryTargetId,
    deliveryTargetKind: deliveryTargetInfo.deliveryTargetKind,
    driftCategory: ingestedAttempt.driftCategory,
    event: "suggestion.ingested",
    ingestStatus: ingestedAttempt.ingestStatus,
    mappingTraceId: ingestedAttempt.mappingTraceId,
    modelName: ingestedAttempt.modelName,
    overallConfidence: ingestedAttempt.overallConfidence,
    promptVersion: ingestedAttempt.promptVersion,
    sourceKind: ingestedAttempt.sourceKind,
    sourceSystem: ingestedAttempt.sourceSystem,
    status: ingestedAttempt.status,
    validationErrorCount: ingestedAttempt.validationErrors.length,
  });

  return c.json({
    status: "success",
    data: {
      attempt: ingestedAttempt,
      mappingVersion,
      normalizedRecord,
    },
  });
});
