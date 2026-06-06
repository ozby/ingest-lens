import type { JudgeAssessment, MappingSuggestionBatch } from "@repo/types";
import { buildJudgePrompt } from "./aiMappingPrompts";
import { JudgeAssessmentSchema } from "./schemas";
import type { StructuredRunner, SuggestMappingsInput } from "./aiMappingAdapter";
import { validateJudgeAssessment } from "./validators";

export async function attachJudgeAssessments(
  batch: MappingSuggestionBatch,
  input: SuggestMappingsInput,
  runner: StructuredRunner,
  defaultJudgeModel: string,
): Promise<{
  batch: MappingSuggestionBatch;
  judgeDisagreements: number;
  judgeUnavailableCount: number;
}> {
  const assessedSuggestions = await Promise.all(
    batch.suggestions.map(async (suggestion) => {
      try {
        const rawAssessment = await runner<JudgeAssessment>({
          modelId: input.judgeModel ?? defaultJudgeModel,
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
