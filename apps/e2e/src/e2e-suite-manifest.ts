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

const VITEST_JOURNEYS_CONFIG = "vitest.journeys.config.ts";

export function createVitestStep(id: string, files: readonly string[]): E2ESuiteStep {
  return {
    runner: "vitest",
    logName: id,
    configPath: VITEST_JOURNEYS_CONFIG,
    fixedFiles: files,
    batchKey: id,
  };
}

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
    steps: [createVitestStep("foundation", FOUNDATION_FILES)],
  },
  {
    id: "auth",
    aliases: ["identity"],
    fileMatchers: AUTH_FILES,
    batchKey: "auth",
    steps: [createVitestStep("auth", AUTH_FILES)],
  },
  {
    id: "messaging",
    aliases: ["queue", "topic"],
    fileMatchers: MESSAGING_FILES,
    batchKey: "messaging",
    steps: [createVitestStep("messaging", MESSAGING_FILES)],
  },
  {
    id: "hardening",
    aliases: ["security", "ownership"],
    fileMatchers: HARDENING_FILES,
    batchKey: "hardening",
    steps: [createVitestStep("hardening", HARDENING_FILES)],
  },
  {
    id: "intake",
    aliases: ["ai", "review"],
    fileMatchers: INTAKE_FILES,
    batchKey: "intake",
    steps: [createVitestStep("intake", INTAKE_FILES)],
  },
  {
    id: "demo",
    aliases: ["public", "fixtures"],
    fileMatchers: DEMO_FILES,
    batchKey: "demo",
    steps: [createVitestStep("demo", DEMO_FILES)],
  },
  {
    id: "client",
    aliases: ["bundle", "splitting"],
    fileMatchers: CLIENT_FILES,
    batchKey: "client",
    steps: [createVitestStep("client", CLIENT_FILES)],
  },
  {
    id: "branding",
    aliases: ["rebrand", "ui"],
    fileMatchers: BRANDING_FILES,
    batchKey: "branding",
    steps: [createVitestStep("branding", BRANDING_FILES)],
  },
  {
    id: "full",
    aliases: ["all", "backend", "blueprints"],
    fileMatchers: [],
    batchKey: "full",
    steps: [createVitestStep("full", FULL_FILES)],
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
