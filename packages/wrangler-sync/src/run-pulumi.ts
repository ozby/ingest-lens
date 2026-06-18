import { execSync } from "node:child_process";

/**
 * Run `pulumi stack output --json --stack <stackName>` and return the parsed
 * output map.
 *
 * Throws if the command exits non-zero.
 */
export function runPulumiStackOutput(stackName: string): Record<string, string> {
  const raw = execSync(`pulumi stack output --json --stack ${stackName}`, {
    encoding: "utf8",
  });
  return JSON.parse(raw) as Record<string, string>;
}
