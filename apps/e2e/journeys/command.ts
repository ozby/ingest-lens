import {
  spawnSync,
  type SpawnSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from "node:child_process";
import { fileURLToPath } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

export interface CommandResult extends SpawnSyncReturns<string> {
  combinedOutput: string;
}

export function runCommand(
  command: string,
  args: readonly string[],
  options: Omit<SpawnSyncOptionsWithStringEncoding, "encoding"> = {},
): CommandResult {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
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
