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
const HARDENING_FILES = ["journeys/ownership-hardening.e2e.ts"] as const;
const INTAKE_FILES = ["journeys/intake-mapping-flow.e2e.ts"] as const;
const DEMO_FILES = ["journeys/public-fixture-demo-flow.e2e.ts"] as const;
const CLIENT_FILES = ["journeys/client-route-code-splitting.e2e.ts"] as const;
const BRANDING_FILES = ["journeys/ingestlens-branding.e2e.ts"] as const;
const FULL_FILES = [
  ...FOUNDATION_FILES,
  ...AUTH_FILES,
  ...MESSAGING_FILES,
  ...HARDENING_FILES,
  ...INTAKE_FILES,
  ...DEMO_FILES,
  ...CLIENT_FILES,
  ...BRANDING_FILES,
] as const;

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
    id: "hardening",
    aliases: ["security", "ownership"],
    fileMatchers: HARDENING_FILES,
    batchKey: "hardening",
    env: DEFAULT_E2E_ENV,
    steps: [
      {
        runner: "vitest",
        logName: "hardening",
        configPath: "vitest.journeys.config.ts",
        fixedFiles: HARDENING_FILES,
        batchKey: "hardening",
      },
    ],
  },
  {
    id: "intake",
    aliases: ["ai", "review"],
    fileMatchers: INTAKE_FILES,
    batchKey: "intake",
    env: DEFAULT_E2E_ENV,
    steps: [
      {
        runner: "vitest",
        logName: "intake",
        configPath: "vitest.journeys.config.ts",
        fixedFiles: INTAKE_FILES,
        batchKey: "intake",
      },
    ],
  },
  {
    id: "demo",
    aliases: ["public", "fixtures"],
    fileMatchers: DEMO_FILES,
    batchKey: "demo",
    env: DEFAULT_E2E_ENV,
    steps: [
      {
        runner: "vitest",
        logName: "demo",
        configPath: "vitest.journeys.config.ts",
        fixedFiles: DEMO_FILES,
        batchKey: "demo",
      },
    ],
  },
  {
    id: "client",
    aliases: ["bundle", "splitting"],
    fileMatchers: CLIENT_FILES,
    batchKey: "client",
    env: DEFAULT_E2E_ENV,
    steps: [
      {
        runner: "vitest",
        logName: "client",
        configPath: "vitest.journeys.config.ts",
        fixedFiles: CLIENT_FILES,
        batchKey: "client",
      },
    ],
  },
  {
    id: "branding",
    aliases: ["rebrand", "ui"],
    fileMatchers: BRANDING_FILES,
    batchKey: "branding",
    env: DEFAULT_E2E_ENV,
    steps: [
      {
        runner: "vitest",
        logName: "branding",
        configPath: "vitest.journeys.config.ts",
        fixedFiles: BRANDING_FILES,
        batchKey: "branding",
      },
    ],
  },
  {
    id: "full",
    aliases: ["all", "backend", "blueprints"],
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
