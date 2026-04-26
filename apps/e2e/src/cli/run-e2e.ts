import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { listE2ESuites, normalizeE2EPath, resolveE2ESuiteId } from "../e2e-suite-manifest.ts";

export interface RunE2eArgs {
  suite?: string;
  files: string[];
  workers?: string;
  passthrough: string[];
}

export interface JourneySelection {
  suiteId: string;
  files: string[];
}

export interface JourneyRunCommand {
  command: string;
  args: string[];
  suiteId: string;
}

export function parseRunE2eArgs(argv: readonly string[]): RunE2eArgs {
  const separatorIndex = argv.indexOf("--");
  const rawArgs = separatorIndex === -1 ? [...argv] : argv.slice(0, separatorIndex);
  const passthrough = separatorIndex === -1 ? [] : argv.slice(separatorIndex + 1);

  const parsed: RunE2eArgs = { files: [], passthrough };

  for (let i = 0; i < rawArgs.length; i += 1) {
    const arg = rawArgs[i];
    if (arg === "--suite") {
      parsed.suite = rawArgs[++i];
      continue;
    }
    if (arg === "--file") {
      const file = rawArgs[++i];
      if (file) parsed.files.push(file);
      continue;
    }
    if (arg === "--workers") {
      parsed.workers = rawArgs[++i];
    }
  }

  return parsed;
}

export function resolveJourneySelection(args: RunE2eArgs): JourneySelection {
  const suites = listE2ESuites();
  const requestedSuiteId = args.suite ? resolveE2ESuiteId(args.suite) : null;
  const defaultSuite = suites[0];

  if (!defaultSuite) {
    throw new Error("No E2E suites are configured.");
  }

  const suiteId = requestedSuiteId ?? defaultSuite.id;
  const suite = suites.find((candidate) => candidate.id === suiteId);
  if (!suite) {
    throw new Error(`Unknown E2E suite: ${args.suite}`);
  }

  const files =
    args.files.length > 0
      ? args.files.map((file) => normalizeE2EPath(file))
      : suite.steps.flatMap((step) => step.fixedFiles ?? []);

  return { suiteId, files };
}

export function buildJourneyRunCommand(args: RunE2eArgs): JourneyRunCommand {
  const selection = resolveJourneySelection(args);
  const suites = listE2ESuites();
  const suite = suites.find((s) => s.id === selection.suiteId);
  const firstStep = suite?.steps[0];

  if (firstStep?.runner === "playwright") {
    const configPath = firstStep.configPath ?? "playwright.config.ts";
    return {
      command: "pnpm",
      args: [
        "exec",
        "playwright",
        "test",
        "--config",
        configPath,
        ...selection.files,
        ...args.passthrough,
      ],
      suiteId: selection.suiteId,
    };
  }

  const configPath = firstStep?.configPath ?? "vitest.journeys.config.ts";
  const commandArgs = ["exec", "vitest", "run", "--config", configPath];

  if (args.workers !== undefined) {
    commandArgs.push("--poolOptions.threads.maxThreads", String(args.workers));
  }

  commandArgs.push(...selection.files, ...args.passthrough);

  return {
    command: "pnpm",
    args: commandArgs,
    suiteId: selection.suiteId,
  };
}

function runCli(argv: readonly string[]): never {
  const command = buildJourneyRunCommand(parseRunE2eArgs(argv));
  const result = spawnSync(command.command, command.args, {
    stdio: "inherit",
    env: process.env,
  });

  process.exit(result.status ?? 1);
}

const entryPath = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (entryPath) {
  runCli(process.argv.slice(2));
}
