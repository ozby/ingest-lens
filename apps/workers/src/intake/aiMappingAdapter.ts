import { NoObjectGeneratedError, generateObject, jsonSchema } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import type { JudgeAssessment, MappingSuggestionBatch } from "@repo/types";
import type { Env } from "../db/client";
import { createDeterministicFallbackBatch } from "./contracts";
import { JudgeAssessmentSchema, MappingSuggestionBatchSchema } from "./schemas";
import { validateJudgeAssessment, validateMappingSuggestionBatch } from "./validators";

export const DEFAULT_PRIMARY_MODEL = "@cf/meta/llama-3.1-8b-instruct";
export const DEFAULT_JUDGE_MODEL = "@cf/meta/llama-3.1-8b-instruct";
export const DEFAULT_MAPPING_PROMPT_VERSION = "payload-mapper-v1";
// Values between LOW_CONFIDENCE_THRESHOLD and AUTO_HEAL_THRESHOLD (0.8 default)
// return kind:"success" from suggestMappings() but fall through to pending_review
// (below AUTO_HEAL_THRESHOLD). Only confidence ≥ AUTO_HEAL_THRESHOLD triggers auto-heal.
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
  env?: Pick<Env, "AI" | "LOW_CONFIDENCE_THRESHOLD">;
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

function hasLowConfidence(batch: MappingSuggestionBatch, threshold: number): boolean {
  return (
    batch.overallConfidence < threshold ||
    batch.suggestions.some((suggestion) => suggestion.confidence < threshold)
  );
}

function createMappingValidationOptions(input: SuggestMappingsInput) {
  return {
    allowedTargetFields: input.targetFields,
    sourcePayload: input.payload,
  };
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
  const assessedSuggestions = await Promise.all(
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
          return {
            suggestion,
            judgeDisagreed: false,
            judgeUnavailable: true,
          };
        }

        return {
          suggestion: {
            ...suggestion,
            judgeAssessment: validation.value,
          },
          judgeDisagreed: validation.value.verdict !== "agree",
          judgeUnavailable: false,
        };
      } catch {
        return {
          suggestion,
          judgeDisagreed: false,
          judgeUnavailable: true,
        };
      }
    }),
  );

  const judgeDisagreements = assessedSuggestions.filter((result) => result.judgeDisagreed).length;
  const judgeUnavailableCount = assessedSuggestions.filter(
    (result) => result.judgeUnavailable,
  ).length;

  return {
    batch: {
      ...batch,
      suggestions: assessedSuggestions.map((result) => result.suggestion),
    },
    judgeDisagreements,
    judgeUnavailableCount,
  };
}

interface ResolvedOpts {
  primaryModel: string;
  timeoutMs: number;
  primaryMaxAttempts: number;
  retryDelayMs: number;
}

function resolveDependencyOpts(
  input: SuggestMappingsInput,
  dependencies: SuggestMappingsDependencies,
): ResolvedOpts {
  return {
    primaryModel: input.primaryModel ?? DEFAULT_PRIMARY_MODEL,
    timeoutMs: dependencies.timeoutMs ?? DEFAULT_MODEL_TIMEOUT_MS,
    primaryMaxAttempts: dependencies.primaryMaxAttempts ?? DEFAULT_PRIMARY_MAX_ATTEMPTS,
    retryDelayMs: dependencies.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
  };
}

type RunnerAcquireResult =
  | { ok: true; runner: StructuredRunner; provider: MappingDecisionLog["provider"] }
  | { ok: false; result: SuggestMappingsResult };

function acquirePrimaryRunner(
  input: SuggestMappingsInput,
  dependencies: SuggestMappingsDependencies,
  primaryModel: string,
): RunnerAcquireResult {
  const provider: MappingDecisionLog["provider"] = dependencies.primaryRunner
    ? "test-runner"
    : "workers-ai";
  try {
    const runner =
      dependencies.primaryRunner ?? createWorkersStructuredRunner(dependencies.env ?? {});
    return { ok: true, runner, provider };
  } catch (error) {
    const fallbackBatch = createDeterministicFallbackBatch(input);
    if (fallbackBatch) {
      return { ok: true, runner: async () => fallbackBatch, provider: "test-runner" };
    }
    const reason = error instanceof Error ? error.message : "Workers AI binding is unavailable";
    return {
      ok: false,
      result: {
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
      },
    };
  }
}

type BatchFetchResult =
  | { ok: true; batch: MappingSuggestionBatch }
  | { ok: false; result: SuggestMappingsResult };

async function fetchBatch(
  primaryRunner: StructuredRunner,
  provider: MappingDecisionLog["provider"],
  input: SuggestMappingsInput,
  opts: ResolvedOpts,
): Promise<BatchFetchResult> {
  try {
    const batch = (await runWithRetry(
      (attempt) =>
        withTimeout(
          (abortSignal) =>
            primaryRunner<MappingSuggestionBatch>({
              modelId: opts.primaryModel,
              prompt: buildMappingPrompt(input),
              schema: MappingSuggestionBatchSchema,
              schemaName: "MappingSuggestionBatch",
              schemaDescription:
                "Structured mapping suggestions for a deterministic intake workflow.",
              validate: (value) =>
                validateMappingSuggestionBatch(value, createMappingValidationOptions(input)),
              maxRetries: 0,
              abortSignal,
            }) as Promise<MappingSuggestionBatch>,
          opts.timeoutMs,
          `Primary model attempt ${attempt}`,
        ),
      { maxAttempts: opts.primaryMaxAttempts, retryDelayMs: opts.retryDelayMs, sleep },
    )) as MappingSuggestionBatch;
    return { ok: true, batch };
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      return {
        ok: false,
        result: {
          kind: "invalid_output",
          reason: "Model output did not satisfy the mapping contract.",
          errors: [error.message],
          decisionLog: buildDecisionLog(
            provider,
            opts.primaryModel,
            input.promptVersion,
            "invalid_output",
            undefined,
            { failureReason: "no_object_generated" },
          ),
        },
      };
    }
    return {
      ok: false,
      result: {
        kind: "runtime_failure",
        reason: error instanceof Error ? error.message : "Primary model execution failed.",
        decisionLog: buildDecisionLog(
          provider,
          opts.primaryModel,
          input.promptVersion,
          "runtime_failure",
          undefined,
          {
            failureReason:
              error instanceof ModelTimeoutError ? "primary_model_timeout" : "primary_model_failed",
          },
        ),
      },
    };
  }
}

export async function suggestMappings(
  input: SuggestMappingsInput,
  dependencies: SuggestMappingsDependencies = {},
): Promise<SuggestMappingsResult> {
  const opts = resolveDependencyOpts(input, dependencies);

  const threshold =
    typeof dependencies.env?.LOW_CONFIDENCE_THRESHOLD === "string"
      ? Number(dependencies.env.LOW_CONFIDENCE_THRESHOLD)
      : LOW_CONFIDENCE_THRESHOLD;

  const runnerResult = acquirePrimaryRunner(input, dependencies, opts.primaryModel);
  if (!runnerResult.ok) return runnerResult.result;
  const { runner: primaryRunner, provider } = runnerResult;

  const batchResult = await fetchBatch(primaryRunner, provider, input, opts);
  if (!batchResult.ok) return batchResult.result;

  const validation = validateMappingSuggestionBatch(
    batchResult.batch,
    createMappingValidationOptions(input),
  );

  if (!validation.ok) {
    return {
      kind: "invalid_output",
      reason: "Deterministic validation rejected the model output.",
      errors: validation.errors,
      decisionLog: buildDecisionLog(
        provider,
        opts.primaryModel,
        input.promptVersion,
        "invalid_output",
        batchResult.batch,
        { failureReason: "deterministic_validation_failed" },
      ),
    };
  }

  if (hasLowConfidence(validation.value, threshold)) {
    return {
      kind: "abstain",
      reason: "Model confidence is too low for review creation.",
      decisionLog: buildDecisionLog(
        provider,
        opts.primaryModel,
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
        opts.primaryModel,
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
      opts.primaryModel,
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
