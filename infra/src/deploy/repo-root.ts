import { existsSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";

export function findRepoRoot(start = dirname(fileURLToPath(import.meta.url))): string {
  let current = start;
  const { root } = parse(current);

  while (true) {
    if (
      existsSync(join(current, "package.json")) &&
      existsSync(join(current, "pnpm-workspace.yaml"))
    ) {
      return current;
    }
    if (current === root) {
      throw new Error(`Could not find repository root from ${start}`);
    }
    current = dirname(current);
  }
}

export function resolveWorkspaceBinary(repoRoot: string, binaryName: string): string {
  return join(repoRoot, "node_modules", ".bin", binaryName);
}

export function resolveVpCommand(repoRoot: string): string {
  return resolveWorkspaceBinary(repoRoot, "vp");
}
