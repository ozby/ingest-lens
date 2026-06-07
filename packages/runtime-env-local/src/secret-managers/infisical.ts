import type { ExecutionContext } from "@webpresso/runtime-env";
import type { SecretFetchRequest, SecretManagerAdapter, SecretManagerScope } from "./types";

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { match } from "ts-pattern";

import { readSecretsConfig } from "../secrets-config";

export function getInfisicalEnvFromContext(context: ExecutionContext): string {
  return match(context.type)
    .with("prod", () => "prod")
    .with("preview", () => "staging")
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

const DEFAULT_INFISICAL_API = "https://app.infisical.com/api";

export function resolveInfisicalApiBase(): string {
  const fromEnv = process.env.INFISICAL_API_URL?.trim();
  if (fromEnv && fromEnv.length > 0) return fromEnv.replace(/\/+$/, "");
  const configPath = path.join(homedir(), ".infisical", "infisical-config.json");
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, "utf8");
      const parsed = JSON.parse(raw) as { LoggedInUserDomain?: unknown };
      if (typeof parsed.LoggedInUserDomain === "string" && parsed.LoggedInUserDomain.length > 0) {
        return parsed.LoggedInUserDomain.replace(/\/+$/, "");
      }
    } catch {}
  }
  return DEFAULT_INFISICAL_API;
}

export const infisicalAdapter: SecretManagerAdapter = {
  name: "infisical",
  displayName: "Infisical",
  capabilities: {
    envMap: true,
    singleSecret: false,
    versionSelection: false,
    hierarchicalPaths: false,
    tagFiltering: false,
    watchReload: false,
    interactiveLogin: true,
  },
  resolveScopeForExecution(execution: ExecutionContext): SecretManagerScope {
    const environment = getInfisicalEnvFromContext(execution);
    const config = readSecretsConfig();
    if (config && config.manager === "infisical") {
      return { workspace: config.projectId, environment };
    }
    return { environment };
  },
  async checkAvailability() {
    try {
      const { exitCode } = await runCommand("infisical", ["--version"]);
      return { available: exitCode === 0 };
    } catch (error) {
      return { available: false, detail: error instanceof Error ? error.message : String(error) };
    }
  },
  async checkAuthentication() {
    try {
      const { exitCode } = await runCommand("infisical", [
        "user",
        "get",
        "token",
        "--plain",
        "--silent",
      ]);
      return { authenticated: exitCode === 0 };
    } catch (error) {
      return {
        authenticated: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  },
  async listWorkspaces() {
    const tokenResult = await runCommand("infisical", [
      "user",
      "get",
      "token",
      "--plain",
      "--silent",
    ]);
    if (tokenResult.exitCode !== 0)
      throw new Error("Not authenticated to Infisical. Run: infisical login");
    const token = tokenResult.stdout.trim();
    if (!token) throw new Error("Infisical returned an empty access token");
    const response = await fetch(`${resolveInfisicalApiBase()}/v1/workspace`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok)
      throw new Error(`Infisical workspace list failed: ${response.status} ${response.statusText}`);
    const data = (await response.json()) as { workspaces?: unknown };
    if (!Array.isArray(data.workspaces))
      throw new Error("Infisical /v1/workspace returned unexpected shape");
    return data.workspaces
      .map((w) => (typeof w === "object" && w !== null ? (w as { id?: unknown }).id : undefined))
      .filter((id): id is string => typeof id === "string" && id.length > 0);
  },
  async interactiveLogin() {
    const { exitCode } = await runCommand("infisical", ["login"]);
    if (exitCode !== 0) throw new Error("Infisical login failed. Run: infisical login");
  },
  async interactiveSetup() {
    const { exitCode } = await runCommand("infisical", ["init"]);
    if (exitCode !== 0)
      throw new Error("Infisical init failed. Run: infisical login && infisical init");
  },
  async fetchSecrets(request: SecretFetchRequest): Promise<Record<string, string>> {
    if ((request.mode ?? "env-map") !== "env-map") {
      throw new Error("The selected secret manager adapter only supports env-map mode in v1.");
    }
    const projectId = request.scope?.workspace;
    const environment = request.scope?.environment;
    const args = ["export", "--format", "json", "--silent", "--telemetry=false", "--expand=false"];
    if (environment) args.push(`--env=${environment}`);
    if (projectId) args.push("--projectId", projectId);
    const { stdout, stderr, exitCode } = await runCommand("infisical", args);
    if (exitCode !== 0) {
      throw new Error(
        `Unable to fetch secrets from Infisical. Run: infisical login && infisical init\n${stderr.trim() || stdout.trim()}`,
      );
    }
    const trimmed = stdout.trim();
    if (!trimmed) throw new Error("Infisical returned an empty response");
    return JSON.parse(trimmed) as Record<string, string>;
  },
};
