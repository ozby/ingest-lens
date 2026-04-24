import { Type, type Static } from "@sinclair/typebox";
import {
  JUDGE_RECOMMENDED_ACTIONS,
  JUDGE_VERDICTS,
  MAPPING_TRANSFORM_KINDS,
  REPLAY_STATUSES,
  SUGGESTION_REVIEW_STATUSES,
} from "@repo/types";

const ISO_DATE_TIME = {
  pattern: "^\\d{4}-\\d{2}-\\d{2}T.+Z$",
} as const;

function literalUnion<const VALUES extends readonly string[]>(values: VALUES) {
  return Type.Union(values.map((value) => Type.Literal(value)));
}

export const DeterministicValidationResultSchema = Type.Object(
  {
    isValid: Type.Boolean(),
    validatedAt: Type.String(ISO_DATE_TIME),
    errors: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);

export const JudgeAssessmentSchema = Type.Object(
  {
    verdict: literalUnion(JUDGE_VERDICTS),
    concerns: Type.Array(Type.String()),
    confidence: Type.Number({ minimum: 0, maximum: 1 }),
    recommendedAction: literalUnion(JUDGE_RECOMMENDED_ACTIONS),
    explanation: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const MappingSuggestionSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    sourcePath: Type.String({ minLength: 1 }),
    targetField: Type.String({ minLength: 1 }),
    transformKind: literalUnion(MAPPING_TRANSFORM_KINDS),
    confidence: Type.Number({ minimum: 0, maximum: 1 }),
    explanation: Type.String({ minLength: 1 }),
    evidenceSample: Type.String({ minLength: 1 }),
    deterministicValidation: DeterministicValidationResultSchema,
    judgeAssessment: Type.Optional(JudgeAssessmentSchema),
    reviewStatus: literalUnion(SUGGESTION_REVIEW_STATUSES),
    replayStatus: literalUnion(REPLAY_STATUSES),
  },
  { additionalProperties: false },
);

export const MappingSuggestionBatchSchema = Type.Object(
  {
    mappingTraceId: Type.String({ minLength: 1 }),
    contractId: Type.String({ minLength: 1 }),
    contractVersion: Type.String({ minLength: 1 }),
    sourceSystem: Type.String({ minLength: 1 }),
    promptVersion: Type.String({ minLength: 1 }),
    generatedAt: Type.String(ISO_DATE_TIME),
    overallConfidence: Type.Number({ minimum: 0, maximum: 1 }),
    driftCategories: Type.Array(Type.String()),
    missingRequiredFields: Type.Array(Type.String()),
    ambiguousTargetFields: Type.Array(Type.String()),
    suggestions: Type.Array(MappingSuggestionSchema),
    summary: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const ReplayPlanSchema = Type.Object(
  {
    mappingTraceId: Type.String({ minLength: 1 }),
    approvedSuggestionIds: Type.Array(Type.String({ minLength: 1 })),
    contractId: Type.String({ minLength: 1 }),
    mappingVersionId: Type.String({ minLength: 1 }),
    targetRecordType: Type.String({ minLength: 1 }),
    idempotencyKey: Type.String({ minLength: 1 }),
    replayStatus: literalUnion(REPLAY_STATUSES),
    deterministicValidation: DeterministicValidationResultSchema,
    scheduledAt: Type.String(ISO_DATE_TIME),
    replayedAt: Type.Optional(Type.String(ISO_DATE_TIME)),
    failureReason: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export type DeterministicValidationResultInput = Static<typeof DeterministicValidationResultSchema>;
export type JudgeAssessmentInput = Static<typeof JudgeAssessmentSchema>;
export type MappingSuggestionInput = Static<typeof MappingSuggestionSchema>;
export type MappingSuggestionBatchInput = Static<typeof MappingSuggestionBatchSchema>;
export type ReplayPlanInput = Static<typeof ReplayPlanSchema>;
