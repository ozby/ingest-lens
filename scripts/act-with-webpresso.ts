#!/usr/bin/env bun

import { createRuntimeEnv } from "@webpresso/runtime-env";
import { secretsResolver } from "@repo/runtime-env-local";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import process from "node:process";
import {
  isActSecretProfileId,
  listMissingRequiredSecrets,
  pickAllowedSecrets,
  resolveActSecretProfile,
  type ActSecretProfile,
} from "./act-secret-profile.ts";

const { resolveRuntimeProfile } = createRuntimeEnv(secretsResolver);

export function stripPassthroughSentinel(args: string[]): string[] {
  if (args[0] === "--") {
    return args.slice(1);
  }
  return args;
}

export function injectDefaultActArgs(
  args: string[],
  platform = process.platform,
  arch = process.arch,
): string[] {
  const hasArchitectureFlag = args.includes("--container-architecture");
  if (platform === "darwin" && arch === "arm64" && !hasArchitectureFlag) {
    return ["--container-architecture", "linux/amd64", ...args];
  }
  return args;
}

export function extractAbsoluteFileDependencyDirectories(
  manifests: Array<Record<string, unknown>>,
): string[] {
  const directories = new Set<string>();
  const dependencyKeys = [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ] as const;

  for (const manifest of manifests) {
    for (const dependencyKey of dependencyKeys) {
      const dependencies = manifest[dependencyKey];
      if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) {
        continue;
      }

      for (const value of Object.values(dependencies)) {
        if (typeof value !== "string" || !value.startsWith("file:")) {
          continue;
        }
        const filePath = value.slice("file:".length);
        if (!isAbsolute(filePath)) {
          continue;
        }
        directories.add(dirname(filePath));
      }
    }
  }

  return [...directories].sort();
}

export function injectContainerMountArgs(args: string[], mountDirectories: string[]): string[] {
  if (mountDirectories.length === 0) {
    return args;
  }

  const mountFlags = mountDirectories
    .map((directory) => `-v ${directory}:${directory}:ro`)
    .join(" ");
  const nextArgs = [...args];
  const containerOptionsIndex = nextArgs.findIndex((arg) => arg === "--container-options");

  if (containerOptionsIndex >= 0 && nextArgs[containerOptionsIndex + 1]) {
    nextArgs[containerOptionsIndex + 1] =
      `${nextArgs[containerOptionsIndex + 1]} ${mountFlags}`.trim();
    return nextArgs;
  }

  return ["--container-options", mountFlags, ...nextArgs];
}

export function normalizeActSecrets(
  secretMaps: Array<Record<string, string>>,
): Record<string, string> {
  return normalizeActSecretsWithOptions(secretMaps, { mapGithubPatToToken: false });
}

export function normalizeActSecretsWithOptions(
  secretMaps: Array<Record<string, string>>,
  options: { mapGithubPatToToken: boolean },
): Record<string, string> {
  const merged: Record<string, string> = {};

  for (const secretMap of secretMaps) {
    for (const [key, value] of Object.entries(secretMap)) {
      if (value.length > 0) {
        merged[key] = value;
      }
    }
  }

  if (options.mapGithubPatToToken && !merged.GITHUB_TOKEN && merged.GITHUB_PAT) {
    merged.GITHUB_TOKEN = merged.GITHUB_PAT;
  }

  return merged;
}

export function renderSecretsFile(secretMap: Record<string, string>): string {
  return Object.entries(secretMap)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join("\n");
}

function assertBinary(name: string, installHint: string): void {
  try {
    execFileSync(name, ["--version"], { stdio: "ignore" });
  } catch {
    console.error(`\n❌  ${name} not found. ${installHint}\n`);
    process.exit(1);
  }
}

interface ParsedArgState {
  actArgs: string[];
  strictSecrets: boolean;
  explicitProfileId: ActSecretProfile["id"] | undefined;
  workflowPath: string | undefined;
  jobName: string | undefined;
}

function processCustomFlag(state: ParsedArgState, argv: string[], index: number): number | null {
  const arg = argv[index];
  if (arg === "--") {
    return index;
  }
  if (arg === "--strict-secrets") {
    state.strictSecrets = true;
    return index;
  }
  if (arg === "--secret-profile") {
    const profileId = argv[index + 1];
    if (!profileId || !isActSecretProfileId(profileId)) {
      throw new Error(
        "--secret-profile requires one of: none, github-api, github-auth-preflight, neon-control-plane.",
      );
    }
    state.explicitProfileId = profileId;
    return index + 1;
  }
  if (arg === "--secret-source") {
    throw new Error(
      "--secret-source is no longer supported. Configure the repo once with `wp config secrets setup`.",
    );
  }
  if (arg === "--secret-file") {
    throw new Error(
      "Do not pass --secret-file directly to act-with-webpresso.ts. It generates the file automatically.",
    );
  }
  return null;
}

function processOneArg(state: ParsedArgState, argv: string[], index: number): number {
  const customResult = processCustomFlag(state, argv, index);
  if (customResult !== null) return customResult;
  const arg = argv[index];
  if ((arg === "-W" || arg === "--workflows") && argv[index + 1]) {
    state.workflowPath = argv[index + 1];
  }
  if ((arg === "-j" || arg === "--job") && argv[index + 1]) {
    state.jobName = argv[index + 1];
  }
  state.actArgs.push(arg);
  return index;
}

function parseCliArgs(argv: string[]): {
  actArgs: string[];
  strictSecrets: boolean;
  secretProfile: ActSecretProfile;
} {
  const state: ParsedArgState = {
    actArgs: [],
    strictSecrets: false,
    explicitProfileId: undefined,
    workflowPath: undefined,
    jobName: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    index = processOneArg(state, argv, index);
  }

  return {
    actArgs: state.actArgs,
    strictSecrets: state.strictSecrets,
    secretProfile: resolveActSecretProfile({
      workflowPath: state.workflowPath,
      jobName: state.jobName,
      explicitProfileId: state.explicitProfileId,
    }),
  };
}

function loadAmbientSecrets(allowedKeys: readonly string[]): Record<string, string> {
  return pickAllowedSecrets(process.env as Record<string, string>, allowedKeys);
}

function tryGetGithubCliToken(): string | null {
  try {
    const token = execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

export function applyGithubCliFallback(
  secretMap: Record<string, string>,
  secretProfile: ActSecretProfile,
  fallbackToken: string | null,
): Record<string, string> {
  if (secretProfile.id !== "github-auth-preflight" || !fallbackToken) {
    return secretMap;
  }

  return {
    ...secretMap,
    ...(secretMap.GITHUB_TOKEN ? {} : { GITHUB_TOKEN: fallbackToken }),
    ...(secretMap.GH_PACKAGES_TOKEN ? {} : { GH_PACKAGES_TOKEN: fallbackToken }),
  };
}

async function loadSelectedSecrets(
  allowedKeys: readonly string[],
): Promise<Record<string, string> | null> {
  if (allowedKeys.length === 0) {
    return {};
  }

  try {
    const resolvedEnv = await resolveRuntimeProfile("secrets-only", { fresh: true });
    return pickAllowedSecrets(
      {
        ...(process.env as Record<string, string>),
        ...resolvedEnv,
      },
      allowedKeys,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    console.warn(`⚠️  Skipping selected secret-manager injection (${reason})`);
    return null;
  }
}

function loadManifestObjects(): Array<Record<string, unknown>> {
  const manifests: Array<Record<string, unknown>> = [];
  const manifestPaths = [
    "package.json",
    ...["apps", "packages"].flatMap((directory) =>
      readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(directory, entry.name, "package.json")),
    ),
    join("infra", "package.json"),
  ];

  for (const manifestPath of manifestPaths) {
    try {
      manifests.push(JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>);
    } catch {
      // ignore missing/non-JSON manifests
    }
  }

  return manifests;
}

export async function main(): Promise<void> {
  const { actArgs, strictSecrets, secretProfile } = parseCliArgs(
    stripPassthroughSentinel(process.argv.slice(2)),
  );
  assertBinary("act", "Install via: brew install act");

  const selectedSecrets = await loadSelectedSecrets(secretProfile.allowedKeys);
  if (strictSecrets && selectedSecrets === null) {
    process.exit(1);
  }

  const secretMap = applyGithubCliFallback(
    normalizeActSecretsWithOptions(
      [
        ...(selectedSecrets ? [selectedSecrets] : []),
        loadAmbientSecrets(secretProfile.allowedKeys),
      ],
      {
        mapGithubPatToToken:
          secretProfile.id === "github-api" && process.env.ACT_MAP_GITHUB_PAT === "1",
      },
    ),
    secretProfile,
    tryGetGithubCliToken(),
  );
  const missingRequiredKeys = listMissingRequiredSecrets(secretMap, secretProfile.requiredKeys);
  if (strictSecrets && missingRequiredKeys.length > 0) {
    console.error(
      `\n❌  Missing required secrets for profile "${secretProfile.id}": ${missingRequiredKeys.join(", ")}\n`,
    );
    process.exit(1);
  }

  const tempDirectory = mkdtempSync(join(tmpdir(), "act-secrets-"));
  const secretFile = join(tempDirectory, "secrets.env");

  try {
    writeFileSync(secretFile, `${renderSecretsFile(secretMap)}\n`, "utf8");
    const mountDirectories = extractAbsoluteFileDependencyDirectories(loadManifestObjects());
    const finalArgs = [
      ...injectContainerMountArgs(injectDefaultActArgs(actArgs), mountDirectories),
      "--secret-file",
      secretFile,
    ];
    const injectedSecretKeys = Object.keys(secretMap)
      .filter((key) => key !== "DOPPLER_SERVICE_TOKEN" && key !== "DOPPLER_TOKEN")
      .sort();
    console.error(
      `▶ act ${finalArgs.join(" ")}\n  secret profile: ${secretProfile.id}\n  injected secrets: ${injectedSecretKeys.join(", ") || "(none)"}`,
    );

    const result = spawnSync("act", finalArgs, {
      stdio: "inherit",
      shell: false,
    });

    process.exit(result.status ?? 1);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  await main();
}
