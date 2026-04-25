import { describe, expect, it } from "vitest";
import {
  createVitestStep,
  listE2ESuites,
  normalizeE2EPath,
  resolveE2ESuiteForFile,
  resolveE2ESuiteId,
} from "./e2e-suite-manifest";

describe("e2e-suite-manifest", () => {
  it("describes the available journey suites", () => {
    expect(listE2ESuites()).toEqual([
      {
        id: "foundation",
        aliases: ["pubsub", "smoke"],
        fileMatchers: ["journeys/worker-health.e2e.ts"],
        batchKey: "foundation",
        env: undefined,
        steps: [
          {
            runner: "vitest",
            logName: "foundation",
            configPath: "vitest.journeys.config.ts",
            fixedFiles: ["journeys/worker-health.e2e.ts"],
            fixedArgs: undefined,
            commandArgs: undefined,
            batchKey: "foundation",
            env: undefined,
          },
        ],
      },
      {
        id: "auth",
        aliases: ["identity"],
        fileMatchers: ["journeys/auth-session.e2e.ts"],
        batchKey: "auth",
        env: undefined,
        steps: [
          {
            runner: "vitest",
            logName: "auth",
            configPath: "vitest.journeys.config.ts",
            fixedFiles: ["journeys/auth-session.e2e.ts"],
            fixedArgs: undefined,
            commandArgs: undefined,
            batchKey: "auth",
            env: undefined,
          },
        ],
      },
      {
        id: "messaging",
        aliases: ["queue", "topic"],
        fileMatchers: ["journeys/queue-message-flow.e2e.ts", "journeys/topic-publish-flow.e2e.ts"],
        batchKey: "messaging",
        env: undefined,
        steps: [
          {
            runner: "vitest",
            logName: "messaging",
            configPath: "vitest.journeys.config.ts",
            fixedFiles: [
              "journeys/queue-message-flow.e2e.ts",
              "journeys/topic-publish-flow.e2e.ts",
            ],
            fixedArgs: undefined,
            commandArgs: undefined,
            batchKey: "messaging",
            env: undefined,
          },
        ],
      },
      {
        id: "hardening",
        aliases: ["security", "ownership"],
        fileMatchers: ["journeys/ownership-hardening.e2e.ts"],
        batchKey: "hardening",
        env: undefined,
        steps: [
          {
            runner: "vitest",
            logName: "hardening",
            configPath: "vitest.journeys.config.ts",
            fixedFiles: ["journeys/ownership-hardening.e2e.ts"],
            fixedArgs: undefined,
            commandArgs: undefined,
            batchKey: "hardening",
            env: undefined,
          },
        ],
      },
      {
        id: "intake",
        aliases: ["ai", "review"],
        fileMatchers: ["journeys/intake-mapping-flow.e2e.ts"],
        batchKey: "intake",
        env: undefined,
        steps: [
          {
            runner: "vitest",
            logName: "intake",
            configPath: "vitest.journeys.config.ts",
            fixedFiles: ["journeys/intake-mapping-flow.e2e.ts"],
            fixedArgs: undefined,
            commandArgs: undefined,
            batchKey: "intake",
            env: undefined,
          },
        ],
      },
      {
        id: "demo",
        aliases: ["public", "fixtures"],
        fileMatchers: ["journeys/public-fixture-demo-flow.e2e.ts"],
        batchKey: "demo",
        env: undefined,
        steps: [
          {
            runner: "vitest",
            logName: "demo",
            configPath: "vitest.journeys.config.ts",
            fixedFiles: ["journeys/public-fixture-demo-flow.e2e.ts"],
            fixedArgs: undefined,
            commandArgs: undefined,
            batchKey: "demo",
            env: undefined,
          },
        ],
      },
      {
        id: "client",
        aliases: ["bundle", "splitting"],
        fileMatchers: ["journeys/client-route-code-splitting.e2e.ts"],
        batchKey: "client",
        env: undefined,
        steps: [
          {
            runner: "vitest",
            logName: "client",
            configPath: "vitest.journeys.config.ts",
            fixedFiles: ["journeys/client-route-code-splitting.e2e.ts"],
            fixedArgs: undefined,
            commandArgs: undefined,
            batchKey: "client",
            env: undefined,
          },
        ],
      },
      {
        id: "branding",
        aliases: ["rebrand", "ui"],
        fileMatchers: ["journeys/ingestlens-branding.e2e.ts"],
        batchKey: "branding",
        env: undefined,
        steps: [
          {
            runner: "vitest",
            logName: "branding",
            configPath: "vitest.journeys.config.ts",
            fixedFiles: ["journeys/ingestlens-branding.e2e.ts"],
            fixedArgs: undefined,
            commandArgs: undefined,
            batchKey: "branding",
            env: undefined,
          },
        ],
      },
      {
        id: "neon-branch-provider",
        aliases: ["neon", "db-branching"],
        fileMatchers: ["journeys/neon-branch-provider.e2e.ts"],
        batchKey: "neon-branch-provider",
        env: undefined,
        steps: [
          {
            runner: "vitest",
            logName: "neon-branch-provider",
            configPath: "vitest.journeys.config.ts",
            fixedFiles: ["journeys/neon-branch-provider.e2e.ts"],
            fixedArgs: undefined,
            commandArgs: undefined,
            batchKey: "neon-branch-provider",
            env: undefined,
          },
        ],
      },
      {
        id: "s1b-latency",
        aliases: ["latency-lab"],
        fileMatchers: ["../../apps/lab/scenarios/s1b-latency/test/e2e/full-run.test.ts"],
        batchKey: "s1b-latency",
        env: { SKIP_REASON: "shell-not-wired" },
        steps: [
          {
            runner: "vitest",
            logName: "s1b-latency",
            configPath: "../../apps/lab/scenarios/s1b-latency/vitest.config.ts",
            fixedFiles: ["../../apps/lab/scenarios/s1b-latency/test/e2e/full-run.test.ts"],
            fixedArgs: undefined,
            commandArgs: undefined,
            batchKey: "s1b-latency",
            env: { SKIP_REASON: "shell-not-wired" },
          },
        ],
      },
      {
        id: "full",
        aliases: ["all", "backend", "blueprints"],
        fileMatchers: [],
        batchKey: "full",
        env: undefined,
        steps: [
          {
            runner: "vitest",
            logName: "full",
            configPath: "vitest.journeys.config.ts",
            fixedFiles: [
              "journeys/worker-health.e2e.ts",
              "journeys/auth-session.e2e.ts",
              "journeys/queue-message-flow.e2e.ts",
              "journeys/topic-publish-flow.e2e.ts",
              "journeys/ownership-hardening.e2e.ts",
              "journeys/intake-mapping-flow.e2e.ts",
              "journeys/public-fixture-demo-flow.e2e.ts",
              "journeys/client-route-code-splitting.e2e.ts",
              "journeys/ingestlens-branding.e2e.ts",
            ],
            fixedArgs: undefined,
            commandArgs: undefined,
            batchKey: "full",
            env: undefined,
          },
        ],
      },
    ]);
  });

  it("builds a vitest step with the default runner, config, and batchKey === id", () => {
    const step = createVitestStep("demo", ["journeys/public-fixture-demo-flow.e2e.ts"]);
    expect(step).toEqual({
      runner: "vitest",
      logName: "demo",
      configPath: "vitest.journeys.config.ts",
      fixedFiles: ["journeys/public-fixture-demo-flow.e2e.ts"],
      batchKey: "demo",
    });
  });

  it("normalizes e2e paths from repo-relative inputs", () => {
    expect(normalizeE2EPath("apps/e2e/journeys/worker-health.e2e.ts")).toBe(
      "journeys/worker-health.e2e.ts",
    );
  });

  it("resolves suite ids and files", () => {
    expect(resolveE2ESuiteId("foundation")).toBe("foundation");
    expect(resolveE2ESuiteId("smoke")).toBe("foundation");
    expect(resolveE2ESuiteId("identity")).toBe("auth");
    expect(resolveE2ESuiteId("queue")).toBe("messaging");
    expect(resolveE2ESuiteId("ownership")).toBe("hardening");
    expect(resolveE2ESuiteId("ai")).toBe("intake");
    expect(resolveE2ESuiteId("public")).toBe("demo");
    expect(resolveE2ESuiteId("splitting")).toBe("client");
    expect(resolveE2ESuiteId("rebrand")).toBe("branding");
    expect(resolveE2ESuiteId("neon")).toBe("neon-branch-provider");
    expect(resolveE2ESuiteId("db-branching")).toBe("neon-branch-provider");
    expect(resolveE2ESuiteId("neon-branch-provider")).toBe("neon-branch-provider");
    expect(resolveE2ESuiteId("s1b-latency")).toBe("s1b-latency");
    expect(resolveE2ESuiteId("latency-lab")).toBe("s1b-latency");
    expect(resolveE2ESuiteId("all")).toBe("full");
    expect(resolveE2ESuiteId("missing")).toBeNull();

    expect(resolveE2ESuiteForFile("journeys/worker-health.e2e.ts")).toEqual({
      normalizedPath: "journeys/worker-health.e2e.ts",
      suiteId: "foundation",
    });
    expect(resolveE2ESuiteForFile("journeys/auth-session.e2e.ts")).toEqual({
      normalizedPath: "journeys/auth-session.e2e.ts",
      suiteId: "auth",
    });
    expect(resolveE2ESuiteForFile("journeys/queue-message-flow.e2e.ts")).toEqual({
      normalizedPath: "journeys/queue-message-flow.e2e.ts",
      suiteId: "messaging",
    });
    expect(resolveE2ESuiteForFile("journeys/topic-publish-flow.e2e.ts")).toEqual({
      normalizedPath: "journeys/topic-publish-flow.e2e.ts",
      suiteId: "messaging",
    });
    expect(resolveE2ESuiteForFile("journeys/ownership-hardening.e2e.ts")).toEqual({
      normalizedPath: "journeys/ownership-hardening.e2e.ts",
      suiteId: "hardening",
    });
    expect(resolveE2ESuiteForFile("journeys/intake-mapping-flow.e2e.ts")).toEqual({
      normalizedPath: "journeys/intake-mapping-flow.e2e.ts",
      suiteId: "intake",
    });
    expect(resolveE2ESuiteForFile("journeys/public-fixture-demo-flow.e2e.ts")).toEqual({
      normalizedPath: "journeys/public-fixture-demo-flow.e2e.ts",
      suiteId: "demo",
    });
    expect(resolveE2ESuiteForFile("journeys/client-route-code-splitting.e2e.ts")).toEqual({
      normalizedPath: "journeys/client-route-code-splitting.e2e.ts",
      suiteId: "client",
    });
    expect(resolveE2ESuiteForFile("journeys/ingestlens-branding.e2e.ts")).toEqual({
      normalizedPath: "journeys/ingestlens-branding.e2e.ts",
      suiteId: "branding",
    });
    expect(resolveE2ESuiteForFile("journeys/neon-branch-provider.e2e.ts")).toEqual({
      normalizedPath: "journeys/neon-branch-provider.e2e.ts",
      suiteId: "neon-branch-provider",
    });
    expect(resolveE2ESuiteForFile("journeys/missing.e2e.ts")).toBeNull();
  });
});
