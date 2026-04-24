import Ajv from "ajv";
import type {
  JudgeAssessment,
  MappingSuggestionBatch,
  ReplayPlan,
} from "@repo/types";
import { parseSourcePath, resolveSourcePath } from "./sourcePath";
import {
  JudgeAssessmentSchema,
  MappingSuggestionBatchSchema,
  ReplayPlanSchema,
} from "./schemas";

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

const ajv = new Ajv({
  allErrors: true,
  strict: false,
});

const validateBatchSchema = ajv.compile<MappingSuggestionBatch>(
  MappingSuggestionBatchSchema,
);
const validateJudgeSchema = ajv.compile<JudgeAssessment>(JudgeAssessmentSchema);
const validateReplayPlanSchema = ajv.compile<ReplayPlan>(ReplayPlanSchema);

function formatAjvErrors(errors: typeof validateBatchSchema.errors): string[] {
  return (errors ?? []).map((error) => {
    const path = error.instancePath || "/";
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
  return batch.suggestions.flatMap((suggestion: MappingSuggestionBatch["suggestions"][number], index: number) =>
    allowed.has(suggestion.targetField)
      ? []
      : [
          `/suggestions/${index}/targetField must be one of: ${allowedTargetFields.join(", ")}`,
        ],
  );
}

function validateSourcePaths(
  batch: MappingSuggestionBatch,
  options: MappingSuggestionValidationOptions,
): string[] {
  return batch.suggestions.flatMap((suggestion: MappingSuggestionBatch["suggestions"][number], index: number) => {
    const result =
      options.sourcePayload === undefined
        ? parseSourcePath(suggestion.sourcePath)
        : resolveSourcePath(options.sourcePayload, suggestion.sourcePath);
    return result.ok
      ? []
      : [`/suggestions/${index}/sourcePath ${result.message}`];
  });
}

export function validateMappingSuggestionBatch(
  input: unknown,
  options: MappingSuggestionValidationOptions = {},
): ValidationResult<MappingSuggestionBatch> {
  if (!validateBatchSchema(input)) {
    return {
      ok: false,
      errors: formatAjvErrors(validateBatchSchema.errors),
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

export function validateJudgeAssessment(
  input: unknown,
): ValidationResult<JudgeAssessment> {
  if (!validateJudgeSchema(input)) {
    return {
      ok: false,
      errors: formatAjvErrors(validateJudgeSchema.errors),
    };
  }

  return {
    ok: true,
    value: input,
  };
}

export function validateReplayPlan(input: unknown): ValidationResult<ReplayPlan> {
  if (!validateReplayPlanSchema(input)) {
    return {
      ok: false,
      errors: formatAjvErrors(validateReplayPlanSchema.errors),
    };
  }

  return {
    ok: true,
    value: input,
  };
}
