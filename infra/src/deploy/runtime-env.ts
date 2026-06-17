import process from "node:process";

import { resolveRuntimeProfile } from "@repo/runtime-env-local";

type ResolveRuntimeProfile = (profile: "secrets-only") => Promise<Record<string, string>>;

export const DIRECT_DEPLOY_RUNTIME_ENV_NAMES = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ZONE_ID",
  "NEON_API_KEY",
  "NEON_PROJECT_ID",
  "PULUMI_ACCESS_TOKEN",
] as const;

let cachedResolveRuntimeProfile: ResolveRuntimeProfile | null = null;

export function loadResolveRuntimeProfile(): ResolveRuntimeProfile {
  if (cachedResolveRuntimeProfile) return cachedResolveRuntimeProfile;
  cachedResolveRuntimeProfile = (profile) => resolveRuntimeProfile(profile, { fresh: true });
  return cachedResolveRuntimeProfile;
}

export function setResolveRuntimeProfileForTests(resolver: ResolveRuntimeProfile | null): void {
  cachedResolveRuntimeProfile = resolver;
}

export async function resolveDeployRuntimeEnv(
  profile: "secrets-only",
  requiredDirectEnv: readonly string[],
): Promise<NodeJS.ProcessEnv> {
  const current = { ...process.env } as NodeJS.ProcessEnv;
  const missingDirectEnv = requiredDirectEnv.filter((key) => !current[key]);
  if (missingDirectEnv.length === 0) return current;

  const resolveRuntimeProfile = loadResolveRuntimeProfile();
  const merged = {
    ...current,
    ...(await resolveRuntimeProfile(profile)),
  } as NodeJS.ProcessEnv;
  const stillMissing = requiredDirectEnv.filter((key) => !merged[key]);
  if (stillMissing.length > 0) {
    throw new Error(`Deploy runtime is missing required values: ${stillMissing.join(", ")}`);
  }
  return merged;
}
