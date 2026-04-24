import type { TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { JudgeAssessment, MappingSuggestionBatch, ReplayPlan } from "@repo/types";
import { parseSourcePath, resolveSourcePath } from "./sourcePath";
import { JudgeAssessmentSchema, MappingSuggestionBatchSchema, ReplayPlanSchema } from "./schemas";

export interface ValidationFailure {
  ok: false;
  errors: string[];
}

export interface ValidationSuccess<T> {
  ok: true;
  value: T;
}

export type ValidationResult<T> = ValidationFailure | ValidationSuccess<T>;

export interface MappingSuggestionValidationOptions {
  allowedTargetFields?: readonly string[];
  sourcePayload?: unknown;
}

function formatValueErrors(schema: TSchema, input: unknown): string[] {
  return [...Value.Errors(schema, input)].map((error) => {
    const path = error.path || "/";
    return `${path} ${error.message ?? "is invalid"}`;
  });
}

function validateTargetFields(
  batch: MappingSuggestionBatch,
  options: MappingSuggestionValidationOptions,
): string[] {
  const allowedTargetFields = options.allowedTargetFields;
  if (!allowedTargetFields || allowedTargetFields.length === 0) {
    return [];
  }

  const allowed = new Set(allowedTargetFields);
  return batch.suggestions.flatMap(
    (suggestion: MappingSuggestionBatch["suggestions"][number], index: number) =>
      allowed.has(suggestion.targetField)
        ? []
        : [`/suggestions/${index}/targetField must be one of: ${allowedTargetFields.join(", ")}`],
  );
}

function validateSourcePaths(
  batch: MappingSuggestionBatch,
  options: MappingSuggestionValidationOptions,
): string[] {
  return batch.suggestions.flatMap(
    (suggestion: MappingSuggestionBatch["suggestions"][number], index: number) => {
      const result =
        options.sourcePayload === undefined
          ? parseSourcePath(suggestion.sourcePath)
          : resolveSourcePath(options.sourcePayload, suggestion.sourcePath);
      return result.ok ? [] : [`/suggestions/${index}/sourcePath ${result.message}`];
    },
  );
}

export function validateMappingSuggestionBatch(
  input: unknown,
  options: MappingSuggestionValidationOptions = {},
): ValidationResult<MappingSuggestionBatch> {
  if (!Value.Check(MappingSuggestionBatchSchema, input)) {
    return {
      ok: false,
      errors: formatValueErrors(MappingSuggestionBatchSchema, input),
    };
  }

  const batch = input as MappingSuggestionBatch;
  const extraErrors = [
    ...validateTargetFields(batch, options),
    ...validateSourcePaths(batch, options),
  ];

  if (extraErrors.length > 0) {
    return {
      ok: false,
      errors: extraErrors,
    };
  }

  return {
    ok: true,
    value: batch,
  };
}

export function validateJudgeAssessment(input: unknown): ValidationResult<JudgeAssessment> {
  if (!Value.Check(JudgeAssessmentSchema, input)) {
    return {
      ok: false,
      errors: formatValueErrors(JudgeAssessmentSchema, input),
    };
  }

  return {
    ok: true,
    value: input as JudgeAssessment,
  };
}

export function validateReplayPlan(input: unknown): ValidationResult<ReplayPlan> {
  if (!Value.Check(ReplayPlanSchema, input)) {
    return {
      ok: false,
      errors: formatValueErrors(ReplayPlanSchema, input),
    };
  }

  return {
    ok: true,
    value: input as ReplayPlan,
  };
}
