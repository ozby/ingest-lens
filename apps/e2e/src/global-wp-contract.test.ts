import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, relativePath), "utf8")) as T;
}

describe("global wp contract", () => {
  it("uses global wp scripts while keeping agent-kit as a shared config dependency", () => {
    const packageJson = readJson<{
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    }>("package.json");

    expect(packageJson.devDependencies?.["@webpresso/agent-kit"]).toBe("catalog:");
    expect(packageJson.scripts?.["setup:agent"]).toBe("wp setup");
    expect(packageJson.scripts?.postinstall).toBe("wp setup");
    expect(JSON.stringify(packageJson.scripts ?? {})).not.toContain("run-webpresso-cli");
    expect(JSON.stringify(packageJson.scripts ?? {})).not.toContain("AK_SKIP_GSTACK");
  });

  it("marks the repo as global-install mode and routes OpenCode through wp mcp", () => {
    const agentKitRc = readJson<{ globalInstall?: boolean }>(".agent-kitrc.json");
    const opencode = readJson<{
      mcp?: Record<string, { command?: string[] }>;
    }>("opencode.json");

    expect(agentKitRc.globalInstall).toBe(true);
    expect(opencode.mcp?.["agent-kit"]?.command).toEqual(["wp", "mcp"]);
  });

  it("keeps contributor-facing entrypoints on the global wp surface", () => {
    const huskyPreCommit = readFileSync(resolve(REPO_ROOT, ".husky/pre-commit"), "utf8");
    const huskyCommitMsg = readFileSync(resolve(REPO_ROOT, ".husky/commit-msg"), "utf8");
    const e2eReadme = readFileSync(resolve(REPO_ROOT, "apps/e2e/README.md"), "utf8");

    expect(huskyPreCommit).toContain("wp audit guardrails");
    expect(huskyPreCommit).not.toContain("node_modules/.bin/wp");
    expect(huskyCommitMsg).toContain('wp audit commit-message --message-file "$1"');
    expect(huskyCommitMsg).not.toContain("node_modules/.bin/wp");
    expect(e2eReadme).toContain("wp e2e --suite foundation");
    expect(e2eReadme).not.toContain("webpresso agent e2e");
  });
});
