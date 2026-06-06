import type { MappingSuggestionBatch } from "@repo/types";

export interface ConfidenceSummaryLike {
  average: number;
  maximum: number;
  minimum: number;
  overall: number;
}

export interface MappingDecisionLogLike {
  provider: "workers-ai" | "test-runner";
  model: string;
  promptVersion: string;
  validationOutcome: "passed" | "abstained" | "invalid_output" | "runtime_failure";
  confidence: ConfidenceSummaryLike;
  failureReason?: string;
  judgeDisagreements: number;
  judgeUnavailableCount: number;
}

export interface MappingValidationInputLike {
  targetFields: readonly string[];
  payload: unknown;
}

export function summarizeConfidence(batch?: MappingSuggestionBatch): ConfidenceSummaryLike {
  if (!batch || batch.suggestions.length === 0) {
    return {
      average: 0,
      maximum: 0,
      minimum: 0,
      overall: batch?.overallConfidence ?? 0,
    };
  }

  const values = batch.suggestions.map((suggestion) => suggestion.confidence);
  const sum = values.reduce((total, value) => total + value, 0);

  return {
    average: sum / values.length,
    maximum: Math.max(...values),
    minimum: Math.min(...values),
    overall: batch.overallConfidence,
  };
}

export function buildDecisionLog(
  provider: MappingDecisionLogLike["provider"],
  model: string,
  promptVersion: string,
  validationOutcome: MappingDecisionLogLike["validationOutcome"],
  batch?: MappingSuggestionBatch,
  overrides: Partial<
    Omit<
      MappingDecisionLogLike,
      "provider" | "model" | "promptVersion" | "validationOutcome" | "confidence"
    >
  > = {},
): MappingDecisionLogLike {
  return {
    provider,
    model,
    promptVersion,
    validationOutcome,
    confidence: summarizeConfidence(batch),
    judgeDisagreements: overrides.judgeDisagreements ?? 0,
    judgeUnavailableCount: overrides.judgeUnavailableCount ?? 0,
    failureReason: overrides.failureReason,
  };
}

export function hasLowConfidence(batch: MappingSuggestionBatch, threshold: number): boolean {
  return (
    batch.overallConfidence < threshold ||
    batch.suggestions.some((suggestion) => suggestion.confidence < threshold)
  );
}

export function createMappingValidationOptions(input: MappingValidationInputLike) {
  return {
    allowedTargetFields: input.targetFields,
    sourcePayload: input.payload,
  };
}
