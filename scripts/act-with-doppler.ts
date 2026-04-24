#!/usr/bin/env bun

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import process from "node:process";
import {
  getActSecretProfile,
  isActSecretProfileId,
  listMissingRequiredSecrets,
  pickAllowedSecrets,
  resolveActSecretProfile,
  type ActSecretProfile,
} from "./act-secret-profile.ts";

export type DopplerSource = {
  project: string;
  config: string;
};

export function parseDopplerSource(spec: string): DopplerSource {
  const [project, config] = spec.split(":");
  if (!project || !config) {
    throw new Error(`Invalid Doppler source "${spec}". Expected <project>:<config>.`);
  }
  return { project, config };
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

function parseCliArgs(argv: string[]): {
  actArgs: string[];
  strictSecrets: boolean;
  sources: DopplerSource[];
  secretProfile: ActSecretProfile;
} {
  const actArgs: string[] = [];
  let strictSecrets = false;
  const explicitSources: DopplerSource[] = [];
  let explicitProfileId: ActSecretProfile["id"] | undefined;
  let workflowPath: string | undefined;
  let jobName: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--strict-secrets") {
      strictSecrets = true;
      continue;
    }
    if (arg === "--doppler-source") {
      const spec = argv[index + 1];
      if (!spec) {
        throw new Error("--doppler-source requires a value like <project>:<config>.");
      }
      explicitSources.push(parseDopplerSource(spec));
      index += 1;
      continue;
    }
    if (arg === "--secret-profile") {
      const profileId = argv[index + 1];
      if (!profileId || !isActSecretProfileId(profileId)) {
        throw new Error("--secret-profile requires one of: none, github-api, neon-control-plane.");
      }
      explicitProfileId = profileId;
      index += 1;
      continue;
    }
    if (arg === "--secret-file") {
      throw new Error(
        "Do not pass --secret-file directly to act-with-doppler.ts. It generates the file automatically.",
      );
    }
    if ((arg === "-W" || arg === "--workflows") && argv[index + 1]) {
      workflowPath = argv[index + 1];
    }
    if ((arg === "-j" || arg === "--job") && argv[index + 1]) {
      jobName = argv[index + 1];
    }
    actArgs.push(arg);
  }

  const secretProfile = resolveActSecretProfile({
    workflowPath,
    jobName,
    explicitProfileId,
  });
  const sourceSpecs = resolveDopplerSources(secretProfile, explicitSources);

  return {
    actArgs,
    strictSecrets,
    sources: sourceSpecs,
    secretProfile,
  };
}

function resolveDopplerSources(
  secretProfile: ActSecretProfile,
  explicitSources: readonly DopplerSource[],
): DopplerSource[] {
  if (explicitSources.length > 0) {
    return [...explicitSources];
  }

  if (secretProfile.allowedKeys.length === 0) {
    return [];
  }

  const envSources = process.env.ACT_DOPPLER_SOURCES?.split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map(parseDopplerSource);
  if ((envSources?.length ?? 0) > 0) {
    return envSources ?? [];
  }

  return secretProfile.defaultSources.map(parseDopplerSource);
}

function loadDopplerSecrets(
  source: DopplerSource,
  allowedKeys: readonly string[],
): Record<string, string> | null {
  try {
    const output = execFileSync(
      "doppler",
      [
        "secrets",
        "download",
        "--project",
        source.project,
        "--config",
        source.config,
        "--no-file",
        "--format",
        "json",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return pickAllowedSecrets(JSON.parse(output) as Record<string, string>, allowedKeys);
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    console.warn(`⚠️  Skipping Doppler source ${source.project}:${source.config} (${reason})`);
    return null;
  }
}

function loadAmbientSecrets(allowedKeys: readonly string[]): Record<string, string> {
  return pickAllowedSecrets(process.env as Record<string, string>, allowedKeys);
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

function main(): void {
  const { actArgs, strictSecrets, sources, secretProfile } = parseCliArgs(process.argv.slice(2));
  assertBinary("act", "Install via: brew install act");
  if (sources.length > 0) {
    assertBinary("doppler", "Install via: brew install dopplerhq/cli/doppler");
  }

  const dopplerResults = sources.map((source) =>
    loadDopplerSecrets(source, secretProfile.allowedKeys),
  );
  if (strictSecrets && dopplerResults.some((result) => result === null)) {
    process.exit(1);
  }

  const secretMap = normalizeActSecretsWithOptions(
    [
      ...dopplerResults.filter((result): result is Record<string, string> => result !== null),
      loadAmbientSecrets(secretProfile.allowedKeys),
    ],
    {
      mapGithubPatToToken:
        secretProfile.id === "github-api" && process.env.ACT_MAP_GITHUB_PAT === "1",
    },
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
    console.error(
      `▶ act ${finalArgs.join(" ")}\n  secret profile: ${secretProfile.id}\n  injected secrets: ${Object.keys(secretMap).sort().join(", ") || "(none)"}`,
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
  main();
}
