import type { ApprovedMappingRevision, IntakeAttemptRecord, MappingSuggestion } from "@repo/types";
import type { intakeAttempts, approvedMappingRevisions } from "../../db/schema";
import { getFixtureReference } from "../contracts";

type AttemptRow = typeof intakeAttempts.$inferSelect;
type MappingVersionRow = typeof approvedMappingRevisions.$inferSelect;
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

export function toMappingRevision(row: MappingVersionRow): ApprovedMappingRevision {
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

export function selectApprovedSuggestions(
  suggestions: readonly MappingSuggestion[],
  approvedSuggestionIds?: readonly string[],
): MappingSuggestion[] {
  if (!approvedSuggestionIds || approvedSuggestionIds.length === 0) {
    return [...suggestions];
  }

  const approvedSet = new Set(approvedSuggestionIds);
  return suggestions.filter((suggestion) => approvedSet.has(suggestion.id));
}

export function getAttemptPayload(attempt: AttemptRow): Record<string, unknown> | null {
  if (attempt.sourceFixtureId) {
    return getFixtureReference(attempt.sourceFixtureId)?.payload ?? null;
  }

  if (attempt.reviewPayloadExpiresAt && attempt.reviewPayloadExpiresAt.getTime() < Date.now()) {
    return null;
  }

  return (attempt.reviewPayload as Record<string, unknown> | null) ?? null;
}
