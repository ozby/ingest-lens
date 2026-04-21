#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();

// Legacy .omx plan surface — retained for backward compatibility.
const planDir = path.join(cwd, ".omx", "plans");
const contractDir = path.join(cwd, ".omx", "contracts");
const omxLifecycleDir = path.join(cwd, ".omx", "state", "lifecycle");

// Blueprint surface — see blueprints/README.md.
const blueprintsDir = path.join(cwd, "blueprints");
const lifecycleStates = [
  "planned",
  "in-progress",
  "parked",
  "completed",
  "archived",
] as const;

const failures: string[] = [];

function assert(condition: unknown, message: string): void {
  if (!condition) failures.push(message);
}

function readIfExists(file: string): string | null {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

function parseFrontmatter(
  markdown: string | null,
): Record<string, string> | null {
  if (!markdown?.startsWith("---\n")) return null;
  const end = markdown.indexOf("\n---\n", 4);
  if (end === -1) return null;
  const body = markdown.slice(4, end);
  const map: Record<string, string> = {};
  for (const line of body.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (match) map[match[1]] = match[2].replace(/^"(.*)"$/, "$1").trim();
  }
  return map;
}

// --- blueprint surface ---------------------------------------------------

if (fs.existsSync(blueprintsDir)) {
  for (const lifecycle of lifecycleStates) {
    const dir = path.join(blueprintsDir, lifecycle);
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const slug = entry.name;
      const overviewPath = path.join(dir, slug, "_overview.md");
      assert(
        fs.existsSync(overviewPath),
        `Blueprint ${lifecycle}/${slug} is missing _overview.md`,
      );
      const content = readIfExists(overviewPath);
      if (!content) continue;
      const fm = parseFrontmatter(content);
      assert(fm, `Blueprint ${lifecycle}/${slug} is missing frontmatter`);
      if (fm) {
        assert(
          fm.status === lifecycle,
          `Blueprint ${lifecycle}/${slug} has frontmatter status=${fm.status} but lives in ${lifecycle}/`,
        );
        assert(
          fm.type === "blueprint",
          `Blueprint ${lifecycle}/${slug} frontmatter must declare type: blueprint`,
        );
      }
    }
  }
} else {
  console.warn("Note: blueprints/ directory does not exist yet.");
}

// --- legacy .omx surface -------------------------------------------------

const hasLegacySurface =
  fs.existsSync(planDir) ||
  fs.existsSync(contractDir) ||
  fs.existsSync(omxLifecycleDir);

if (hasLegacySurface) {
  assert(fs.existsSync(planDir), "Missing .omx/plans directory");
  assert(fs.existsSync(contractDir), "Missing .omx/contracts directory");
  assert(
    fs.existsSync(omxLifecycleDir),
    "Missing .omx/state/lifecycle directory",
  );

  const contractPath = path.join(contractDir, "workspace-boundary-contract.md");
  const contractContent = readIfExists(contractPath);
  assert(contractContent, "Missing workspace boundary contract");
  if (contractContent) {
    for (const marker of [
      "# Workspace boundary contract",
      "## Workspace classifications",
    ]) {
      assert(
        contractContent.includes(marker),
        `workspace-boundary-contract.md is missing required marker: ${marker}`,
      );
    }
  }

  const prdFiles = fs.existsSync(planDir)
    ? fs.readdirSync(planDir).filter((file) => /^prd-.*\.md$/.test(file))
    : [];
  const testSpecFiles = fs.existsSync(planDir)
    ? fs.readdirSync(planDir).filter((file) => /^test-spec-.*\.md$/.test(file))
    : [];
  const lifecycleFiles = fs.existsSync(omxLifecycleDir)
    ? fs.readdirSync(omxLifecycleDir).filter((file) => file.endsWith(".json"))
    : [];

  assert(
    prdFiles.length > 0,
    "Missing at least one PRD artifact under .omx/plans",
  );
  assert(
    testSpecFiles.length > 0,
    "Missing at least one test spec artifact under .omx/plans",
  );
  assert(
    lifecycleFiles.length > 0,
    "Missing at least one lifecycle artifact under .omx/state/lifecycle",
  );

  for (const file of prdFiles) {
    const content = readIfExists(path.join(planDir, file));
    assert(content?.includes("# PRD:"), `${file} is missing a PRD heading`);
  }

  for (const file of testSpecFiles) {
    const content = readIfExists(path.join(planDir, file));
    assert(
      content?.includes("# Test Spec:"),
      `${file} is missing a test spec heading`,
    );
  }

  for (const file of lifecycleFiles) {
    const lifecycleContent = readIfExists(path.join(omxLifecycleDir, file));
    if (!lifecycleContent) continue;
    try {
      const parsed = JSON.parse(lifecycleContent) as {
        slug?: unknown;
        status?: unknown;
        artifacts?: unknown;
      };
      assert(
        typeof parsed.slug === "string" && parsed.slug.length > 0,
        `Lifecycle state requires a slug (${file})`,
      );
      assert(
        typeof parsed.status === "string" && parsed.status.length > 0,
        `Lifecycle state requires a status (${file})`,
      );
      assert(
        typeof parsed.artifacts === "object" && parsed.artifacts !== null,
        `Lifecycle state requires an artifacts object (${file})`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`Lifecycle state JSON is invalid in ${file}: ${message}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Blueprint validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Blueprint validation passed.");
