import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface FixtureEnvelope {
  id: string;
  source_system: string;
  payload: Record<string, unknown>;
  source_url: string;
}

interface DemoFixtureEntry {
  id: string;
  sourceSystem: string;
  sourceUrl: string;
  contractHint: "job-posting-v1";
  summary: string;
  payload: Record<string, unknown>;
}

function getSummary(payload: Record<string, unknown>): string {
  const candidates = [payload.title, payload.name, payload.text];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return "Public demo fixture";
}

async function main(): Promise<void> {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(scriptDir, "..");
  const sourcePath = resolve(repoRoot, "data/payload-mapper/payloads/ats/open-apply-sample.jsonl");
  const outputPath = resolve(repoRoot, "apps/workers/src/intake/demoFixtures.ts");

  const contents = await readFile(sourcePath, "utf8");
  const fixtures: DemoFixtureEntry[] = contents
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as FixtureEnvelope)
    .map((fixture) => ({
      id: fixture.id,
      sourceSystem: fixture.source_system,
      sourceUrl: fixture.source_url,
      contractHint: "job-posting-v1" as const,
      summary: getSummary(fixture.payload),
      payload: fixture.payload,
    }));

  const output = `export interface DemoFixtureMetadata {
  id: string;
  sourceSystem: string;
  sourceUrl: string;
  contractHint: "job-posting-v1";
  summary: string;
}

export interface DemoFixtureDetail extends DemoFixtureMetadata {
  payload: Record<string, unknown>;
}

const DEMO_FIXTURES: DemoFixtureDetail[] = ${JSON.stringify(fixtures, null, 2)};

const DEMO_FIXTURE_INDEX = new Map(
  DEMO_FIXTURES.map((fixture) => [fixture.id, fixture] as const),
);

export function listDemoFixtures(): DemoFixtureMetadata[] {
  return DEMO_FIXTURES.map(({ payload: _payload, ...metadata }) => metadata);
}

export function getDemoFixtureById(
  fixtureId: string,
): DemoFixtureDetail | undefined {
  return DEMO_FIXTURE_INDEX.get(fixtureId);
}
`;

  await writeFile(outputPath, output);
  console.log(`Wrote ${fixtures.length} demo fixtures to ${outputPath}`);
}

await main();
