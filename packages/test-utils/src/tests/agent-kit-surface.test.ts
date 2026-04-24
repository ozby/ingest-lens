import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfiguredHostAdapter } from "@webpresso/agent-kit/e2e";

interface PackageManifest {
  exports?: Record<string, unknown>;
}

function readAgentKitManifest(): PackageManifest {
  const manifestPath = resolve(process.cwd(), "node_modules/@webpresso/agent-kit/package.json");

  return JSON.parse(readFileSync(manifestPath, "utf8")) as PackageManifest;
}

describe("@webpresso/agent-kit consumer surface", () => {
  it("ships the portable public test and e2e subpath exports", () => {
    const manifest = readAgentKitManifest();
    const exports = Object.keys(manifest.exports ?? {});

    expect(exports).toContain("./test");
    expect(exports).toContain("./e2e");
  });

  it("loads the repo-owned e2e host adapter from agent-kit.config.ts", async () => {
    const repoRoot = resolve(process.cwd());
    const loadedHostAdapter = await loadConfiguredHostAdapter(repoRoot);

    expect(loadedHostAdapter?.configPath).toBe(resolve(repoRoot, "agent-kit.config.ts"));
    expect(loadedHostAdapter?.exportName).toBe("agentKitE2eHostAdapter");
    expect(loadedHostAdapter?.adapter.resolveSuiteId("foundation")).toBe("foundation");
    expect(loadedHostAdapter?.adapter.resolveSuiteId("pubsub")).toBe("foundation");
    expect(loadedHostAdapter?.adapter.buildExecutionPlan?.({ suite: "foundation" })).toEqual([
      {
        batchKey: "node-pubsub-e2e-host",
        envProfile: undefined,
        env: {
          E2E_BASE_URL: "http://127.0.0.1:8787",
        },
        runs: [
          expect.objectContaining({
            suiteId: "foundation",
            command: "pnpm",
          }),
        ],
      },
    ]);
  });
});
