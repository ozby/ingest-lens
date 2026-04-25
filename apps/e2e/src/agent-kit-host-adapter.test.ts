import { describe, expect, it } from "vitest";
import { nodePubsubE2eHostAdapter } from "./agent-kit-host-adapter";
import { listE2ESuites } from "./e2e-suite-manifest";

describe("nodePubsubE2eHostAdapter", () => {
  it("projects the host suite manifest without changing ids", () => {
    expect(nodePubsubE2eHostAdapter.listSuites().map((suite) => suite.id)).toEqual(
      listE2ESuites().map((suite) => suite.id),
    );
  });

  it("resolves suite ids, aliases, and file paths", () => {
    expect(nodePubsubE2eHostAdapter.resolveSuiteId("foundation")).toBe("foundation");
    expect(nodePubsubE2eHostAdapter.resolveSuiteId("identity")).toBe("auth");
    expect(nodePubsubE2eHostAdapter.resolveSuiteId("all")).toBe("full");
    expect(nodePubsubE2eHostAdapter.resolveSuiteId("missing")).toBeNull();

    expect(
      nodePubsubE2eHostAdapter.normalizeFilePath("apps/e2e/journeys/auth-session.e2e.ts"),
    ).toBe("journeys/auth-session.e2e.ts");

    expect(
      nodePubsubE2eHostAdapter.resolveSuiteForFile("apps/e2e/journeys/auth-session.e2e.ts"),
    ).toEqual({
      normalizedPath: "journeys/auth-session.e2e.ts",
      suiteId: "auth",
    });
  });

  it("builds a host-owned orchestration command", () => {
    expect(
      nodePubsubE2eHostAdapter.buildExecutionPlan?.({
        suite: "full",
        workers: "1",
      }),
    ).toEqual([
      {
        batchKey: "node-pubsub-e2e-host",
        envProfile: undefined,
        env: undefined,
        runs: [
          {
            suiteId: "full",
            batchKey: "node-pubsub-e2e-host",
            envProfile: undefined,
            runner: "command",
            logName: "node-pubsub-e2e-host",
            command: "pnpm",
            args: [
              "--dir",
              "apps/e2e",
              "run",
              "e2e:run",
              "--",
              "--suite",
              "full",
              "--workers",
              "1",
            ],
          },
        ],
      },
    ]);
  });
});
