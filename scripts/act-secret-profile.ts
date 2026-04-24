import { basename } from "node:path";

export type ActSecretProfileId = "none" | "github-api" | "neon-control-plane";

export interface ActSecretProfile {
  id: ActSecretProfileId;
  description: string;
  allowedKeys: readonly string[];
  requiredKeys: readonly string[];
  defaultSources: readonly string[];
}

export interface ResolveActSecretProfileOptions {
  workflowPath?: string;
  jobName?: string;
  explicitProfileId?: string;
}

const ACT_SECRET_PROFILES: Record<ActSecretProfileId, ActSecretProfile> = {
  none: {
    id: "none",
    description: "No secrets are injected into the act container.",
    allowedKeys: [],
    requiredKeys: [],
    defaultSources: [],
  },
  "github-api": {
    id: "github-api",
    description: "Least-privilege GitHub API token surface for workflow jobs.",
    allowedKeys: ["GITHUB_TOKEN", "GITHUB_PAT"],
    requiredKeys: [],
    defaultSources: [],
  },
  "neon-control-plane": {
    id: "neon-control-plane",
    description: "Neon control-plane credentials for branch lifecycle automation.",
    allowedKeys: ["NEON_API_KEY", "NEON_PROJECT_ID", "NEON_PARENT_BRANCH_ID"],
    requiredKeys: ["NEON_API_KEY", "NEON_PROJECT_ID", "NEON_PARENT_BRANCH_ID"],
    defaultSources: ["ozby-shell:dev"],
  },
};

const WORKFLOW_SECRET_PROFILES: Readonly<Record<string, ActSecretProfileId>> = {
  "ci.yml": "none",
  "testing-e2e.yml": "none",
  "testing-e2e-act.yml": "none",
  "cleanup-stale-neon-e2e-branches.yml": "neon-control-plane",
};

export function getActSecretProfile(profileId: ActSecretProfileId): ActSecretProfile {
  return ACT_SECRET_PROFILES[profileId];
}

export function isActSecretProfileId(value: string): value is ActSecretProfileId {
  return value in ACT_SECRET_PROFILES;
}

export function resolveActSecretProfile(options: ResolveActSecretProfileOptions): ActSecretProfile {
  if (options.explicitProfileId) {
    return getActSecretProfile(options.explicitProfileId);
  }

  const workflowName = options.workflowPath ? basename(options.workflowPath) : undefined;
  const workflowProfile = workflowName ? WORKFLOW_SECRET_PROFILES[workflowName] : undefined;
  const jobProfile = resolveJobSecretProfile(options.jobName);

  return getActSecretProfile(jobProfile ?? workflowProfile ?? "none");
}

export function pickAllowedSecrets(
  secretMap: Record<string, string>,
  allowedKeys: readonly string[],
): Record<string, string> {
  if (allowedKeys.length === 0) {
    return {};
  }

  return Object.fromEntries(
    allowedKeys.flatMap((key) => {
      const value = secretMap[key];
      return typeof value === "string" && value.length > 0 ? [[key, value] as const] : [];
    }),
  );
}

export function listMissingRequiredSecrets(
  secretMap: Record<string, string>,
  requiredKeys: readonly string[],
): string[] {
  return requiredKeys.filter((key) => {
    const value = secretMap[key];
    return typeof value !== "string" || value.length === 0;
  });
}

function resolveJobSecretProfile(jobName?: string): ActSecretProfileId | undefined {
  if (!jobName) {
    return undefined;
  }

  if (jobName === "cleanup") {
    return "neon-control-plane";
  }

  return undefined;
}
