import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  findE2eRepoRoot,
  resolveFromRepoRoot,
  resolveWorkspaceBinary,
  resolveVpCommand,
} from "./repo-root";

describe("e2e repo root helpers", () => {
  it("finds the ingest-lens repo root from the e2e script module location", () => {
    const repoRoot = findE2eRepoRoot(new URL("../scripts/e2e-with-neon.ts", import.meta.url).href);

    expect(existsSync(resolve(repoRoot, "pnpm-workspace.yaml"))).toBe(true);
    expect(existsSync(resolve(repoRoot, "package.json"))).toBe(true);
  });

  it("resolves worker migrations from the repo root instead of current cwd", () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

    expect(resolveFromRepoRoot(repoRoot, "apps", "workers", "src", "db", "migrations")).toBe(
      resolve(repoRoot, "apps", "workers", "src", "db", "migrations"),
    );
  });

  it("resolves workspace binaries from the repo root node_modules bin", () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

    expect(resolveWorkspaceBinary(repoRoot, "wrangler")).toBe(
      resolve(repoRoot, "node_modules", ".bin", "wrangler"),
    );
  });

  it("resolves the vp command from the repo root node_modules bin", () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

    expect(resolveVpCommand(repoRoot)).toBe(resolve(repoRoot, "node_modules", ".bin", "vp"));
  });
});
