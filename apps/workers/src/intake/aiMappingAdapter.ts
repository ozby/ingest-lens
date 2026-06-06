import type { MappingSuggestionBatch } from "@repo/types";
import type { Env } from "../db/client";
import { createDeterministicFallbackBatch } from "./contracts";
import {
  buildDecisionLog,
  createMappingValidationOptions,
  hasLowConfidence,
} from "./aiMappingDecision";
import { fetchBatch } from "./aiMappingFetch";
import { buildMappingPrompt } from "./aiMappingPrompts";
import {
  acquirePrimaryRunner,
  createWorkersStructuredRunner,
  resolveDependencyOpts,
} from "./aiMappingRunnerSupport";
import { buildSuccessResult } from "./aiMappingSuccess";
import { validateMappingSuggestionBatch } from "./validators";

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

export { buildMappingPrompt } from "./aiMappingPrompts";

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
  primaryPromptText?: string;
}

export type MappingTelemetry = {
  model: string;
  promptText: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  outputText: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};

export type SuggestMappingsResult =
  | {
      kind: "success";
      batch: MappingSuggestionBatch;
      decisionLog: MappingDecisionLog;
      telemetry: MappingTelemetry;
    }
  | {
      kind: "abstain";
      reason: string;
      decisionLog: MappingDecisionLog;
      telemetry: MappingTelemetry;
    }
  | {
      kind: "invalid_output";
      reason: string;
      errors: string[];
      decisionLog: MappingDecisionLog;
      telemetry: MappingTelemetry;
    }
  | {
      kind: "runtime_failure";
      reason: string;
      decisionLog: MappingDecisionLog;
      telemetry: MappingTelemetry;
    };

export async function suggestMappings(
  input: SuggestMappingsInput,
  dependencies: SuggestMappingsDependencies = {},
): Promise<SuggestMappingsResult> {
  const opts = resolveDependencyOpts(input, dependencies, {
    defaultPrimaryModel: DEFAULT_PRIMARY_MODEL,
    defaultTimeoutMs: DEFAULT_MODEL_TIMEOUT_MS,
    defaultPrimaryMaxAttempts: DEFAULT_PRIMARY_MAX_ATTEMPTS,
    defaultRetryDelayMs: DEFAULT_RETRY_DELAY_MS,
  });

  const threshold =
    typeof dependencies.env?.LOW_CONFIDENCE_THRESHOLD === "string"
      ? Number(dependencies.env.LOW_CONFIDENCE_THRESHOLD)
      : LOW_CONFIDENCE_THRESHOLD;

  const promptText = dependencies.primaryPromptText ?? buildMappingPrompt(input);

  const runnerResult = acquirePrimaryRunner(input, dependencies, opts.primaryModel, promptText, {
    createWorkersStructuredRunner,
    createDeterministicFallbackBatch,
    buildDecisionLog,
  });
  if (!runnerResult.ok) return runnerResult.result;
  const { runner: primaryRunner, provider } = runnerResult;

  const batchResult = await fetchBatch(primaryRunner, provider, input, opts, promptText, {
    buildDecisionLog,
    createMappingValidationOptions,
  });
  if (!batchResult.ok) return batchResult.result;

  const { batch: fetchedBatch, telemetry } = batchResult;

  const validation = validateMappingSuggestionBatch(
    fetchedBatch,
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
        fetchedBatch,
        { failureReason: "deterministic_validation_failed" },
      ),
      telemetry,
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
      telemetry,
    };
  }

  return buildSuccessResult(
    validation.value,
    input,
    dependencies,
    primaryRunner,
    provider,
    opts.primaryModel,
    telemetry,
    {
      buildDecisionLog,
      defaultJudgeModel: DEFAULT_JUDGE_MODEL,
    },
  );
}
