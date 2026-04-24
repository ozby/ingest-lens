import type { MappingSuggestionBatch } from "@repo/types";
import { resolveSourcePath } from "./sourcePath";

export interface MappingEvalTask {
  id: string;
  source_system: string;
  target_contract_version: string;
  source_payload: Record<string, unknown>;
  target_fields: string[];
  expected_mapping: Record<string, string>;
  missing_fields: string[];
  ambiguous_fields: string[];
  split: string;
  notes?: string[];
}

export interface MappingEvalTaskResult {
  ambiguityScore: number;
  exactMatchScore: number;
  id: string;
  missingFieldScore: number;
  nonHallucinationPass: boolean;
  weightedScore: number;
}

export interface MappingEvalReport {
  adversarialWeightedScore: number;
  evalWeightedScore: number;
  nonHallucinationRate: number;
  pass: boolean;
  taskResults: MappingEvalTaskResult[];
}

function normalizeTaskPath(path: string): string {
  if (path.startsWith("/")) {
    return path;
  }

  return `/${path
    .replace(/\['([^']+)'\]/g, "/$1")
    .replace(/\[(\d+)\]/g, "/$1")
    .replace(/\./g, "/")}`;
}

function scoreSet(expected: string[], actual: string[]): number {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);

  if (expectedSet.size === 0 && actualSet.size === 0) {
    return 1;
  }

  const matches = [...actualSet].filter((value) => expectedSet.has(value)).length;
  if (matches === 0) {
    return 0;
  }

  const precision = matches / actualSet.size;
  const recall = matches / expectedSet.size;
  return (2 * precision * recall) / (precision + recall);
}

function scoreExactMapping(task: MappingEvalTask, batch: MappingSuggestionBatch): number {
  const expectedEntries = Object.entries(task.expected_mapping).map(
    ([targetField, sourcePath]) => `${targetField}:${normalizeTaskPath(sourcePath)}`,
  );
  const actualEntries = batch.suggestions.map(
    (suggestion) => `${suggestion.targetField}:${normalizeTaskPath(suggestion.sourcePath)}`,
  );

  return scoreSet(expectedEntries, actualEntries);
}

function scoreNonHallucination(task: MappingEvalTask, batch: MappingSuggestionBatch): boolean {
  return batch.suggestions.every(
    (suggestion) =>
      resolveSourcePath(task.source_payload, normalizeTaskPath(suggestion.sourcePath)).ok,
  );
}

function scoreCorrectAbstention(task: MappingEvalTask, batch: MappingSuggestionBatch): number {
  if (Object.keys(task.expected_mapping).length > 0) {
    return 1;
  }

  return batch.suggestions.length === 0 ? 1 : 0;
}

export function createGoldenEvalBatch(task: MappingEvalTask): MappingSuggestionBatch {
  return {
    mappingTraceId: `eval-${task.id}`,
    contractId: `eval-${task.id}`,
    contractVersion: task.target_contract_version,
    sourceSystem: task.source_system,
    promptVersion: "payload-mapper-v1",
    generatedAt: "2026-04-24T00:00:00.000Z",
    overallConfidence: 1,
    driftCategories: task.ambiguous_fields.length > 0 ? ["ambiguous_mapping"] : ["renamed_field"],
    missingRequiredFields: task.missing_fields,
    ambiguousTargetFields: task.ambiguous_fields,
    suggestions: Object.entries(task.expected_mapping).map(([targetField, sourcePath], index) => ({
      id: `${task.id}-suggestion-${index + 1}`,
      sourcePath: normalizeTaskPath(sourcePath),
      targetField,
      transformKind: "copy" as const,
      confidence: 1,
      explanation: "Deterministic golden mapping",
      evidenceSample: sourcePath,
      deterministicValidation: {
        isValid: true,
        validatedAt: "2026-04-24T00:00:00.000Z",
        errors: [],
      },
      reviewStatus: "approved" as const,
      replayStatus: "replayed" as const,
    })),
    summary: `Golden deterministic mapping for ${task.id}`,
  };
}

export function evaluateMappings(
  tasks: MappingEvalTask[],
  mapper: (task: MappingEvalTask) => MappingSuggestionBatch,
): MappingEvalReport {
  const taskResults = tasks.map((task) => {
    const batch = mapper(task);
    const exactMatchScore = scoreExactMapping(task, batch);
    const missingFieldScore = scoreSet(task.missing_fields, batch.missingRequiredFields);
    const ambiguityScore = scoreSet(task.ambiguous_fields, batch.ambiguousTargetFields);
    const nonHallucinationPass = scoreNonHallucination(task, batch);
    const correctAbstentionScore = scoreCorrectAbstention(task, batch);

    const weightedScore =
      exactMatchScore * 0.4 +
      missingFieldScore * 0.2 +
      ambiguityScore * 0.2 +
      (nonHallucinationPass ? 1 : 0) * 0.15 +
      correctAbstentionScore * 0.05;

    return {
      id: task.id,
      ambiguityScore,
      exactMatchScore,
      missingFieldScore,
      nonHallucinationPass,
      weightedScore,
    };
  });

  const evalTasks = taskResults.filter((result) => !result.id.startsWith("adv-"));
  const adversarialTasks = taskResults.filter((result) => result.id.startsWith("adv-"));
  const average = (results: MappingEvalTaskResult[]) =>
    results.length === 0
      ? 1
      : results.reduce((sum, result) => sum + result.weightedScore, 0) / results.length;

  const nonHallucinationRate =
    taskResults.length === 0
      ? 1
      : taskResults.filter((result) => result.nonHallucinationPass).length / taskResults.length;

  const evalWeightedScore = average(evalTasks);
  const adversarialWeightedScore = average(adversarialTasks);

  return {
    adversarialWeightedScore,
    evalWeightedScore,
    nonHallucinationRate,
    pass:
      evalWeightedScore >= 0.75 && adversarialWeightedScore >= 0.6 && nonHallucinationRate >= 0.75,
    taskResults,
  };
}
