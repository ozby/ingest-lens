import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { resolveAgentKitCliEntry, routeInvocation, runWebpressoCli } from "./run-webpresso-cli";

describe("run-webpresso-cli", () => {
  it("declares @webpresso/agent-kit in the root devDependencies because the wrapper executes it at postinstall", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "..", "package.json"), "utf8"),
    ) as {
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.devDependencies?.["@webpresso/agent-kit"]).toBe("catalog:");
    expect(packageJson.devDependencies?.["node-addon-api"]).toBe("^8.5.0");
  });

  it("skips gstack during postinstall so project bootstrap does not fail on global gstack checkout health", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "..", "package.json"), "utf8"),
    ) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.postinstall).toContain("AK_SKIP_GSTACK=1");
  });

  it("allows @webpresso/agent-kit build scripts in pnpm-workspace because install runs agent setup", () => {
    const workspaceYaml = readFileSync(
      resolve(import.meta.dirname, "..", "pnpm-workspace.yaml"),
      "utf8",
    );

    expect(workspaceYaml).toContain('"@webpresso/agent-kit": true');
    expect(workspaceYaml).not.toContain("set this to true or false");
  });

  it("resolves the agent-kit CLI entry from the installed package.json", () => {
    const entry = resolveAgentKitCliEntry(
      () => "/repo/node_modules/@webpresso/agent-kit/package.json",
    );

    expect(entry).toBe("/repo/node_modules/@webpresso/agent-kit/src/cli/cli.ts");
  });

  it("strips the legacy `agent` prefix and routes the rest to agent-kit", () => {
    const resolvePackageJson = () => "/repo/node_modules/@webpresso/agent-kit/package.json";

    expect(routeInvocation(["agent", "audit", "catalog-drift"], resolvePackageJson)).toEqual({
      command: "/repo/node_modules/@webpresso/agent-kit/src/cli/cli.ts",
      args: ["audit", "catalog-drift"],
    });
  });

  it("passes non-`agent` roots through to agent-kit unchanged", () => {
    const resolvePackageJson = () => "/repo/node_modules/@webpresso/agent-kit/package.json";

    expect(routeInvocation(["blueprint", "audit", "--all"], resolvePackageJson)).toEqual({
      command: "/repo/node_modules/@webpresso/agent-kit/src/cli/cli.ts",
      args: ["blueprint", "audit", "--all"],
    });
  });

  it("spawns the resolved agent-kit entrypoint with inherited stdio", () => {
    const spawn = vi.fn(() => ({
      status: 0,
      pid: 1,
      output: [],
      stdout: Buffer.alloc(0),
      stderr: Buffer.alloc(0),
      signal: null,
    }));
    const resolvePackageJson = () => "/repo/node_modules/@webpresso/agent-kit/package.json";

    const exitCode = runWebpressoCli(["agent", "audit", "catalog-drift"], {
      resolvePackageJson,
      spawn,
      env: { PATH: "/bin" },
    });

    expect(exitCode).toBe(0);
    expect(spawn).toHaveBeenCalledWith(
      "/repo/node_modules/@webpresso/agent-kit/src/cli/cli.ts",
      ["audit", "catalog-drift"],
      {
        env: { PATH: "/bin" },
        stdio: "inherit",
      },
    );
  });
});
