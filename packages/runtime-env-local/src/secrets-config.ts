import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type SecretManagerName = "doppler" | "infisical";

export interface SecretsConfig {
  manager: SecretManagerName;
  projectId: string;
  projectLabel?: string;
}

const FALLBACK_RELATIVE_PATH = ".webpresso/secrets.config.json";
const GIT_RELATIVE_DIR = "webpresso";
const GIT_FILE_NAME = "secrets.json";

function resolveGitCommonDir(cwd: string): string | null {
  try {
    const out = execFileSync("git", ["rev-parse", "--git-common-dir"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!out) return null;
    return path.isAbsolute(out) ? out : path.resolve(cwd, out);
  } catch {
    return null;
  }
}

export function getSecretsConfigPath(cwd: string = process.cwd()): string {
  const gitDir = resolveGitCommonDir(cwd);
  if (gitDir !== null) return path.join(gitDir, GIT_RELATIVE_DIR, GIT_FILE_NAME);
  return path.join(cwd, FALLBACK_RELATIVE_PATH);
}

function getTrackedSecretsConfigPath(cwd: string = process.cwd()): string {
  return path.join(cwd, FALLBACK_RELATIVE_PATH);
}

function isManagerName(value: unknown): value is SecretManagerName {
  return value === "doppler" || value === "infisical";
}

function ensureObject(value: unknown, source: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Malformed secrets config at ${source}: expected object`);
  }
  return value as Record<string, unknown>;
}

function validateManager(obj: Record<string, unknown>, source: string): SecretManagerName {
  if (!isManagerName(obj.manager)) {
    throw new Error(
      `Malformed secrets config at ${source}: "manager" must be "doppler" or "infisical"`,
    );
  }
  return obj.manager;
}

function validateProjectId(obj: Record<string, unknown>, source: string): string {
  if (typeof obj.projectId !== "string" || obj.projectId.length === 0) {
    throw new Error(
      `Malformed secrets config at ${source}: "projectId" must be a non-empty string`,
    );
  }
  return obj.projectId;
}

function parseConfig(raw: string, source: string): SecretsConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Malformed secrets config at ${source}: ${detail}`);
  }
  const obj = ensureObject(parsed, source);
  const config: SecretsConfig = {
    manager: validateManager(obj, source),
    projectId: validateProjectId(obj, source),
  };
  if (typeof obj.projectLabel === "string" && obj.projectLabel.length > 0) {
    config.projectLabel = obj.projectLabel;
  }
  return config;
}

export function readSecretsConfig(cwd?: string): SecretsConfig | null {
  const filePath = getSecretsConfigPath(cwd);
  if (existsSync(filePath)) return parseConfig(readFileSync(filePath, "utf8"), filePath);

  const fallbackPath = getTrackedSecretsConfigPath(cwd);
  if (fallbackPath !== filePath && existsSync(fallbackPath)) {
    return parseConfig(readFileSync(fallbackPath, "utf8"), fallbackPath);
  }

  return null;
}

export function hasSecretsConfig(cwd?: string): boolean {
  const filePath = getSecretsConfigPath(cwd);
  if (existsSync(filePath)) return true;

  const fallbackPath = getTrackedSecretsConfigPath(cwd);
  return fallbackPath !== filePath && existsSync(fallbackPath);
}

export function writeSecretsConfig(config: SecretsConfig, cwd?: string): void {
  if (!isManagerName(config.manager)) {
    throw new Error(`Invalid secrets config: "manager" must be "doppler" or "infisical"`);
  }
  if (typeof config.projectId !== "string" || config.projectId.length === 0) {
    throw new Error(`Invalid secrets config: "projectId" must be a non-empty string`);
  }
  const filePath = getSecretsConfigPath(cwd);
  mkdirSync(path.dirname(filePath), { recursive: true });
  const payload: SecretsConfig = { manager: config.manager, projectId: config.projectId };
  if (config.projectLabel !== undefined) payload.projectLabel = config.projectLabel;
  writeFileSync(filePath, JSON.stringify(payload, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(filePath, 0o600);
}
