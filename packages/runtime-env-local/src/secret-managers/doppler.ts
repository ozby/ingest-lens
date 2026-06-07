import type { ExecutionContext } from "@webpresso/runtime-env";
import type { SecretFetchRequest, SecretManagerAdapter, SecretManagerScope } from "./types";

import { spawn } from "node:child_process";
import { match } from "ts-pattern";

import { readSecretsConfig } from "../secrets-config";

export const DOPPLER_DEFAULT_CONFIG = "dev";

export function getDopplerConfigFromContext(context: ExecutionContext): string {
  return match(context.type)
    .with("prod", () => "prd")
    .with("preview", () =>
      context.identifier?.startsWith("pr-")
        ? `preview_${context.identifier.replace("-", "_")}`
        : "preview",
    )
    .with("e2e", () => "dev")
    .with("dev", () => "dev")
    .exhaustive();
}

function runCommand(
  command: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => resolve({ stdout, stderr, exitCode: code ?? 1 }));
  });
}

export function isDopplerSecretsInjected(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return !!(env.DOPPLER_PROJECT && (env.DOPPLER_ENVIRONMENT || env.DOPPLER_CONFIG));
}

function isUnauthenticated(output: string): boolean {
  const normalized = output.toLowerCase();
  return (
    normalized.includes("token not found in system keyring") ||
    normalized.includes("secret not found in keyring") ||
    normalized.includes("you must be logged in") ||
    normalized.includes("doppler login")
  );
}

type DopplerProjectState =
  | { kind: "configured" }
  | { kind: "unconfigured" }
  | { kind: "wrong-project"; project: string }
  | { kind: "unauthenticated"; detail: string };

export async function getDopplerProjectState(targetProject?: string): Promise<DopplerProjectState> {
  try {
    const { stdout, stderr, exitCode } = await runCommand("doppler", [
      "configure",
      "get",
      "project",
      "--plain",
    ]);
    if (exitCode !== 0) {
      const detail = stderr.trim() || stdout.trim();
      return isUnauthenticated(detail)
        ? { kind: "unauthenticated", detail }
        : { kind: "unconfigured" };
    }
    const configuredProject = stdout.trim();
    if (!configuredProject) return { kind: "unconfigured" };
    if (targetProject && configuredProject !== targetProject) {
      return { kind: "wrong-project", project: configuredProject };
    }
    return { kind: "configured" };
  } catch {
    return { kind: "unconfigured" };
  }
}

async function autoSetup(
  project: string,
  environment: string = DOPPLER_DEFAULT_CONFIG,
): Promise<void> {
  const { exitCode } = await runCommand("doppler", [
    "setup",
    "--project",
    project,
    "--config",
    environment,
    "--no-interactive",
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `Failed to auto-configure Doppler. Please run manually:\n  doppler login\n  doppler setup --project ${project} --config ${environment}`,
    );
  }
}

function buildDopplerFetchArgs(request: SecretFetchRequest): string[] {
  const project = request.scope?.workspace;
  const config = request.scope?.environment || DOPPLER_DEFAULT_CONFIG;
  const args = ["secrets", "download", "--no-file", "--format", "json", "--silent"];
  if (project) args.push("--project", project);
  if (config) args.push("--config", config);
  return args;
}

function parseJsonSecrets(stdout: string, provider: string): Record<string, string> {
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error(`${provider} returned an empty response`);
  return JSON.parse(trimmed) as Record<string, string>;
}

export const dopplerAdapter: SecretManagerAdapter = {
  name: "doppler",
  displayName: "Doppler",
  capabilities: {
    envMap: true,
    singleSecret: false,
    versionSelection: false,
    hierarchicalPaths: false,
    tagFiltering: false,
    watchReload: false,
    interactiveLogin: true,
  },
  resolveScopeForExecution(execution): SecretManagerScope {
    const config = readSecretsConfig();
    return {
      workspace: config?.manager === "doppler" ? config.projectId : undefined,
      environment: getDopplerConfigFromContext(execution),
    };
  },
  async checkAvailability() {
    try {
      const { exitCode } = await runCommand("doppler", ["--version"]);
      return { available: exitCode === 0 };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { available: false, detail };
    }
  },
  async checkAuthentication(options?: { workspace?: string }) {
    const state = await getDopplerProjectState(options?.workspace);
    if (state.kind === "configured") return { authenticated: true };
    if (state.kind === "unauthenticated") return { authenticated: false, detail: state.detail };
    return {
      authenticated: false,
      detail:
        state.kind === "unconfigured"
          ? "Secret manager workspace not configured"
          : `Wrong workspace configured: ${state.project}`,
    };
  },
  async listWorkspaces() {
    const { stdout, stderr, exitCode } = await runCommand("doppler", ["projects", "--json"]);
    if (exitCode !== 0)
      throw new Error(`Doppler projects list failed: ${stderr.trim() || stdout.trim()}`);
    const parsed = JSON.parse(stdout) as unknown;
    if (!Array.isArray(parsed))
      throw new Error("Doppler projects list returned unexpected shape (not an array)");
    return parsed
      .map((p) => (typeof p === "object" && p !== null ? (p as { id?: unknown }).id : undefined))
      .filter((id): id is string => typeof id === "string" && id.length > 0);
  },
  async interactiveLogin() {
    const availability = await this.checkAvailability();
    if (!availability.available) throw new Error("Selected secret manager CLI is not installed.");
    const auth = await this.checkAuthentication();
    if (auth.authenticated) return;
    const { exitCode } = await runCommand("doppler", ["login"]);
    if (exitCode !== 0) throw new Error("Doppler login failed. Run: doppler login");
  },
  async interactiveSetup(options?: { workspace?: string }) {
    const availability = await this.checkAvailability();
    if (!availability.available) throw new Error("Selected secret manager CLI is not installed.");
    if (!options?.workspace) throw new Error("Doppler setup requires a workspace.");
    const auth = await this.checkAuthentication({ workspace: options.workspace });
    if (!auth.authenticated) {
      const { exitCode } = await runCommand("doppler", ["login"]);
      if (exitCode !== 0) throw new Error("Doppler login failed. Run: doppler login");
    }
    await autoSetup(options.workspace);
  },
  async fetchSecrets(request: SecretFetchRequest): Promise<Record<string, string>> {
    if ((request.mode ?? "env-map") !== "env-map") {
      throw new Error("The selected secret manager adapter only supports env-map mode in v1.");
    }
    const args = buildDopplerFetchArgs(request);
    const { stdout, stderr, exitCode } = await runCommand("doppler", args);
    if (exitCode !== 0) {
      throw new Error(
        `Unable to fetch secrets from Doppler. Run: doppler login && doppler setup\n${stderr.trim() || stdout.trim()}`,
      );
    }
    return parseJsonSecrets(stdout, "Doppler");
  },
};
