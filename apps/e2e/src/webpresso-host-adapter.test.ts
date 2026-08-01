import { describe, expect, it } from "vitest";

import { webpressoE2eHostAdapter } from "./webpresso-host-adapter.ts";

describe("webpresso-host-adapter", () => {
  it("routes foundation through the repo-owned e2e-with-neon orchestrator", () => {
    const [batch] = webpressoE2eHostAdapter.buildExecutionPlan({ suite: "foundation" });

    expect(batch.batchKey).toBe("foundation");
    expect(batch.runs).toEqual([
      expect.objectContaining({
        suiteId: "foundation",
        runner: "command",
        command: "bun",
        args: ["apps/e2e/scripts/e2e-with-neon.ts", "--suite", "foundation"],
      }),
    ]);
  });

  it("maps a root-level journey file back to the owning suite", () => {
    expect(
      webpressoE2eHostAdapter.resolveSuiteForFile("apps/e2e/journeys/worker-health.e2e.ts"),
    ).toEqual({
      normalizedPath: "apps/e2e/journeys/worker-health.e2e.ts",
      suiteId: "foundation",
    });
  });
});
