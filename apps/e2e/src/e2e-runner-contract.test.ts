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

  it("keeps the client bundle proof repo-local instead of shelling through the global wp script surface", () => {
    const bundleJourney = readFileSync(
      resolve(REPO_ROOT, "apps", "e2e", "journeys", "client-route-code-splitting.e2e.ts"),
      "utf8",
    );

    expect(bundleJourney).not.toContain('runCommand("pnpm", ["client:bundle:check"]');
    expect(bundleJourney).not.toContain("client:bundle:check");
  });
});

it("does not forward Langfuse credentials to local wrangler e2e", () => {
  const runnerScript = readFileSync(
    resolve(REPO_ROOT, "apps", "e2e", "scripts", "e2e-with-neon.ts"),
    "utf8",
  );

  expect(runnerScript).toContain('LANGFUSE_PUBLIC_KEY: ""');
  expect(runnerScript).toContain('LANGFUSE_SECRET_KEY: ""');
  expect(runnerScript).toContain('testArgs.push("--workers", "1")');
  expect(runnerScript).not.toContain('["LANGFUSE_PUBLIC_KEY", secretEnv.LANGFUSE_PUBLIC_KEY]');
});
