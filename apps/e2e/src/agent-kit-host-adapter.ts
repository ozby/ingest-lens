import { listE2ESuites, resolveE2ESuiteId } from "./e2e-suite-manifest.ts";

type E2eExecutionRequest = {
  suite?: string;
  file?: readonly string[];
};

type E2ePlanRun = {
  suiteId: string;
  batchKey: string;
  runner: "command";
  logName: string;
  command: string;
  args: string[];
};

type E2eExecutionBatch = {
  batchKey: string;
  runs: E2ePlanRun[];
};

type E2eSuiteStep = {
  configPath?: string;
  fixedFiles?: readonly string[];
};

type E2eSuiteDefinition = {
  id: string;
  fileMatchers: readonly string[];
  steps: readonly E2eSuiteStep[];
};

type E2eHostAdapter = {
  listSuites: () => readonly E2eSuiteDefinition[];
  resolveSuiteId: (name: string) => string | null;
  normalizeFilePath: (filePath: string) => string;
  resolveSuiteForFile: (filePath: string) => { normalizedPath: string; suiteId: string } | null;
  buildExecutionPlan: (request: E2eExecutionRequest) => E2eExecutionBatch[];
};

function normalizeRootPath(filePath: string): string {
  const normalized = filePath.replace(/\\/gu, "/");

  if (normalized.startsWith("apps/e2e/")) {
    return normalized;
  }

  if (normalized.startsWith("journeys/")) {
    return `apps/e2e/${normalized}`;
  }

  if (normalized === "playwright.config.ts" || normalized === "vitest.journeys.config.ts") {
    return `apps/e2e/${normalized}`;
  }

  if (normalized.startsWith("../../")) {
    return normalized.replace(/^(\.\.\/)+/u, "");
  }

  return normalized;
}

function rootifySuites(): readonly E2eSuiteDefinition[] {
  return listE2ESuites().map((suite) => ({
    ...suite,
    fileMatchers: suite.fileMatchers.map(normalizeRootPath),
    steps: suite.steps.map((step) => ({
      ...step,
      configPath: step.configPath ? normalizeRootPath(step.configPath) : undefined,
      fixedFiles: step.fixedFiles?.map(normalizeRootPath),
    })),
  }));
}

function resolveSuiteForRootFile(
  filePath: string,
): { normalizedPath: string; suiteId: string } | null {
  const normalizedPath = normalizeRootPath(filePath);
  const suite = rootifySuites().find((candidate) =>
    candidate.fileMatchers.some((matcher) => normalizedPath.startsWith(matcher)),
  );

  return suite ? { normalizedPath, suiteId: suite.id } : null;
}

function getDefaultSuiteId(): string {
  return rootifySuites()[0]?.id ?? "foundation";
}

function resolveRequestedSuite(request: E2eExecutionRequest): string {
  if (request.suite) {
    return resolveE2ESuiteId(request.suite) ?? request.suite;
  }

  const requestedSuiteId = request.file?.[0]
    ? resolveSuiteForRootFile(request.file[0])?.suiteId
    : null;
  if (requestedSuiteId) {
    return requestedSuiteId;
  }

  return getDefaultSuiteId();
}

export const agentKitE2eHostAdapter: E2eHostAdapter = {
  listSuites: () => rootifySuites(),
  resolveSuiteId: (name) => resolveE2ESuiteId(name),
  normalizeFilePath: (filePath) => normalizeRootPath(filePath),
  resolveSuiteForFile: (filePath) => resolveSuiteForRootFile(filePath),
  buildExecutionPlan: (request) => {
    const suiteId = resolveRequestedSuite(request);
    const args = ["run", "e2e", "--suite", suiteId];

    for (const file of request.file ?? []) {
      args.push("--file", normalizeRootPath(file));
    }

    return [
      {
        batchKey: suiteId,
        runs: [
          {
            suiteId,
            batchKey: suiteId,
            runner: "command",
            logName: suiteId,
            command: "bun",
            args,
          },
        ],
      },
    ];
  },
};

export default agentKitE2eHostAdapter;
