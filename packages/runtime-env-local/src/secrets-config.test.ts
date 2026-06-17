import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { hasSecretsConfig, readSecretsConfig } from "./secrets-config";

const tempDirs: string[] = [];

function makeTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "runtime-env-local-"));
  tempDirs.push(dir);
  execFileSync("git", ["init"], { cwd: dir, stdio: "ignore" });
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("secrets-config", () => {
  it("falls back to the committed .webpresso secrets config when the git-common-dir file is absent", () => {
    const repoDir = makeTempRepo();
    mkdirSync(join(repoDir, ".webpresso"), { recursive: true });
    writeFileSync(
      join(repoDir, ".webpresso", "secrets.config.json"),
      JSON.stringify({ manager: "doppler", projectId: "node-pubsub" }),
    );

    expect(hasSecretsConfig(repoDir)).toBe(true);
    expect(readSecretsConfig(repoDir)).toEqual({
      manager: "doppler",
      projectId: "node-pubsub",
    });
  });
});
