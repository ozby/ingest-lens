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
  mappingVersionId: string;
  targetRecordType: string;
  idempotencyKey: string;
  replayStatus: ReplayStatus;
  deterministicValidation: DeterministicValidationResult;
  scheduledAt: string;
  replayedAt?: string;
  failureReason?: string;
}
