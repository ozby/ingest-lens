import { describe, expect, it } from "vitest";
import {
  createGoldenEvalBatch,
  evaluateMappings,
  type MappingEvalTask,
} from "../intake/evaluateMappings";

const baseTask: MappingEvalTask = {
  id: "eval-1",
  source_system: "ashby",
  target_contract_version: "v1",
  source_payload: {
    title: "Staff Software Engineer",
    apply_url: "https://jobs.example.com/demo",
  },
  target_fields: ["name", "post_url"],
  expected_mapping: {
    name: "title",
    post_url: "apply_url",
  },
  missing_fields: [],
  ambiguous_fields: [],
  split: "eval",
};

describe("evaluateMappings", () => {
  it("scores exact matches as a passing deterministic eval", () => {
    const report = evaluateMappings(
      [
        baseTask,
        { ...baseTask, id: "adv-1", split: "adversarial", expected_mapping: {} },
      ],
      (task) => createGoldenEvalBatch(task),
    );

    expect(report.pass).toBe(true);
    expect(report.evalWeightedScore).toBeGreaterThanOrEqual(0.75);
    expect(report.nonHallucinationRate).toBe(1);
  });

  it("fails the hard gate when a candidate hallucinates a source path", () => {
    const report = evaluateMappings(
      [baseTask, { ...baseTask, id: "adv-1", split: "adversarial", expected_mapping: {} }],
      (task) => ({
        ...createGoldenEvalBatch(task),
        suggestions: [
          {
            ...createGoldenEvalBatch(baseTask).suggestions[0],
            sourcePath: "/missing",
          },
        ],
      }),
    );

    expect(report.pass).toBe(false);
    expect(report.nonHallucinationRate).toBe(0);
  });

  it("penalizes missing-field and ambiguity mismatches", () => {
    const report = evaluateMappings(
      [
        {
          ...baseTask,
          id: "eval-2",
          missing_fields: ["department"],
          ambiguous_fields: ["location"],
        },
        { ...baseTask, id: "adv-1", split: "adversarial", expected_mapping: {} },
      ],
      (task) => {
        const batch = createGoldenEvalBatch(task);
        return {
          ...batch,
          missingRequiredFields: [],
          ambiguousTargetFields: [],
        };
      },
    );

    const [taskResult] = report.taskResults;
    expect(taskResult.missingFieldScore).toBe(0);
    expect(taskResult.ambiguityScore).toBe(0);
  });
});
