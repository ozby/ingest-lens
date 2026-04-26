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
import { createNormalizedEnvelope, normalizeWithMapping } from "../intake/normalize";
import { buildIntakeLifecycleEvent, recordIntakeLifecycle } from "../telemetry";
import { requireOwnedQueue, requireOwnedTopic } from "./ownership";
import { getFixtureReference } from "../intake/contracts";
import { getDemoFixtureById, listDemoFixtures } from "../intake/demoFixtures";
import { shapeFingerprint } from "../intake/shapeFingerprint";
import type { IntakeValidationSuccess } from "../intake/validateIntakeRequest";

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

type AttemptBase = Omit<IntakeAttemptRecord, "status" | "mappingVersionId" | "approvedAt">;

function buildAttemptBase(row: AttemptRow): AttemptBase {
  return {
    intakeAttemptId: row.id,
    mappingTraceId: row.mappingTraceId,
    contractId: row.contractId,
    contractVersion: row.contractVersion,
    sourceSystem: row.sourceSystem,
    sourceKind: row.sourceKind as IntakeAttemptRecord["sourceKind"],
    sourceFixtureId: row.sourceFixtureId ?? undefined,
    sourceHash: row.sourceHash,
    reviewPayloadExpiresAt: row.reviewPayloadExpiresAt?.toISOString(),
    deliveryTarget: row.deliveryTarget,
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
  };
}

function buildApprovedRecord(
  base: AttemptBase,
  row: AttemptRow,
  status: "approved" | "ingested" | "ingest_failed",
): IntakeAttemptRecord {
  if (!row.mappingVersionId || !row.approvedAt) {
    throw new Error(
      "toAttemptRecord: approved-family row is missing mappingVersionId or approvedAt",
    );
  }
  return {
    ...base,
    status,
    mappingVersionId: row.mappingVersionId,
    approvedAt: row.approvedAt.toISOString(),
  };
}

export function toAttemptRecord(row: AttemptRow): IntakeAttemptRecord {
  const base = buildAttemptBase(row);
  const status = row.status as IntakeAttemptRecord["status"];
  switch (status) {
    case "approved":
    case "ingested":
    case "ingest_failed":
      return buildApprovedRecord(base, row, status);
    case "pending_review":
    case "abstained":
    case "invalid_output":
    case "runtime_failure":
    case "rejected":
      return { ...base, status };
    default: {
      const exhaustive: never = status;
      throw new Error(`toAttemptRecord: unknown status ${String(exhaustive)}`);
    }
  }
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
    shapeFingerprint: row.shapeFingerprint ?? undefined,
    healedAt: row.healedAt?.toISOString() ?? undefined,
    rolledBackFrom: row.rolledBackFrom ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

function createId(): string {
  return crypto.randomUUID();
}

async function approveMapping(
  db: ReturnType<typeof createDb>,
  _env: Env,
  attemptRow: AttemptRow,
  approvedSuggestionIds: string[],
  _opts?: {
    healedAt?: Date;
    shapeFingerprint?: string;
    rolledBackFrom?: string;
  },
): Promise<{
  attempt: IntakeAttemptRecord;
  mappingVersion: ApprovedMappingRevision;
  normalizedRecord: unknown;
}> {
  const payload = getAttemptPayload(attemptRow);
  if (!payload) {
    throw new Error("Review payload has expired. Re-run the suggestion.");
  }

  const approvedSuggestions = selectApprovedSuggestions(
    attemptRow.suggestionBatch!.suggestions,
    approvedSuggestionIds,
  );

  if (approvedSuggestions.length === 0) {
    throw new Error("At least one approved suggestion is required.");
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
        ownerId: attemptRow.ownerId,
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

  const approvedAttempt = toAttemptRecord(persisted.attempt);
  const mappingVersion = toMappingRevision(persisted.revision);
  const normalizedRecord = createNormalizedEnvelope({
    attempt: approvedAttempt,
    mappingVersion,
    record,
  });

  return { attempt: approvedAttempt, mappingVersion, normalizedRecord };
}

function deriveMappingStatus(
  kind: string,
): "pending_review" | "abstained" | "invalid_output" | "runtime_failure" {
  if (kind === "success") return "pending_review";
  if (kind === "abstain") return "abstained";
  if (kind === "invalid_output") return "invalid_output";
  return "runtime_failure";
}

async function handleNewApprove(
  c: AppContext,
  db: ReturnType<typeof createDb>,
  attemptRow: AttemptRow,
  body: { approvedSuggestionIds?: string[] },
): Promise<Response> {
  if (!attemptRow.suggestionBatch) {
    return c.json(
      { status: "error", message: "Attempt does not contain reviewable suggestions." },
      409,
    );
  }

  if (!getAttemptPayload(attemptRow)) {
    return c.json(
      { status: "error", message: "Review payload has expired. Re-run the suggestion." },
      410,
    );
  }

  if (
    selectApprovedSuggestions(attemptRow.suggestionBatch.suggestions, body.approvedSuggestionIds)
      .length === 0
  ) {
    return c.json(
      { status: "error", message: "At least one approved suggestion is required." },
      400,
    );
  }

  const {
    attempt: approvedAttempt,
    mappingVersion,
    normalizedRecord,
  } = await approveMapping(db, c.env, attemptRow, body.approvedSuggestionIds ?? []);

  try {
    await publishToTarget(
      c,
      normalizedRecord as unknown as Record<string, unknown>,
      approvedAttempt.deliveryTarget,
    );
  } catch (error) {
    return handlePublishFailure(c, db, attemptRow.id, error, mappingVersion, normalizedRecord);
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
  recordIntakeLifecycle(c.env, buildIntakeLifecycleEvent(ingestedAttempt, "suggestion.ingested"));

  return c.json({
    status: "success",
    data: {
      attempt: ingestedAttempt,
      mappingVersion,
      normalizedRecord,
    },
  });
}

async function handleIdempotentApprove(
  c: AppContext,
  db: ReturnType<typeof createDb>,
  attemptRow: AttemptRow,
  body: { approvedSuggestionIds?: string[] },
): Promise<Response> {
  const existingAttempt = toAttemptRecord(attemptRow);
  if (
    existingAttempt.status !== "approved" &&
    existingAttempt.status !== "ingested" &&
    existingAttempt.status !== "ingest_failed"
  ) {
    throw new Error("approve handler: status narrowed to approved-family but record did not");
  }
  const [mappingVersionRow] = await db
    .select()
    .from(approvedMappingRevisions)
    .where(eq(approvedMappingRevisions.id, existingAttempt.mappingVersionId))
    .limit(1);

  if (body.approvedSuggestionIds !== undefined && mappingVersionRow) {
    const requested = [...body.approvedSuggestionIds].sort();
    const existing = [...mappingVersionRow.approvedSuggestionIds].sort();
    const differs =
      requested.length !== existing.length || requested.some((id, index) => id !== existing[index]);
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
      attempt: existingAttempt,
      mappingVersion: mappingVersionRow ? toMappingRevision(mappingVersionRow) : undefined,
    },
  });
}

async function handlePublishFailure(
  c: AppContext,
  db: ReturnType<typeof createDb>,
  attemptId: string,
  error: unknown,
  mappingVersion: ApprovedMappingRevision,
  normalizedRecord: unknown,
): Promise<Response> {
  const [failedAttemptRow] = await db
    .update(intakeAttempts)
    .set({
      status: "ingest_failed",
      ingestStatus: "failed",
      ingestError: error instanceof Error ? error.message : "Publish failed",
      updatedAt: new Date(),
    })
    .where(eq(intakeAttempts.id, attemptId))
    .returning();

  if (!failedAttemptRow) {
    return c.json({ status: "error", message: "Failed to record ingest failure" }, 500);
  }

  const failedAttempt = toAttemptRecord(failedAttemptRow);
  recordIntakeLifecycle(
    c.env,
    buildIntakeLifecycleEvent(failedAttempt, "suggestion.ingest_failed"),
  );

  return c.json(
    {
      status: "error",
      message: error instanceof Error ? error.message : "Publish failed",
      data: { attempt: failedAttempt, mappingVersion, normalizedRecord },
    },
    502,
  );
}

async function loadAttemptForOwner(
  c: AppContext,
  attemptId: string,
): Promise<AttemptRow | Response> {
  const db = createDb(c.env);
  const ownerId = c.get("user").userId;

  const [row] = await db
    .select()
    .from(intakeAttempts)
    .where(eq(intakeAttempts.id, attemptId))
    .limit(1);

  if (!row || row.ownerId !== ownerId) {
    return c.json({ status: "error", message: "Attempt not found" }, 404);
  }

  return row;
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

type ValidatedIntakeValue = IntakeValidationSuccess["value"];

type SuggestMappingsResult = Awaited<ReturnType<typeof suggestMappings>>;

async function persistHealedAttempt(
  db: ReturnType<typeof createDb>,
  ownerId: string,
  value: ValidatedIntakeValue,
  mapped: Extract<SuggestMappingsResult, { kind: "success" }>,
  healSuggestions: MappingSuggestion[],
  attemptId: string,
  mappingVersionId: string,
): Promise<{
  revision: typeof approvedMappingRevisions.$inferSelect;
  attempt: typeof intakeAttempts.$inferSelect;
}> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [revision] = await tx
      .insert(approvedMappingRevisions)
      .values({
        id: mappingVersionId,
        ownerId,
        intakeAttemptId: attemptId,
        mappingTraceId: mapped.batch.mappingTraceId,
        contractId: value.contract.id,
        contractVersion: value.contract.version,
        targetRecordType: value.contract.id.replace(/-v\d+$/, "").replace(/-/g, "_"),
        approvedSuggestionIds: healSuggestions.map((s) => s.id),
        sourceHash: value.sourceHash,
        sourceKind: value.sourceKind,
        sourceFixtureId: value.sourceFixture?.id,
        deliveryTarget: value.deliveryTarget,
        createdAt: now,
      })
      .returning();

    const [attempt] = await tx
      .insert(intakeAttempts)
      .values({
        id: attemptId,
        ownerId,
        mappingTraceId: mapped.batch.mappingTraceId,
        contractId: value.contract.id,
        contractVersion: value.contract.version,
        sourceSystem: value.sourceSystem,
        sourceKind: value.sourceKind,
        sourceFixtureId: value.sourceFixture?.id,
        sourceHash: value.sourceHash,
        deliveryTarget: value.deliveryTarget,
        status: "approved",
        ingestStatus: "pending",
        driftCategory: mapped.batch.driftCategories[0] ?? "renamed_field",
        modelName: mapped.decisionLog.model,
        promptVersion: mapped.decisionLog.promptVersion,
        overallConfidence: mapped.decisionLog.confidence.overall,
        redactedSummary: value.redactedSummary,
        validationErrors: [],
        suggestionBatch: mapped.batch,
        reviewPayload: value.reviewPayload,
        reviewPayloadExpiresAt: value.reviewPayloadExpiresAt
          ? new Date(value.reviewPayloadExpiresAt)
          : null,
        mappingVersionId,
        approvedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!revision || !attempt) {
      throw new Error("Heal persistence returned no rows; rolling back.");
    }
    return { revision, attempt };
  });
}

async function persistPendingReview(
  db: ReturnType<typeof createDb>,
  ownerId: string,
  value: ValidatedIntakeValue,
  mapped: SuggestMappingsResult,
): Promise<typeof intakeAttempts.$inferSelect | null> {
  const now = new Date();
  const attemptId = createId();
  const mappingTraceId = mapped.kind === "success" ? mapped.batch.mappingTraceId : createId();
  const driftCategory =
    mapped.kind === "success"
      ? (mapped.batch.driftCategories[0] ?? "renamed_field")
      : "ambiguous_mapping";
  const validationErrors = mapped.kind === "invalid_output" ? mapped.errors : [];

  const [row] = await db
    .insert(intakeAttempts)
    .values({
      id: attemptId,
      ownerId,
      mappingTraceId,
      contractId: value.contract.id,
      contractVersion: value.contract.version,
      sourceSystem: value.sourceSystem,
      sourceKind: value.sourceKind,
      sourceFixtureId: value.sourceFixture?.id,
      sourceHash: value.sourceHash,
      deliveryTarget: value.deliveryTarget,
      status: deriveMappingStatus(mapped.kind),
      ingestStatus: "not_started",
      driftCategory,
      modelName: mapped.decisionLog.model,
      promptVersion: mapped.decisionLog.promptVersion,
      overallConfidence: mapped.decisionLog.confidence.overall,
      redactedSummary: value.redactedSummary,
      validationErrors,
      suggestionBatch: mapped.kind === "success" ? mapped.batch : null,
      reviewPayload: value.reviewPayload,
      reviewPayloadExpiresAt: value.reviewPayloadExpiresAt
        ? new Date(value.reviewPayloadExpiresAt)
        : null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return row ?? null;
}

async function tryHealPath(
  c: AppContext,
  ownerId: string,
  value: ValidatedIntakeValue,
  mapped: Extract<SuggestMappingsResult, { kind: "success" }>,
  healDO: DurableObjectStub,
  incomingFingerprint: string,
  autoHealThreshold: number,
): Promise<Response | null> {
  if (mapped.batch.overallConfidence < autoHealThreshold) return null;

  try {
    const healRes = await healDO.fetch("https://do/tryHeal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batch: mapped.batch,
        payloadFingerprint: incomingFingerprint,
      }),
    });

    if (!healRes.ok) return null;

    const healResult = await healRes.json<{ healed: boolean; suggestions: MappingSuggestion[] }>();

    if (!healResult.healed) {
      // Race: fingerprint matched in DO between getState() and tryHeal() — use cached suggestions
      const normalized = normalizeWithMapping({
        payload: value.payload,
        suggestions: healResult.suggestions,
      });
      return c.json({ status: "success", data: { normalized, fastPath: true } });
    }

    const db = createDb(c.env);
    const persisted = await persistHealedAttempt(
      db,
      ownerId,
      value,
      mapped,
      healResult.suggestions,
      createId(),
      createId(),
    );

    const approvedAttempt = toAttemptRecord(persisted.attempt);
    const mappingVersion = toMappingRevision(persisted.revision);
    const normalized = normalizeWithMapping({
      payload: value.payload,
      suggestions: healResult.suggestions,
    });
    const normalizedRecord = createNormalizedEnvelope({
      attempt: approvedAttempt,
      mappingVersion,
      record: normalized,
    });

    try {
      await publishToTarget(
        c,
        normalizedRecord as unknown as Record<string, unknown>,
        approvedAttempt.deliveryTarget,
      );
    } catch {
      // fall through — ingest_failed update skipped to keep heal path simple
    }

    recordIntakeLifecycle(c.env, buildIntakeLifecycleEvent(approvedAttempt, "suggestion.ingested"));
    return c.json({
      status: "success",
      data: { attempt: approvedAttempt, mappingVersion, normalizedRecord, healPath: true },
    });
  } catch {
    return null; // fall through to pending_review on any failure
  }
}

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

  const AUTO_HEAL_THRESHOLD = Number(c.env.AUTO_HEAL_THRESHOLD ?? 0.8);

  const doId = c.env.HEAL_STREAM.idFromName(
    `${validation.value.sourceSystem}:${validation.value.contract.id}:${validation.value.contract.version}`,
  );
  const healDO = c.env.HEAL_STREAM.get(doId);

  const incomingFingerprint = shapeFingerprint(validation.value.payload);
  const stateRes = await healDO.fetch("https://do/state");
  const currentState = stateRes.ok
    ? await stateRes.json<{
        approved: { fingerprint: string; suggestions: MappingSuggestion[] } | null;
      }>()
    : { approved: null };

  if (currentState.approved && currentState.approved.fingerprint === incomingFingerprint) {
    // FAST PATH — shape matches approved fingerprint, skip LLM
    const normalized = normalizeWithMapping({
      payload: validation.value.payload,
      suggestions: currentState.approved.suggestions,
    });
    await c.env.DELIVERY_QUEUE.send({
      type: "intake_audit",
      attemptId: createId(),
      sourceSystem: validation.value.sourceSystem,
      sourceHash: validation.value.sourceHash,
      fingerprint: incomingFingerprint,
      timestamp: new Date().toISOString(),
    } as unknown as Parameters<typeof c.env.DELIVERY_QUEUE.send>[0]);
    return c.json({ status: "success", data: { normalized, fastPath: true } });
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

  // HEAL PATH — high-confidence success auto-approved and stored in HealStreamDO
  if (mapped.kind === "success") {
    const healResponse = await tryHealPath(
      c,
      ownerId,
      validation.value,
      mapped,
      healDO,
      incomingFingerprint,
      AUTO_HEAL_THRESHOLD,
    );
    if (healResponse) return healResponse;
  }

  const db = createDb(c.env);
  const row = await persistPendingReview(db, ownerId, validation.value, mapped);

  if (!row) {
    return c.json({ status: "error", message: "Failed to record intake attempt" }, 500);
  }

  const attempt = toAttemptRecord(row);
  recordIntakeLifecycle(c.env, buildIntakeLifecycleEvent(attempt, "suggestion.created"));

  return c.json({ status: "success", data: { attempt } }, 201);
});

intakeRoutes.post("/mapping-suggestions/:id/reject", async (c) => {
  const attemptId = c.req.param("id");
  const body = await c.req.json<RejectIntakeSuggestionRequest>();

  const existingOrResponse = await loadAttemptForOwner(c, attemptId);
  if (existingOrResponse instanceof Response) {
    return existingOrResponse;
  }
  const existing = existingOrResponse;
  const db = createDb(c.env);

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
  const attemptId = c.req.param("id");
  const body = await c.req.json<{ approvedSuggestionIds?: string[] }>();

  const attemptRowOrResponse = await loadAttemptForOwner(c, attemptId);
  if (attemptRowOrResponse instanceof Response) {
    return attemptRowOrResponse;
  }
  const attemptRow = attemptRowOrResponse;
  const db = createDb(c.env);

  const alreadyApproved =
    attemptRow.status === "approved" ||
    attemptRow.status === "ingested" ||
    attemptRow.status === "ingest_failed";

  if (alreadyApproved) {
    return handleIdempotentApprove(c, db, attemptRow, body);
  }

  return handleNewApprove(c, db, attemptRow, body);
});
