import { describe, expect, it } from "vitest";
import { buildJourneyRunCommand, parseRunE2eArgs, resolveJourneySelection } from "./run-e2e";

describe("run-e2e", () => {
  it("parses supported CLI flags", () => {
    expect(
      parseRunE2eArgs([
        "--suite",
        "auth",
        "--file",
        "apps/e2e/journeys/auth-session.e2e.ts",
        "--workers",
        "2",
        "--",
        "--reporter=verbose",
      ]),
    ).toEqual({
      suite: "auth",
      files: ["apps/e2e/journeys/auth-session.e2e.ts"],
      workers: "2",
      passthrough: ["--reporter=verbose"],
    });
  });

  it("defaults to the foundation suite", () => {
    expect(resolveJourneySelection({ files: [], passthrough: [] })).toEqual({
      suiteId: "foundation",
      files: ["journeys/worker-health.e2e.ts"],
    });
  });

  it("selects the fixed files for the requested suite", () => {
    expect(resolveJourneySelection({ suite: "messaging", files: [], passthrough: [] })).toEqual({
      suiteId: "messaging",
      files: ["journeys/queue-message-flow.e2e.ts", "journeys/topic-publish-flow.e2e.ts"],
    });

    expect(resolveJourneySelection({ suite: "branding", files: [], passthrough: [] })).toEqual({
      suiteId: "branding",
      files: ["journeys/ingestlens-branding.e2e.ts"],
    });
  });

  it("builds a vitest journey command from the selected suite", () => {
    expect(
      buildJourneyRunCommand({
        suite: "full",
        files: [],
        workers: "3",
        passthrough: ["--reporter=verbose"],
      }),
    ).toEqual({
      command: "pnpm",
      args: [
        "exec",
        "vitest",
        "run",
        "--config",
        "vitest.journeys.config.ts",
        "--poolOptions.threads.maxThreads",
        "3",
        "journeys/worker-health.e2e.ts",
        "journeys/auth-session.e2e.ts",
        "journeys/queue-message-flow.e2e.ts",
        "journeys/topic-publish-flow.e2e.ts",
        "journeys/ownership-hardening.e2e.ts",
        "journeys/intake-mapping-flow.e2e.ts",
        "journeys/public-fixture-demo-flow.e2e.ts",
        "journeys/client-route-code-splitting.e2e.ts",
        "journeys/ingestlens-branding.e2e.ts",
        "--reporter=verbose",
      ],
      suiteId: "full",
    });
  });
});
