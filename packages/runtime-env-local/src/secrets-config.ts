import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export type SecretManagerName = "doppler" | "infisical";

export interface SecretsProfileConfig {
  provider: string;
  environment: string;
}

export interface SecretsConfig {
  manager: SecretManagerName;
  projectId: string;
  projectLabel?: string;
  profiles?: Record<string, { environment: string }>;
}

const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/u;
const COMMITTED_RELATIVE_PATH = ".webpresso/secrets.config.json";

function resolveGitTopLevel(cwd: string): string | null {
  try {
    const out = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function findCommittedSecretsConfigPath(cwd: string): string {
  const gitRoot = resolveGitTopLevel(cwd);
  if (gitRoot) return path.join(gitRoot, COMMITTED_RELATIVE_PATH);

  let current = path.resolve(cwd);
  while (true) {
    const candidate = path.join(current, COMMITTED_RELATIVE_PATH);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return path.join(path.resolve(cwd), COMMITTED_RELATIVE_PATH);
    current = parent;
  }
}

export function getSecretsConfigPath(cwd: string = process.cwd()): string {
  return findCommittedSecretsConfigPath(cwd);
}

function isManagerName(value: unknown): value is SecretManagerName {
  return value === "doppler" || value === "infisical";
}

function ensureObject(value: unknown, source: string, label = "object"): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Malformed secrets config at ${source}: expected ${label}`);
  }
  return value as Record<string, unknown>;
}

function assertValidProjectSlug(value: unknown, source: string, label: string): string {
  if (typeof value !== "string" || !PROJECT_ID_PATTERN.test(value)) {
    throw new Error(
      `Malformed secrets config at ${source}: "${label}" must be a valid project slug`,
    );
  }
  return value;
}

function parseProfiles(
  value: unknown,
  source: string,
): Record<string, { environment: string }> | undefined {
  if (value === undefined) return undefined;
  const profilesInput = ensureObject(value, source, '"profiles" object');
  const profiles: Record<string, { environment: string }> = {};
  for (const [profileName, profileValue] of Object.entries(profilesInput)) {
    if (profileName.length === 0) {
      throw new Error(`Malformed secrets config at ${source}: profile names must be non-empty`);
    }
    const profile = ensureObject(profileValue, source, `profile "${profileName}" object`);
    if (typeof profile.provider !== "string" || profile.provider.length === 0) {
      throw new Error(
        `Malformed secrets config at ${source}: profile "${profileName}" must set provider`,
      );
    }
    if (typeof profile.environment !== "string" || profile.environment.length === 0) {
      throw new Error(
        `Malformed secrets config at ${source}: profile "${profileName}" must set environment`,
      );
    }
    profiles[profileName] = { environment: profile.environment };
  }
  return profiles;
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
  if (obj.schemaVersion !== 1) {
    throw new Error(`Malformed secrets config at ${source}: "schemaVersion" must be 1`);
  }
  if ("manager" in obj || "projectId" in obj) {
    throw new Error(
      `Malformed secrets config at ${source}: legacy manager/projectId metadata is not supported`,
    );
  }

  const providers = ensureObject(obj.providers, source, '"providers" object');
  const defaultProvider = ensureObject(providers.default, source, '"providers.default" object');
  if (!isManagerName(defaultProvider.type)) {
    throw new Error(
      `Malformed secrets config at ${source}: "providers.default.type" must be "doppler" or "infisical"`,
    );
  }

  const config: SecretsConfig = {
    manager: defaultProvider.type,
    projectId: assertValidProjectSlug(defaultProvider.project, source, "providers.default.project"),
  };
  if (typeof obj.projectLabel === "string" && obj.projectLabel.length > 0) {
    config.projectLabel = obj.projectLabel;
  }
  const profiles = parseProfiles(obj.profiles, source);
  if (profiles) config.profiles = profiles;
  return config;
}

export function readSecretsConfig(cwd?: string): SecretsConfig | null {
  const filePath = getSecretsConfigPath(cwd ?? process.cwd());
  if (!existsSync(filePath)) return null;
  return parseConfig(readFileSync(filePath, "utf8"), filePath);
}

export function hasSecretsConfig(cwd?: string): boolean {
  return existsSync(getSecretsConfigPath(cwd ?? process.cwd()));
}

export function writeSecretsConfig(config: SecretsConfig, cwd?: string): void {
  if (!isManagerName(config.manager)) {
    throw new Error(`Invalid secrets config: "manager" must be "doppler" or "infisical"`);
  }
  if (!PROJECT_ID_PATTERN.test(config.projectId)) {
    throw new Error(`Invalid secrets config: "projectId" must be a valid project slug`);
  }
  const filePath = getSecretsConfigPath(cwd ?? process.cwd());
  mkdirSync(path.dirname(filePath), { recursive: true });
  const payload = {
    schemaVersion: 1,
    providers: {
      default: {
        type: config.manager,
        project: config.projectId,
      },
    },
    profiles: Object.fromEntries(
      Object.entries(config.profiles ?? {}).map(([profileName, profile]) => [
        profileName,
        { provider: "default", environment: profile.environment },
      ]),
    ),
    sinks: {},
    ...(config.projectLabel !== undefined ? { projectLabel: config.projectLabel } : {}),
  };
  writeFileSync(filePath, JSON.stringify(payload, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
}
