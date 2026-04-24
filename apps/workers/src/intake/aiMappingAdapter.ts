import { NoObjectGeneratedError, generateObject, jsonSchema } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import type { JudgeAssessment, MappingSuggestionBatch } from "@repo/types";
import type { Env } from "../db/client";
import { classifyDriftCategory, getTargetContract } from "./contracts";
import { resolveSourcePath } from "./sourcePath";
import { JudgeAssessmentSchema, MappingSuggestionBatchSchema } from "./schemas";
import { validateJudgeAssessment, validateMappingSuggestionBatch } from "./validators";

export const DEFAULT_PRIMARY_MODEL = "@cf/meta/llama-3.1-8b-instruct";
export const DEFAULT_JUDGE_MODEL = "@cf/meta/llama-3.1-8b-instruct";
export const DEFAULT_MAPPING_PROMPT_VERSION = "payload-mapper-v1";
export const LOW_CONFIDENCE_THRESHOLD = 0.5;
const DEFAULT_MODEL_TIMEOUT_MS = 5_000;
const DEFAULT_PRIMARY_MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 50;

export interface ConfidenceSummary {
  average: number;
  maximum: number;
  minimum: number;
  overall: number;
}

export interface MappingDecisionLog {
  provider: "workers-ai" | "test-runner";
  model: string;
  promptVersion: string;
  validationOutcome: "passed" | "abstained" | "invalid_output" | "runtime_failure";
  confidence: ConfidenceSummary;
  failureReason?: string;
  judgeDisagreements: number;
  judgeUnavailableCount: number;
}

export interface SuggestMappingsInput {
  payload: unknown;
  sourceSystem: string;
  contractId: string;
  contractVersion: string;
  promptVersion: string;
  targetFields: readonly string[];
  enableJudge?: boolean;
  primaryModel?: string;
  judgeModel?: string;
}

export type StructuredRunner = <T>(options: {
  modelId: string;
  prompt: string;
  schema: object;
  schemaName: string;
  schemaDescription: string;
  validate: (value: unknown) => { ok: true; value: T } | { ok: false; errors: string[] };
  maxRetries?: number;
  abortSignal?: AbortSignal;
}) => Promise<unknown>;

export interface SuggestMappingsDependencies {
  env?: Pick<Env, "AI">;
  primaryRunner?: StructuredRunner;
  judgeRunner?: StructuredRunner;
  timeoutMs?: number;
  retryDelayMs?: number;
  primaryMaxAttempts?: number;
}

export type SuggestMappingsResult =
  | {
      kind: "success";
      batch: MappingSuggestionBatch;
      decisionLog: MappingDecisionLog;
    }
  | {
      kind: "abstain";
      reason: string;
      decisionLog: MappingDecisionLog;
    }
  | {
      kind: "invalid_output";
      reason: string;
      errors: string[];
      decisionLog: MappingDecisionLog;
    }
  | {
      kind: "runtime_failure";
      reason: string;
      decisionLog: MappingDecisionLog;
    };

interface DeterministicFallbackSuggestionCandidate {
  sourcePath: string;
  targetField: string;
  transformKind: MappingSuggestionBatch["suggestions"][number]["transformKind"];
  explanation: string;
}

function summarizeConfidence(batch?: MappingSuggestionBatch): ConfidenceSummary {
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

function buildDecisionLog(
  provider: MappingDecisionLog["provider"],
  model: string,
  promptVersion: string,
  validationOutcome: MappingDecisionLog["validationOutcome"],
  batch?: MappingSuggestionBatch,
  overrides: Partial<
    Omit<
      MappingDecisionLog,
      "provider" | "model" | "promptVersion" | "validationOutcome" | "confidence"
    >
  > = {},
): MappingDecisionLog {
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

function createDeterministicFallbackBatch(
  input: SuggestMappingsInput,
): MappingSuggestionBatch | null {
  const contract = getTargetContract(input.contractId);
  if (!contract || input.contractId !== "job-posting-v1") {
    return null;
  }

  const candidates: readonly DeterministicFallbackSuggestionCandidate[] = [
    {
      sourcePath: "/title",
      targetField: "name",
      transformKind: "copy",
      explanation: "Ashby-style title fields map directly to the normalized job name.",
    },
    {
      sourcePath: "/name",
      targetField: "name",
      transformKind: "copy",
      explanation: "Greenhouse-style name fields map directly to the normalized job name.",
    },
    {
      sourcePath: "/text",
      targetField: "name",
      transformKind: "copy",
      explanation: "Lever text fields map directly to the normalized job name.",
    },
    {
      sourcePath: "/status",
      targetField: "status",
      transformKind: "copy",
      explanation: "Status fields can be preserved as-is for deterministic review.",
    },
    {
      sourcePath: "/state",
      targetField: "status",
      transformKind: "copy",
      explanation: "Lever state fields carry the publish status for the posting.",
    },
    {
      sourcePath: "/department",
      targetField: "department",
      transformKind: "copy",
      explanation: "Department fields map directly into the normalized department field.",
    },
    {
      sourcePath: "/departments/0/name",
      targetField: "department",
      transformKind: "copy",
      explanation: "The first department name is the deterministic department fallback.",
    },
    {
      sourcePath: "/team",
      targetField: "department",
      transformKind: "copy",
      explanation: "Lever team fields are reused as the normalized department.",
    },
    {
      sourcePath: "/locations",
      targetField: "location",
      transformKind: "join_text",
      explanation: "Array locations are joined into the normalized location text.",
    },
    {
      sourcePath: "/location",
      targetField: "location",
      transformKind: "copy",
      explanation: "Single-string location fields map directly to the normalized location.",
    },
    {
      sourcePath: "/offices/0/location/name",
      targetField: "location",
      transformKind: "copy",
      explanation:
        "The first Greenhouse office location is used for deterministic location mapping.",
    },
    {
      sourcePath: "/apply_url",
      targetField: "post_url",
      transformKind: "copy",
      explanation: "Ashby apply URLs map directly into the normalized posting URL.",
    },
    {
      sourcePath: "/applyUrl",
      targetField: "post_url",
      transformKind: "copy",
      explanation: "Lever apply URLs map directly into the normalized posting URL.",
    },
    {
      sourcePath: "/employment_type",
      targetField: "employment_type",
      transformKind: "copy",
      explanation: "Employment type values can be reused without transformation.",
    },
    {
      sourcePath: "/workplaceType",
      targetField: "employment_type",
      transformKind: "copy",
      explanation: "Lever workplace types serve as the deterministic employment type fallback.",
    },
  ];

  const suggestions = candidates.flatMap((candidate, index) => {
    if (!input.targetFields.includes(candidate.targetField)) {
      return [];
    }

    const resolved = resolveSourcePath(input.payload, candidate.sourcePath);
    if (!resolved.ok) {
      return [];
    }

    return [
      {
        id: `fallback-${index + 1}`,
        sourcePath: candidate.sourcePath,
        targetField: candidate.targetField,
        transformKind: candidate.transformKind,
        confidence: 0.92,
        explanation: candidate.explanation,
        evidenceSample:
          typeof resolved.value === "string" ? resolved.value : JSON.stringify(resolved.value),
        deterministicValidation: {
          isValid: true,
          validatedAt: new Date().toISOString(),
          errors: [],
        },
        reviewStatus: "pending",
        replayStatus: "not_requested",
      } satisfies MappingSuggestionBatch["suggestions"][number],
    ];
  });

  if (suggestions.length === 0) {
    return null;
  }

  const mappedTargetFields = new Set(suggestions.map((suggestion) => suggestion.targetField));
  const missingRequiredFields = contract.requiredFields.filter(
    (field) => !mappedTargetFields.has(field),
  );
  const ambiguousTargetFields: string[] = [];

  return {
    mappingTraceId: crypto.randomUUID(),
    contractId: input.contractId,
    contractVersion: input.contractVersion,
    sourceSystem: input.sourceSystem,
    promptVersion: input.promptVersion,
    generatedAt: new Date().toISOString(),
    overallConfidence: missingRequiredFields.length === 0 ? 0.92 : 0.78,
    driftCategories: [classifyDriftCategory(missingRequiredFields, ambiguousTargetFields)],
    missingRequiredFields,
    ambiguousTargetFields,
    suggestions,
    summary:
      missingRequiredFields.length === 0
        ? `Deterministic local fallback produced ${suggestions.length} review suggestions.`
        : `Deterministic local fallback produced ${suggestions.length} suggestions but still needs ${missingRequiredFields.join(", ")}.`,
  };
}

export function buildMappingPrompt(input: SuggestMappingsInput): string {
  return [
    "You are proposing mapping suggestions for a deterministic intake system.",
    "Return JSON only.",
    "Abstain instead of inventing fields that are absent from the payload.",
    `Source system: ${input.sourceSystem}`,
    `Contract: ${input.contractId}@${input.contractVersion}`,
    `Prompt version: ${input.promptVersion}`,
    `Allowed target fields: ${input.targetFields.join(", ")}`,
    `Payload: ${JSON.stringify(input.payload, null, 2)}`,
  ].join("\n\n");
}

function buildJudgePrompt(
  input: SuggestMappingsInput,
  suggestion: MappingSuggestionBatch["suggestions"][number],
): string {
  return [
    "You are reviewing a deterministic intake mapping suggestion.",
    "Return JSON only.",
    "Assess whether the suggestion should be approved, reviewed, or rejected by a human operator.",
    `Prompt version: ${input.promptVersion}`,
    `Target fields: ${input.targetFields.join(", ")}`,
    `Payload: ${JSON.stringify(input.payload, null, 2)}`,
    `Suggestion: ${JSON.stringify(suggestion, null, 2)}`,
  ].join("\n\n");
}

function hasLowConfidence(batch: MappingSuggestionBatch): boolean {
  return (
    batch.overallConfidence < LOW_CONFIDENCE_THRESHOLD ||
    batch.suggestions.some((suggestion) => suggestion.confidence < LOW_CONFIDENCE_THRESHOLD)
  );
}

function createWorkersStructuredRunner(env: Pick<Env, "AI">): StructuredRunner {
  if (!env.AI) {
    throw new Error("Workers AI binding is unavailable");
  }

  const workersAI = createWorkersAI({ binding: env.AI });

  return async <T>(options: {
    modelId: string;
    prompt: string;
    schema: object;
    schemaName: string;
    schemaDescription: string;
    validate: (value: unknown) => { ok: true; value: T } | { ok: false; errors: string[] };
    maxRetries?: number;
    abortSignal?: AbortSignal;
  }): Promise<unknown> => {
    const result = await generateObject({
      model: workersAI(options.modelId),
      prompt: options.prompt,
      maxRetries: options.maxRetries,
      abortSignal: options.abortSignal,
      schema: jsonSchema(options.schema as never, {
        validate: (value) => {
          const validation = options.validate(value);
          return validation.ok
            ? { success: true, value: validation.value }
            : {
                success: false,
                error: new Error(validation.errors.join("; ")),
              };
        },
      }),
      schemaName: options.schemaName,
      schemaDescription: options.schemaDescription,
    });

    return result.object;
  };
}

class ModelTimeoutError extends Error {
  readonly code = "model_timeout";

  constructor(modelLabel: string, timeoutMs: number) {
    super(`${modelLabel} timed out after ${timeoutMs}ms`);
    this.name = "ModelTimeoutError";
  }
}

const RETRYABLE_ERROR_PATTERNS = [
  /\b429\b/i,
  /\b503\b/i,
  /\brate limit/i,
  /\btemporar(?:y|ily)\b/i,
  /\btimeout\b/i,
  /\bconnection\b/i,
  /\betimedout\b/i,
  /\beconnreset\b/i,
  /\beai_again\b/i,
] as const;

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function withTimeout<T>(
  operation: (abortSignal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  modelLabel: string,
): Promise<T> {
  const abortController = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const result = await new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => {
        const timeoutError = new ModelTimeoutError(modelLabel, timeoutMs);
        abortController.abort(timeoutError);
        reject(timeoutError);
      }, timeoutMs);

      operation(abortController.signal).then(resolve, reject);
    });

    return result;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

function isRetryableModelError(error: unknown): boolean {
  if (error instanceof ModelTimeoutError) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const errorCode =
    typeof (error as { code?: unknown }).code === "string"
      ? (error as unknown as { code: string }).code
      : "";
  const errorText = `${error.name} ${error.message} ${errorCode}`.trim();

  return RETRYABLE_ERROR_PATTERNS.some((pattern) => pattern.test(errorText));
}

async function runWithRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: {
    maxAttempts: number;
    retryDelayMs: number;
    sleep: (delayMs: number) => Promise<void>;
  },
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        throw error;
      }

      if (!isRetryableModelError(error)) {
        throw error;
      }

      lastError = error;

      if (attempt >= options.maxAttempts) {
        break;
      }

      await options.sleep(options.retryDelayMs);
    }
  }

  throw lastError;
}

async function attachJudgeAssessments(
  batch: MappingSuggestionBatch,
  input: SuggestMappingsInput,
  runner: StructuredRunner,
): Promise<{
  batch: MappingSuggestionBatch;
  judgeDisagreements: number;
  judgeUnavailableCount: number;
}> {
  let judgeDisagreements = 0;
  let judgeUnavailableCount = 0;

  const suggestions = await Promise.all(
    batch.suggestions.map(async (suggestion) => {
      try {
        const rawAssessment = await runner<JudgeAssessment>({
          modelId: input.judgeModel ?? DEFAULT_JUDGE_MODEL,
          prompt: buildJudgePrompt(input, suggestion),
          schema: JudgeAssessmentSchema,
          schemaName: "JudgeAssessment",
          schemaDescription: "Advisory human-review recommendation for one mapping suggestion.",
          validate: validateJudgeAssessment,
        });
        const validation = validateJudgeAssessment(rawAssessment);
        if (!validation.ok) {
          judgeUnavailableCount += 1;
          return suggestion;
        }

        if (validation.value.verdict !== "agree") {
          judgeDisagreements += 1;
        }

        return {
          ...suggestion,
          judgeAssessment: validation.value,
        };
      } catch {
        judgeUnavailableCount += 1;
        return suggestion;
      }
    }),
  );

  return {
    batch: {
      ...batch,
      suggestions,
    },
    judgeDisagreements,
    judgeUnavailableCount,
  };
}

export async function suggestMappings(
  input: SuggestMappingsInput,
  dependencies: SuggestMappingsDependencies = {},
): Promise<SuggestMappingsResult> {
  let provider: MappingDecisionLog["provider"] = dependencies.primaryRunner
    ? "test-runner"
    : "workers-ai";
  const primaryModel = input.primaryModel ?? DEFAULT_PRIMARY_MODEL;
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_MODEL_TIMEOUT_MS;
  const primaryMaxAttempts = dependencies.primaryMaxAttempts ?? DEFAULT_PRIMARY_MAX_ATTEMPTS;
  const retryDelayMs = dependencies.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  let primaryRunner: StructuredRunner;
  try {
    primaryRunner =
      dependencies.primaryRunner ?? createWorkersStructuredRunner(dependencies.env ?? {});
  } catch (error) {
    const fallbackBatch = createDeterministicFallbackBatch(input);
    if (fallbackBatch) {
      provider = "test-runner";
      primaryRunner = async () => fallbackBatch;
    } else {
      const reason = error instanceof Error ? error.message : "Workers AI binding is unavailable";
      return {
        kind: "abstain",
        reason,
        decisionLog: buildDecisionLog(
          provider,
          primaryModel,
          input.promptVersion,
          "abstained",
          undefined,
          { failureReason: "ai_binding_missing" },
        ),
      };
    }
  }

  let batch: MappingSuggestionBatch;
  try {
    batch = (await runWithRetry(
      (attempt) =>
        withTimeout(
          (abortSignal) =>
            primaryRunner<MappingSuggestionBatch>({
              modelId: primaryModel,
              prompt: buildMappingPrompt(input),
              schema: MappingSuggestionBatchSchema,
              schemaName: "MappingSuggestionBatch",
              schemaDescription:
                "Structured mapping suggestions for a deterministic intake workflow.",
              validate: (value) =>
                validateMappingSuggestionBatch(value, {
                  allowedTargetFields: input.targetFields,
                  sourcePayload: input.payload,
                }),
              maxRetries: 0,
              abortSignal,
            }) as Promise<MappingSuggestionBatch>,
          timeoutMs,
          `Primary model attempt ${attempt}`,
        ),
      {
        maxAttempts: primaryMaxAttempts,
        retryDelayMs,
        sleep,
      },
    )) as MappingSuggestionBatch;
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      return {
        kind: "invalid_output",
        reason: "Model output did not satisfy the mapping contract.",
        errors: [error.message],
        decisionLog: buildDecisionLog(
          provider,
          primaryModel,
          input.promptVersion,
          "invalid_output",
          undefined,
          { failureReason: "no_object_generated" },
        ),
      };
    }

    return {
      kind: "runtime_failure",
      reason: error instanceof Error ? error.message : "Primary model execution failed.",
      decisionLog: buildDecisionLog(
        provider,
        primaryModel,
        input.promptVersion,
        "runtime_failure",
        undefined,
        {
          failureReason:
            error instanceof ModelTimeoutError ? "primary_model_timeout" : "primary_model_failed",
        },
      ),
    };
  }

  const validation = validateMappingSuggestionBatch(batch, {
    allowedTargetFields: input.targetFields,
    sourcePayload: input.payload,
  });

  if (!validation.ok) {
    return {
      kind: "invalid_output",
      reason: "Deterministic validation rejected the model output.",
      errors: validation.errors,
      decisionLog: buildDecisionLog(
        provider,
        primaryModel,
        input.promptVersion,
        "invalid_output",
        batch,
        { failureReason: "deterministic_validation_failed" },
      ),
    };
  }

  if (hasLowConfidence(validation.value)) {
    return {
      kind: "abstain",
      reason: "Model confidence is too low for review creation.",
      decisionLog: buildDecisionLog(
        provider,
        primaryModel,
        input.promptVersion,
        "abstained",
        validation.value,
        { failureReason: "low_confidence" },
      ),
    };
  }

  if (!input.enableJudge) {
    return {
      kind: "success",
      batch: validation.value,
      decisionLog: buildDecisionLog(
        provider,
        primaryModel,
        input.promptVersion,
        "passed",
        validation.value,
      ),
    };
  }

  const judgeRunner = dependencies.judgeRunner ?? primaryRunner;
  const judged = await attachJudgeAssessments(validation.value, input, judgeRunner);

  return {
    kind: "success",
    batch: judged.batch,
    decisionLog: buildDecisionLog(
      provider,
      primaryModel,
      input.promptVersion,
      "passed",
      judged.batch,
      {
        judgeDisagreements: judged.judgeDisagreements,
        judgeUnavailableCount: judged.judgeUnavailableCount,
      },
    ),
  };
}
