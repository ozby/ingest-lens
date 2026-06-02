import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { collectForbiddenSecretFiles, isForbiddenSecretFile } from "./secret-file-policy.js";

describe("secret file policy", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = join(
      tmpdir(),
      `ingest-lens-secret-policy-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(repoRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("allows committed examples but rejects local env and dev vars files", () => {
    expect(isForbiddenSecretFile(".env.example")).toBe(false);
    expect(isForbiddenSecretFile(".env")).toBe(true);
    expect(isForbiddenSecretFile(".env.local")).toBe(true);
    expect(isForbiddenSecretFile(".dev.vars")).toBe(true);
    expect(isForbiddenSecretFile(".dev.vars.production")).toBe(true);
  });

  it("reports forbidden secret files while ignoring generated dependency trees", () => {
    mkdirSync(join(repoRoot, "apps", "workers"), { recursive: true });
    mkdirSync(join(repoRoot, "node_modules", "pkg"), { recursive: true });
    mkdirSync(join(repoRoot, ".git"), { recursive: true });

    writeFileSync(join(repoRoot, ".env.example"), "DOCUMENTED_ONLY=1\n");
    writeFileSync(join(repoRoot, "apps", "workers", ".env.local"), "SECRET=local\n");
    writeFileSync(join(repoRoot, "apps", "workers", ".dev.vars"), "SECRET=local\n");
    writeFileSync(join(repoRoot, "node_modules", "pkg", ".env"), "IGNORED=1\n");
    writeFileSync(join(repoRoot, ".git", ".dev.vars"), "IGNORED=1\n");

    expect(collectForbiddenSecretFiles(repoRoot)).toEqual([
      "apps/workers/.dev.vars",
      "apps/workers/.env.local",
    ]);
  });
});
