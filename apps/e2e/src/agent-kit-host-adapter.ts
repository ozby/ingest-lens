import type {
  E2eExecutionRequest,
  E2eHostAdapter,
  E2eStepDefinition,
  E2eSuiteDefinition as AgentKitSuiteDefinition,
} from "@webpresso/agent-kit/e2e";
import {
  listE2ESuites,
  normalizeE2EPath,
  resolveE2ESuiteForFile,
  resolveE2ESuiteId,
  type E2ESuiteDefinition,
  type E2ESuiteStep,
} from "./e2e-suite-manifest.ts";

function projectStep(step: E2ESuiteStep): E2eStepDefinition {
  return {
    runner: step.runner,
    logName: step.logName,
    configPath: step.configPath,
    fixedFiles: step.fixedFiles ? [...step.fixedFiles] : undefined,
    fixedArgs: step.fixedArgs ? [...step.fixedArgs] : undefined,
    commandArgs: step.commandArgs ? [...step.commandArgs] : undefined,
    supportsHeaded: step.supportsHeaded,
    supportsDebug: step.supportsDebug,
    batchKey: step.batchKey,
    envProfile: step.envProfile,
    reportDir: step.reportDir,
    env: step.env ? { ...step.env } : undefined,
  };
}

function projectSuite(suite: E2ESuiteDefinition): AgentKitSuiteDefinition {
  return {
    id: suite.id,
    aliases: suite.aliases ? [...suite.aliases] : undefined,
    fileMatchers: [...suite.fileMatchers],
    batchKey: suite.batchKey,
    envProfile: suite.envProfile,
    steps: suite.steps.map(projectStep),
    env: suite.env ? { ...suite.env } : undefined,
  };
}

function buildHostExecutionArgs(request: E2eExecutionRequest): string[] {
  const args = ["--dir", "apps/e2e", "run", "e2e:run"];
  const forwarded: string[] = [];

  if (request.suite) forwarded.push("--suite", request.suite);
  for (const file of request.file ?? []) forwarded.push("--file", file);
  if (request.headed) forwarded.push("--headed");
  if (request.debug) forwarded.push("--debug");
  if (request.reuseReset) forwarded.push("--reuse-reset");
  if (request.noSupervisor) forwarded.push("--no-supervisor");
  if (request.workers !== undefined) forwarded.push("--workers", String(request.workers));
  if (request.testList) forwarded.push("--test-list", request.testList);
  if ((request.passthrough?.length ?? 0) > 0) forwarded.push(...(request.passthrough ?? []));

  return forwarded.length > 0 ? [...args, "--", ...forwarded] : args;
}

export const agentKitE2eHostAdapter: E2eHostAdapter = {
  listSuites() {
    return listE2ESuites().map(projectSuite);
  },
  resolveSuiteId(name) {
    return resolveE2ESuiteId(name);
  },
  normalizeFilePath(filePath) {
    return normalizeE2EPath(filePath);
  },
  resolveSuiteForFile(filePath) {
    return resolveE2ESuiteForFile(filePath);
  },
  buildExecutionPlan(request) {
    return [
      {
        batchKey: "node-pubsub-e2e-host",
        envProfile: undefined,
        env: {
          E2E_BASE_URL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:8787",
        },
        runs: [
          {
            suiteId: request.suite ?? "foundation",
            batchKey: "node-pubsub-e2e-host",
            envProfile: undefined,
            runner: "command",
            logName: "node-pubsub-e2e-host",
            command: "pnpm",
            args: buildHostExecutionArgs(request),
          },
        ],
      },
    ];
  },
};

export const nodePubsubE2eHostAdapter = agentKitE2eHostAdapter;
