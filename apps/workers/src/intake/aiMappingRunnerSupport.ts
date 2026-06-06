import { generateObject, jsonSchema } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import type { Env } from "../db/client";
import type {
  StructuredRunner,
  SuggestMappingsDependencies,
  SuggestMappingsInput,
} from "./aiMappingAdapter";

export interface ResolvedOpts {
  primaryModel: string;
  timeoutMs: number;
  primaryMaxAttempts: number;
  retryDelayMs: number;
}

export function resolveDependencyOpts(
  input: SuggestMappingsInput,
  dependencies: SuggestMappingsDependencies,
  defaults: {
    defaultPrimaryModel: string;
    defaultTimeoutMs: number;
    defaultPrimaryMaxAttempts: number;
    defaultRetryDelayMs: number;
  },
): ResolvedOpts {
  return {
    primaryModel: input.primaryModel ?? defaults.defaultPrimaryModel,
    timeoutMs: dependencies.timeoutMs ?? defaults.defaultTimeoutMs,
    primaryMaxAttempts: dependencies.primaryMaxAttempts ?? defaults.defaultPrimaryMaxAttempts,
    retryDelayMs: dependencies.retryDelayMs ?? defaults.defaultRetryDelayMs,
  };
}

export function createWorkersStructuredRunner(env: Pick<Env, "AI">): StructuredRunner {
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
        schemaName: options.schemaName,
        schemaDescription: options.schemaDescription,
      }),
    });

    return result.object;
  };
}

export interface AcquireRunnerDeps {
  createWorkersStructuredRunner: (env: Pick<Env, "AI">) => StructuredRunner;
  createDeterministicFallbackBatch: (
    input: SuggestMappingsInput,
  ) => Awaited<ReturnType<typeof import("./contracts").createDeterministicFallbackBatch>>;
  buildDecisionLog: (
    provider: "workers-ai" | "test-runner",
    model: string,
    promptVersion: string,
    validationOutcome: "passed" | "abstained" | "invalid_output" | "runtime_failure",
    batch?: import("@repo/types").MappingSuggestionBatch,
    overrides?: {
      failureReason?: string;
      judgeDisagreements?: number;
      judgeUnavailableCount?: number;
    },
  ) => {
    provider: "workers-ai" | "test-runner";
    model: string;
    promptVersion: string;
    validationOutcome: "passed" | "abstained" | "invalid_output" | "runtime_failure";
    confidence: {
      average: number;
      maximum: number;
      minimum: number;
      overall: number;
    };
    failureReason?: string;
    judgeDisagreements: number;
    judgeUnavailableCount: number;
  };
}

export type RunnerAcquireResultLike =
  | { ok: true; runner: StructuredRunner; provider: "workers-ai" | "test-runner" }
  | {
      ok: false;
      result: {
        kind: "abstain";
        reason: string;
        decisionLog: ReturnType<AcquireRunnerDeps["buildDecisionLog"]>;
        telemetry: {
          model: string;
          promptText: string;
          startedAt: number;
          endedAt: number;
          durationMs: number;
          outputText: string;
        };
      };
    };

export function acquirePrimaryRunner(
  input: SuggestMappingsInput,
  dependencies: SuggestMappingsDependencies,
  primaryModel: string,
  promptText: string,
  helpers: AcquireRunnerDeps,
): RunnerAcquireResultLike {
  const provider: "workers-ai" | "test-runner" = dependencies.primaryRunner
    ? "test-runner"
    : "workers-ai";
  try {
    const runner =
      dependencies.primaryRunner ?? helpers.createWorkersStructuredRunner(dependencies.env ?? {});
    return { ok: true, runner, provider };
  } catch (error) {
    const fallbackBatch = helpers.createDeterministicFallbackBatch(input);
    if (fallbackBatch) {
      return { ok: true, runner: async () => fallbackBatch, provider: "test-runner" };
    }
    const reason = error instanceof Error ? error.message : "Workers AI binding is unavailable";
    const now = Date.now();
    return {
      ok: false,
      result: {
        kind: "abstain",
        reason,
        decisionLog: helpers.buildDecisionLog(
          provider,
          primaryModel,
          input.promptVersion,
          "abstained",
          undefined,
          { failureReason: "ai_binding_missing" },
        ),
        telemetry: {
          model: primaryModel,
          promptText,
          startedAt: now,
          endedAt: now,
          durationMs: 0,
          outputText: "",
        },
      },
    };
  }
}
