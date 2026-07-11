import process from "node:process";

import { createSecretsRuntimeEnv } from "@webpresso/runtime/env";

type ResolveRuntimeProfile = (profile: "secrets-only") => Promise<Record<string, string>>;

const REQUIRED_RUNTIME_SECRET_KEYS = ["CLOUDFLARE_API_TOKEN", "NEON_API_KEY"] as const;
const runtimeEnv = createSecretsRuntimeEnv({ requiredEnvKeys: REQUIRED_RUNTIME_SECRET_KEYS });

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
  cachedResolveRuntimeProfile = (profile) =>
    runtimeEnv.resolveRuntimeProfile(profile, { fresh: true });
  return cachedResolveRuntimeProfile;
}

export function setResolveRuntimeProfileForTests(resolver: ResolveRuntimeProfile | null): void {
  cachedResolveRuntimeProfile = resolver;
}

export async function resolveDeployRuntimeEnv(
  profile: "secrets-only",
  requiredDirectEnv: readonly string[],
): Promise<NodeJS.ProcessEnv> {
  const missing = requiredDirectEnv.filter((key) => !process.env[key]);

  if (process.env.CI === "true") {
    if (missing.length > 0) {
      throw new Error(`Deploy runtime is missing required values: ${missing.join(", ")}`);
    }
    return { ...process.env };
  }

  const resolveRuntimeProfile = loadResolveRuntimeProfile();
  return {
    ...process.env,
    ...(await resolveRuntimeProfile(profile)),
  } as NodeJS.ProcessEnv;
}
