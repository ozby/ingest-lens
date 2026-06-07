#!/usr/bin/env bun
import { execSync } from "node:child_process";

function readChangedFiles(baseBranch: string): string[] {
  const changed = execSync(`git diff --name-only origin/${baseBranch}...HEAD`, {
    stdio: ["ignore", "pipe", "inherit"],
  })
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean);

  return changed;
}

function findAffectedPackages(files: string[]): string[] {
  const affected = new Set<string>();
  for (const file of files) {
    const match = file.match(/^(apps\/[^/]+|packages\/[^/]+)\//);
    if (match) affected.add(match[1]);
  }
  return [...affected];
}

export function runAffectedMutation(): number {
  const base = process.env.GITHUB_BASE_REF || "main";
  const changed = readChangedFiles(base);
  const affectedPackages = findAffectedPackages(changed);

  if (affectedPackages.length === 0) {
    console.log("No affected packages — skipping mutation.");
    return 0;
  }

  for (const pkg of affectedPackages) {
    try {
      execSync(`pnpm --filter ./${pkg} mutation --if-present`, { stdio: "inherit" });
    } catch {
      return 1;
    }
  }

  return 0;
}

process.exit(runAffectedMutation());
