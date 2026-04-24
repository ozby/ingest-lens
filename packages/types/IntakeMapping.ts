export const MAPPING_TRANSFORM_KINDS = [
  "copy",
  "trim",
  "normalize_whitespace",
  "lowercase",
  "uppercase",
  "parse_number",
  "parse_boolean",
  "join_text",
  "to_array",
] as const;

export type MappingTransformKind = (typeof MAPPING_TRANSFORM_KINDS)[number];

export const SUGGESTION_REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;

export type SuggestionReviewStatus = (typeof SUGGESTION_REVIEW_STATUSES)[number];

export const REPLAY_STATUSES = ["not_requested", "pending", "replayed", "failed"] as const;

export type ReplayStatus = (typeof REPLAY_STATUSES)[number];

export const JUDGE_VERDICTS = ["agree", "review", "warn"] as const;

export type JudgeVerdict = (typeof JUDGE_VERDICTS)[number];

export const JUDGE_RECOMMENDED_ACTIONS = ["approve", "review", "reject"] as const;

export type JudgeRecommendedAction = (typeof JUDGE_RECOMMENDED_ACTIONS)[number];

export const INTAKE_ATTEMPT_STATUSES = [
  "pending_review",
  "abstained",
  "invalid_output",
  "runtime_failure",
  "approved",
  "rejected",
  "ingested",
  "ingest_failed",
] as const;

export type IntakeAttemptStatus = (typeof INTAKE_ATTEMPT_STATUSES)[number];

export type IngestStatus = "not_started" | "pending" | "ingested" | "failed";

export type SourceReferenceKind = "inline_payload" | "fixture_reference";

export const DRIFT_CATEGORIES = [
  "renamed_field",
  "missing_field",
  "new_field",
  "type_change",
  "nested_shape_change",
  "alias_collision",
  "ambiguous_mapping",
] as const;

export type DriftCategory = (typeof DRIFT_CATEGORIES)[number];

export interface DeliveryTarget {
  queueId?: string;
  topicId?: string;
}

export interface DeterministicValidationResult {
  isValid: boolean;
  validatedAt: string;
  errors: string[];
}

export interface JudgeAssessment {
  verdict: JudgeVerdict;
  concerns: string[];
  confidence: number;
  recommendedAction: JudgeRecommendedAction;
  explanation: string;
}

export interface MappingSuggestion {
  id: string;
  sourcePath: string;
  targetField: string;
  transformKind: MappingTransformKind;
  confidence: number;
  explanation: string;
  evidenceSample: string;
  deterministicValidation: DeterministicValidationResult;
  judgeAssessment?: JudgeAssessment;
  reviewStatus: SuggestionReviewStatus;
  replayStatus: ReplayStatus;
}

export interface MappingSuggestionBatch {
  mappingTraceId: string;
  contractId: string;
  contractVersion: string;
  sourceSystem: string;
  promptVersion: string;
  generatedAt: string;
  overallConfidence: number;
  driftCategories: string[];
  missingRequiredFields: string[];
  ambiguousTargetFields: string[];
  suggestions: MappingSuggestion[];
  summary: string;
}

export interface ReplayPlan {
  mappingTraceId: string;
  approvedSuggestionIds: string[];
  contractId: string;
  contractVersion?: string;
  mappingVersionId: string;
  targetRecordType: string;
  idempotencyKey: string;
  replayStatus: ReplayStatus;
  deterministicValidation: DeterministicValidationResult;
  scheduledAt: string;
  replayedAt?: string;
  failureReason?: string;
}

export interface IntakeAttemptRecord {
  intakeAttemptId: string;
  mappingTraceId: string;
  contractId: string;
  contractVersion: string;
  mappingVersionId?: string;
  sourceSystem: string;
  sourceKind: SourceReferenceKind;
  sourceFixtureId?: string;
  sourceHash: string;
  reviewPayloadExpiresAt?: string;
  deliveryTarget: DeliveryTarget;
  status: IntakeAttemptStatus;
  ingestStatus: IngestStatus;
  driftCategory: DriftCategory;
  modelName: string;
  promptVersion: string;
  overallConfidence: number;
  redactedSummary: string;
  validationErrors: string[];
  suggestionBatch?: MappingSuggestionBatch;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
}

export interface ApprovedMappingRevision {
  mappingVersionId: string;
  intakeAttemptId: string;
  mappingTraceId: string;
  contractId: string;
  contractVersion: string;
  targetRecordType: string;
  approvedSuggestionIds: string[];
  sourceHash: string;
  sourceKind: SourceReferenceKind;
  sourceFixtureId?: string;
  deliveryTarget: DeliveryTarget;
  createdAt: string;
}

export interface SourceProvenance {
  kind: SourceReferenceKind;
  fixtureId?: string;
  sourceHash: string;
  sourceSystem: string;
  sourceUrl?: string;
  capturedAt: string;
}

const normalizedEnvelopeBrand = Symbol("NormalizedRecordEnvelope");

export interface NormalizedRecordEnvelopeFields {
  readonly eventType: "ingest.record.normalized";
  readonly recordType: string;
  readonly schemaVersion: "v1";
  readonly contractId: string;
  readonly contractVersion: string;
  readonly mappingVersionId: string;
  readonly intakeAttemptId: string;
  readonly mappingTraceId: string;
  readonly source: SourceProvenance;
  readonly record: Record<string, unknown>;
}

export type NormalizedRecordEnvelope = NormalizedRecordEnvelopeFields & {
  readonly [normalizedEnvelopeBrand]: true;
};

export function brandNormalizedEnvelope(
  fields: NormalizedRecordEnvelopeFields,
): NormalizedRecordEnvelope {
  return { ...fields, [normalizedEnvelopeBrand]: true };
}
