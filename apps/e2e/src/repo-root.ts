import { existsSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";

function normalizeStartLocation(startLocation: string): string {
  return startLocation.startsWith("file:") ? fileURLToPath(startLocation) : startLocation;
}

export function findE2eRepoRoot(startLocation: string): string {
  let current = dirname(normalizeStartLocation(startLocation));
  const { root } = parse(current);

  while (true) {
    if (
      existsSync(join(current, "package.json")) &&
      existsSync(join(current, "pnpm-workspace.yaml"))
    ) {
      return current;
    }
    if (current === root) {
      throw new Error(`Could not find repository root from ${startLocation}`);
    }
    current = dirname(current);
  }
}

export function resolveFromRepoRoot(repoRoot: string, ...segments: string[]): string {
  return join(repoRoot, ...segments);
}

export function resolveWorkspaceBinary(repoRoot: string, binaryName: string): string {
  return resolveFromRepoRoot(repoRoot, "node_modules", ".bin", binaryName);
}

export function resolveVpCommand(repoRoot: string): string {
  return resolveWorkspaceBinary(repoRoot, "vp");
}
