export interface E2ESuiteStep {
  runner: "vitest" | "playwright" | "command";
  logName: string;
  configPath?: string;
  fixedFiles?: readonly string[];
  fixedArgs?: readonly string[];
  commandArgs?: readonly string[];
  supportsHeaded?: boolean;
  supportsDebug?: boolean;
  batchKey?: string;
  envProfile?: string;
  reportDir?: string;
  env?: Record<string, string>;
}

export interface E2ESuiteDefinition {
  id: string;
  aliases?: readonly string[];
  fileMatchers: readonly string[];
  batchKey: string;
  envProfile?: string;
  steps: readonly E2ESuiteStep[];
  env?: Record<string, string>;
}

const DEFAULT_E2E_ENV = {
  E2E_BASE_URL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:8787",
} as const;

const FOUNDATION_FILES = ["journeys/worker-health.e2e.ts"] as const;
const AUTH_FILES = ["journeys/auth-session.e2e.ts"] as const;
const MESSAGING_FILES = [
  "journeys/queue-message-flow.e2e.ts",
  "journeys/topic-publish-flow.e2e.ts",
] as const;
const FULL_FILES = [...FOUNDATION_FILES, ...AUTH_FILES, ...MESSAGING_FILES] as const;

const E2E_SUITES: readonly E2ESuiteDefinition[] = [
  {
    id: "foundation",
    aliases: ["pubsub", "smoke"],
    fileMatchers: FOUNDATION_FILES,
    batchKey: "foundation",
    env: DEFAULT_E2E_ENV,
    steps: [
      {
        runner: "vitest",
        logName: "foundation",
        configPath: "vitest.journeys.config.ts",
        fixedFiles: FOUNDATION_FILES,
        batchKey: "foundation",
      },
    ],
  },
  {
    id: "auth",
    aliases: ["identity"],
    fileMatchers: AUTH_FILES,
    batchKey: "auth",
    env: DEFAULT_E2E_ENV,
    steps: [
      {
        runner: "vitest",
        logName: "auth",
        configPath: "vitest.journeys.config.ts",
        fixedFiles: AUTH_FILES,
        batchKey: "auth",
      },
    ],
  },
  {
    id: "messaging",
    aliases: ["queue", "topic"],
    fileMatchers: MESSAGING_FILES,
    batchKey: "messaging",
    env: DEFAULT_E2E_ENV,
    steps: [
      {
        runner: "vitest",
        logName: "messaging",
        configPath: "vitest.journeys.config.ts",
        fixedFiles: MESSAGING_FILES,
        batchKey: "messaging",
      },
    ],
  },
  {
    id: "full",
    aliases: ["all", "backend"],
    fileMatchers: [],
    batchKey: "full",
    env: DEFAULT_E2E_ENV,
    steps: [
      {
        runner: "vitest",
        logName: "full",
        configPath: "vitest.journeys.config.ts",
        fixedFiles: FULL_FILES,
        batchKey: "full",
      },
    ],
  },
];

export function listE2ESuites(): readonly E2ESuiteDefinition[] {
  return E2E_SUITES.map((suite) => ({
    ...suite,
    aliases: suite.aliases ? [...suite.aliases] : undefined,
    fileMatchers: [...suite.fileMatchers],
    steps: suite.steps.map((step) => ({
      ...step,
      fixedFiles: step.fixedFiles ? [...step.fixedFiles] : undefined,
      fixedArgs: step.fixedArgs ? [...step.fixedArgs] : undefined,
      commandArgs: step.commandArgs ? [...step.commandArgs] : undefined,
      env: step.env ? { ...step.env } : undefined,
    })),
    env: suite.env ? { ...suite.env } : undefined,
  }));
}

export function normalizeE2EPath(filePath: string): string {
  return filePath.replace(/\\/gu, "/").replace(/^apps\/e2e\//u, "");
}

export function resolveE2ESuiteId(name: string): string | null {
  return (
    listE2ESuites().find((suite) => suite.id === name || suite.aliases?.includes(name))?.id ?? null
  );
}

export function resolveE2ESuiteForFile(
  filePath: string,
): { normalizedPath: string; suiteId: string } | null {
  const normalizedPath = normalizeE2EPath(filePath);
  const suite = listE2ESuites().find((candidate) =>
    candidate.fileMatchers.some((matcher) => normalizedPath.startsWith(matcher)),
  );

  if (!suite) {
    return null;
  }

  return {
    normalizedPath,
    suiteId: suite.id,
  };
}
