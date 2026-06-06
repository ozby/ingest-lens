import { NoObjectGeneratedError } from "ai";
import type { MappingSuggestionBatch } from "@repo/types";
import type {
  MappingDecisionLog,
  MappingTelemetry,
  StructuredRunner,
  SuggestMappingsInput,
  SuggestMappingsResult,
} from "./aiMappingAdapter";
import type { ResolvedOpts } from "./aiMappingRunnerSupport";
import { MappingSuggestionBatchSchema } from "./schemas";
import { ModelTimeoutError, runWithRetry, sleep, withTimeout } from "./aiMappingRetry";
import { validateMappingSuggestionBatch } from "./validators";

export type BatchFetchResult =
  | { ok: true; batch: MappingSuggestionBatch; telemetry: MappingTelemetry }
  | { ok: false; result: SuggestMappingsResult };

export async function fetchBatch(
  primaryRunner: StructuredRunner,
  provider: MappingDecisionLog["provider"],
  input: SuggestMappingsInput,
  opts: ResolvedOpts,
  promptText: string,
  helpers: {
    buildDecisionLog: (
      provider: MappingDecisionLog["provider"],
      model: string,
      promptVersion: string,
      validationOutcome: MappingDecisionLog["validationOutcome"],
      batch?: MappingSuggestionBatch,
      overrides?: {
        failureReason?: string;
        judgeDisagreements?: number;
        judgeUnavailableCount?: number;
      },
    ) => MappingDecisionLog;
    createMappingValidationOptions: (input: SuggestMappingsInput) => {
      allowedTargetFields: readonly string[];
      sourcePayload: unknown;
    };
  },
): Promise<BatchFetchResult> {
  const startedAt = Date.now();
  try {
    const batch = (await runWithRetry(
      (attempt) =>
        withTimeout(
          (abortSignal) =>
            primaryRunner<MappingSuggestionBatch>({
              modelId: opts.primaryModel,
              prompt: promptText,
              schema: MappingSuggestionBatchSchema,
              schemaName: "MappingSuggestionBatch",
              schemaDescription:
                "Structured mapping suggestions for a deterministic intake workflow.",
              validate: (value) =>
                validateMappingSuggestionBatch(
                  value,
                  helpers.createMappingValidationOptions(input),
                ),
              maxRetries: 0,
              abortSignal,
            }) as Promise<MappingSuggestionBatch>,
          opts.timeoutMs,
          `Primary model attempt ${attempt}`,
        ),
      { maxAttempts: opts.primaryMaxAttempts, retryDelayMs: opts.retryDelayMs, sleep },
    )) as MappingSuggestionBatch;
    const endedAt = Date.now();
    const telemetry: MappingTelemetry = {
      model: opts.primaryModel,
      promptText,
      startedAt,
      endedAt,
      durationMs: endedAt - startedAt,
      outputText: JSON.stringify(batch),
    };
    return { ok: true, batch, telemetry };
  } catch (error) {
    const endedAt = Date.now();
    const baseTelemetry: MappingTelemetry = {
      model: opts.primaryModel,
      promptText,
      startedAt,
      endedAt,
      durationMs: endedAt - startedAt,
      outputText: "",
    };
    if (NoObjectGeneratedError.isInstance(error)) {
      return {
        ok: false,
        result: {
          kind: "invalid_output",
          reason: "Model output did not satisfy the mapping contract.",
          errors: [error.message],
          decisionLog: helpers.buildDecisionLog(
            provider,
            opts.primaryModel,
            input.promptVersion,
            "invalid_output",
            undefined,
            { failureReason: "no_object_generated" },
          ),
          telemetry: baseTelemetry,
        },
      };
    }
    return {
      ok: false,
      result: {
        kind: "runtime_failure",
        reason: error instanceof Error ? error.message : "Primary model execution failed.",
        decisionLog: helpers.buildDecisionLog(
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
        telemetry: baseTelemetry,
      },
    };
  }
}
