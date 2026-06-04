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

export const agentKitE2eHostAdapter = {
  listSuites: () => rootifySuites(),
  resolveSuiteId: (name: string) => resolveE2ESuiteId(name),
  normalizeFilePath: (filePath: string) => normalizeRootPath(filePath),
  resolveSuiteForFile: (filePath: string) => resolveSuiteForRootFile(filePath),
  buildExecutionPlan: (request: E2eExecutionRequest): E2eExecutionBatch[] => {
    const suiteId = resolveRequestedSuite(request);
    const args = ["apps/e2e/scripts/e2e-with-neon.ts", "--suite", suiteId];

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
