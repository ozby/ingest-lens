import {
  spawnSync,
  type SpawnSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

export interface CommandResult extends SpawnSyncReturns<string> {
  combinedOutput: string;
}

function resolvePnpmCommand(
  args: readonly string[],
  cwd: string | URL,
): { command: string; args: string[] } {
  const cwdPath = typeof cwd === "string" ? cwd : fileURLToPath(cwd);
  if (args[0] === "exec" && args[1] === "vitest") {
    return {
      command: path.join(cwdPath, "node_modules/.bin/vitest"),
      args: args.slice(2),
    };
  }

  if (args[0] === "exec" && args[1] === "playwright") {
    return {
      command: path.join(cwdPath, "node_modules/.bin/playwright"),
      args: args.slice(2),
    };
  }

  if (args[0] === "run") {
    return {
      command: "bun",
      args: ["run", ...args.slice(1)],
    };
  }

  return {
    command: "bun",
    args: ["run", ...args],
  };
}

export function runCommand(
  command: string,
  args: readonly string[],
  options: Omit<SpawnSyncOptionsWithStringEncoding, "encoding"> = {},
): CommandResult {
  const cwd = options.cwd ?? repoRoot;
  const resolved =
    command === "pnpm" ? resolvePnpmCommand(args, cwd) : { command, args: [...args] };

  const result = spawnSync(resolved.command, resolved.args, {
    cwd,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });

  return {
    ...result,
    combinedOutput: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}
