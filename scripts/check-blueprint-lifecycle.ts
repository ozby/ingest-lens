#!/usr/bin/env bun

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const blueprintsRoot = join(repoRoot, "blueprints");
const lifecycleDirectories = [
  "draft",
  "planned",
  "parked",
  "in-progress",
  "completed",
  "archived",
] as const;

function parseFrontmatter(contents: string): Record<string, string> | null {
  if (!contents.startsWith("---\n")) {
    return null;
  }

  const endIndex = contents.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    return null;
  }

  const frontmatterBlock = contents.slice(4, endIndex);
  const fields: Record<string, string> = {};

  for (const line of frontmatterBlock.split(/\r?\n/u)) {
    const match = line.match(/^([a-z_]+):\s*(.+)$/u);
    if (!match) continue;
    fields[match[1]] = match[2].replace(/^['"]|['"]$/gu, "").trim();
  }

  return fields;
}

function main(): void {
  const failures: string[] = [];

  for (const lifecycleDirectory of lifecycleDirectories) {
    const lifecyclePath = join(blueprintsRoot, lifecycleDirectory);
    const entries = readdirSync(lifecyclePath, { withFileTypes: true }).filter((entry) =>
      entry.isDirectory(),
    );

    for (const entry of entries) {
      const overviewPath = join(lifecyclePath, entry.name, "_overview.md");
      try {
        const contents = readFileSync(overviewPath, "utf8");
        const frontmatter = parseFrontmatter(contents);
        const relativePath = relative(repoRoot, overviewPath);

        if (!frontmatter) {
          failures.push(`${relativePath} is missing YAML frontmatter.`);
          continue;
        }

        if (frontmatter.status !== lifecycleDirectory) {
          failures.push(
            `${relativePath} status ${frontmatter.status ?? "missing"} does not match lifecycle directory ${lifecycleDirectory}.`,
          );
        }
      } catch (error) {
        failures.push(`${relative(repoRoot, overviewPath)} is missing required _overview.md.`);
      }
    }
  }

  if (failures.length > 0) {
    console.error("Blueprint lifecycle check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Blueprint lifecycle check passed.");
}

main();
