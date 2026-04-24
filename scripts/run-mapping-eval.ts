import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createGoldenEvalBatch,
  evaluateMappings,
  type MappingEvalTask,
} from "../apps/workers/src/intake/evaluateMappings";

async function loadTasks(relativePath: string): Promise<MappingEvalTask[]> {
  const contents = await readFile(resolve(process.cwd(), relativePath), "utf8");
  return contents
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as MappingEvalTask);
}

async function main(): Promise<void> {
  const [evalTasks, adversarialTasks] = await Promise.all([
    loadTasks("data/payload-mapper/mapping_tasks/eval.jsonl"),
    loadTasks("data/payload-mapper/mapping_tasks/adversarial.jsonl"),
  ]);

  const report = evaluateMappings(
    [...evalTasks, ...adversarialTasks],
    (task) => createGoldenEvalBatch(task),
  );

  const summary = {
    evalWeightedScore: Number(report.evalWeightedScore.toFixed(3)),
    adversarialWeightedScore: Number(report.adversarialWeightedScore.toFixed(3)),
    nonHallucinationRate: Number(report.nonHallucinationRate.toFixed(3)),
    pass: report.pass,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!report.pass) {
    process.exitCode = 1;
  }
}

await main();
