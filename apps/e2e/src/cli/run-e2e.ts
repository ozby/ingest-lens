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

function buildStepCommand(
  suiteId: string,
  runner: "vitest" | "playwright" | "command",
  configPath: string,
  fixedFiles: string[],
  args: RunE2eArgs,
): JourneyRunCommand {
  if (runner === "playwright") {
    return {
      command: "./node_modules/.bin/playwright",
      args: ["test", "--config", configPath, ...fixedFiles, ...args.passthrough],
      suiteId,
    };
  }

  const commandArgs = ["run", "--config", configPath];

  if (args.workers !== undefined) {
    commandArgs.push("--poolOptions.threads.maxThreads", String(args.workers));
  }

  commandArgs.push(...fixedFiles, ...args.passthrough);

  return {
    command: "./node_modules/.bin/vitest",
    args: commandArgs,
    suiteId,
  };
}

export function buildJourneyRunCommands(args: RunE2eArgs): JourneyRunCommand[] {
  const selection = resolveJourneySelection(args);
  const suites = listE2ESuites();
  const suite = suites.find((s) => s.id === selection.suiteId);
  if (!suite) {
    throw new Error(`Unknown E2E suite: ${selection.suiteId}`);
  }

  return suite.steps
    .map((step) => {
      const configPath =
        step.configPath ??
        (step.runner === "playwright" ? "playwright.config.ts" : "vitest.journeys.config.ts");
      const stepFiles = selection.files.filter((file) => step.fixedFiles?.includes(file) ?? false);
      if (stepFiles.length === 0) return null;
      return buildStepCommand(selection.suiteId, step.runner, configPath, stepFiles, args);
    })
    .filter((command): command is JourneyRunCommand => command !== null);
}

export function buildJourneyRunCommand(args: RunE2eArgs): JourneyRunCommand {
  const [firstCommand] = buildJourneyRunCommands(args);
  if (!firstCommand) {
    throw new Error("No E2E journey commands were generated.");
  }
  return firstCommand;
}

function runCli(argv: readonly string[]): never {
  const commands = buildJourneyRunCommands(parseRunE2eArgs(argv));
  if (commands.length === 0) {
    throw new Error("No E2E journey commands were generated.");
  }

  let exitCode = 0;
  for (const command of commands) {
    const result = spawnSync(command.command, command.args, {
      stdio: "inherit",
      env: process.env,
    });
    exitCode = result.status ?? 1;
    if (exitCode !== 0) break;
  }

  process.exit(exitCode);
}

const entryPath = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (entryPath) {
  runCli(process.argv.slice(2));
}
