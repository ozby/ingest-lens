import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");

describe("repo-local e2e runner contract", () => {
  it("builds the client through a repo-local vite binary instead of the global wp surface", () => {
    const runnerScript = readFileSync(
      resolve(REPO_ROOT, "apps", "e2e", "scripts", "e2e-with-neon.ts"),
      "utf8",
    );

    expect(runnerScript).toMatch(
      /runCommandOrThrow\(\s*resolveWorkspaceBinary\(repoRoot,\s*"vite"\),\s*\[\s*"build"\s*\]/su,
    );
    expect(runnerScript).not.toMatch(/runCommandOrThrow\(\s*"bun",\s*\[\s*"run",\s*"build"/su);
  });
});
