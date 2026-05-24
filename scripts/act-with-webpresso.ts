#!/usr/bin/env bun

import process from "node:process";
import { runWebpressoCli } from "./run-webpresso-cli.ts";
import {
  getActSecretProfile,
  isActSecretProfileId,
  resolveActSecretProfile,
  type ActSecretProfile,
  type ActSecretProfileId,
} from "./act-secret-profile.ts";

export type CiActPresetId = "ci" | "e2e" | "cleanup" | "list";

const FORBIDDEN_PUBLIC_HELPER_FLAGS = new Set([
  "--secret",
  "--secret-file",
  "--secret-source",
  "--chef-token",
  "--direct",
  "--allow-host-mutation",
  "--allow-local-chef-token",
  "--bind",
]);

export interface CiActPreset {
  id: CiActPresetId;
  description: string;
  workflow: string;
  job?: string;
  secretProfile: ActSecretProfile;
}

export interface CiActInvocation {
  command: "bun";
  args: string[];
  preset: CiActPreset;
}

const CI_ACT_PRESETS: Record<CiActPresetId, Omit<CiActPreset, "secretProfile"> & {
  secretProfileId: ActSecretProfileId;
}> = {
  ci: {
    id: "ci",
    description: "Local dry-run/execution preset for the main CI workflow.",
    workflow: "ci-main",
    secretProfileId: "none",
  },
  e2e: {
    id: "e2e",
    description: "Local preset for the act-only e2e workflow.",
    workflow: "testing-e2e-act",
    job: "full-suite-local",
    secretProfileId: "none",
  },
  cleanup: {
    id: "cleanup",
    description: "Local preset for Neon branch cleanup maintenance.",
    workflow: "cleanup-stale-neon-e2e-branches",
    job: "cleanup",
    secretProfileId: "neon-control-plane",
  },
  list: {
    id: "list",
    description: "Prepare a public-helper dry-run for the main CI workflow.",
    workflow: "ci-main",
    secretProfileId: "none",
  },
};

export function getCiActPreset(id: CiActPresetId): CiActPreset {
  const preset = CI_ACT_PRESETS[id];
  return {
    id: preset.id,
    description: preset.description,
    workflow: preset.workflow,
    job: preset.job,
    secretProfile: getActSecretProfile(preset.secretProfileId),
  };
}

export function listCiActPresets(): CiActPreset[] {
  return (Object.keys(CI_ACT_PRESETS) as CiActPresetId[]).map(getCiActPreset);
}

function isCiActPresetId(value: string): value is CiActPresetId {
  return value in CI_ACT_PRESETS;
}

function printPresetList(): void {
  for (const preset of listCiActPresets()) {
    const job = preset.job ? ` job=${preset.job}` : "";
    console.log(
      `${preset.id}\tworkflow=${preset.workflow}${job}\tprofile=${preset.secretProfile.id}`,
    );
  }
}

export function buildCiActInvocation(argv: readonly string[]): CiActInvocation {
  const [presetArg = "ci", ...rest] = argv;
  if (!isCiActPresetId(presetArg)) {
    throw new Error(
      `Unknown CI act preset "${presetArg}". Expected one of: ${Object.keys(CI_ACT_PRESETS).join(", ")}.`,
    );
  }

  const preset = getCiActPreset(presetArg);
  const args = ["./scripts/run-webpresso-cli.ts", "ci", "act", "--workflow", preset.workflow];

  if (preset.job) args.push("--job", preset.job);
  if (preset.secretProfile.id !== "none") args.push("--env-profile", preset.secretProfile.id);
  let execute = presetArg !== "list";
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--dry-run") {
      execute = false;
      continue;
    }
    if (arg === "--execute") {
      execute = true;
      continue;
    }
    if (arg === "--secret-profile") {
      const profileId = rest[index + 1];
      if (!profileId || !isActSecretProfileId(profileId)) {
        throw new Error("--secret-profile requires one of: none, github-api, neon-control-plane.");
      }
      const resolved = resolveActSecretProfile({ explicitProfileId: profileId });
      if (resolved.id !== preset.secretProfile.id) {
        throw new Error(
          `Preset ${preset.id} owns profile ${preset.secretProfile.id}; refusing override to ${resolved.id}.`,
        );
      }
      index += 1;
      continue;
    }
    if (FORBIDDEN_PUBLIC_HELPER_FLAGS.has(arg) || arg.startsWith("--secret=") || arg.startsWith("--secret-file=") || arg.startsWith("--secret-source=") || arg.startsWith("--chef-token=")) {
      throw new Error(
        `${arg} is not accepted by IngestLens presets; use the public wp ci act secret gate.`,
      );
    }
    args.push(arg);
  }

  if (execute) args.push("--execute");

  return {
    command: "bun",
    args,
    preset,
  };
}

export function main(argv = process.argv.slice(2)): void {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    console.log(
      "Usage: bun ./scripts/act-with-webpresso.ts <ci|e2e|cleanup|list> [--dry-run|--execute]",
    );
    console.log("\nPresets:");
    printPresetList();
    return;
  }

  const invocation = buildCiActInvocation(argv);
  console.error(
    `▶ wp ci act preset=${invocation.preset.id} workflow=${invocation.preset.workflow} profile=${invocation.preset.secretProfile.id}`,
  );
  process.exit(runWebpressoCli(invocation.args.slice(1)));
}

if (import.meta.main) {
  main();
}
