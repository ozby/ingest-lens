import type { MappingSuggestionBatch } from "@repo/types";
import { attachJudgeAssessments } from "./aiMappingJudge";
import type {
  MappingDecisionLog,
  MappingTelemetry,
  StructuredRunner,
  SuggestMappingsDependencies,
  SuggestMappingsInput,
  SuggestMappingsResult,
} from "./aiMappingAdapter";

export async function buildSuccessResult(
  validBatch: MappingSuggestionBatch,
  input: SuggestMappingsInput,
  dependencies: SuggestMappingsDependencies,
  primaryRunner: StructuredRunner,
  provider: MappingDecisionLog["provider"],
  primaryModel: string,
  telemetry: MappingTelemetry,
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
    defaultJudgeModel: string;
  },
): Promise<SuggestMappingsResult> {
  if (!input.enableJudge) {
    return {
      kind: "success",
      batch: validBatch,
      decisionLog: helpers.buildDecisionLog(
        provider,
        primaryModel,
        input.promptVersion,
        "passed",
        validBatch,
      ),
      telemetry,
    };
  }

  const judgeRunner = dependencies.judgeRunner ?? primaryRunner;
  const judged = await attachJudgeAssessments(
    validBatch,
    input,
    judgeRunner,
    helpers.defaultJudgeModel,
  );

  return {
    kind: "success",
    batch: judged.batch,
    decisionLog: helpers.buildDecisionLog(
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
    telemetry,
  };
}
