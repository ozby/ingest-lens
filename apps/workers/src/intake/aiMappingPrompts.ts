import type { MappingSuggestionBatch } from "@repo/types";

export interface MappingPromptInput {
  payload: unknown;
  sourceSystem: string;
  contractId: string;
  contractVersion: string;
  promptVersion: string;
  targetFields: readonly string[];
}

export function buildMappingPrompt(input: MappingPromptInput): string {
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

export function buildJudgePrompt(
  input: MappingPromptInput,
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
