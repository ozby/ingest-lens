#!/usr/bin/env bun
// Runs Stryker only on packages changed vs. the base branch.
// Exit 1 if any package fails its break threshold.
import { execSync } from "node:child_process";
import process from "node:process";

const base = process.env.GITHUB_BASE_REF ?? "main";
const changed = execSync(`git diff --name-only origin/${base}...HEAD`)
  .toString()
  .trim()
  .split("\n")
  .filter(Boolean);

const affectedPkgs = new Set<string>();
for (const file of changed) {
  const match = file.match(/^(apps\/[^/]+|packages\/[^/]+)\//);
  if (match) affectedPkgs.add(match[1]);
}

if (affectedPkgs.size === 0) {
  console.log("No affected packages — skipping mutation.");
  process.exit(0);
}

for (const pkg of affectedPkgs) {
  try {
    execSync(`pnpm --filter ./${pkg} mutation --if-present`, {
      stdio: "inherit",
    });
  } catch {
    process.exit(1);
  }
}
