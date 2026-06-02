#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import process from "node:process";

import { findRepoRoot } from "./repo-root";

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, args, { cwd, env, shell: false, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? 1}`);
  }
}

const repoRoot = findRepoRoot();
const releaseVersion = readArg("--release-version") ?? process.env.RELEASE_VERSION;
run(
  "bun",
  [
    join(repoRoot, "infra", "src", "deploy", "deploy.ts"),
    "prd",
    "--release-version",
    releaseVersion ?? "",
  ],
  join(repoRoot, "infra"),
  {
    ...process.env,
    RELEASE_VERSION: releaseVersion,
  },
);
