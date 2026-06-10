import process from "node:process";

import { resolveRuntimeEnvironment } from "@webpresso/agent-kit/local";

type ResolveRuntimeProfile = (profile: "secrets-only") => Record<string, string>;

let cachedResolveRuntimeProfile: ResolveRuntimeProfile | null = null;

export async function loadResolveRuntimeProfile(): Promise<ResolveRuntimeProfile> {
  if (cachedResolveRuntimeProfile) return cachedResolveRuntimeProfile;
  cachedResolveRuntimeProfile = (profile) =>
    resolveRuntimeEnvironment({
      cwd: process.cwd(),
      profile,
    });
  return cachedResolveRuntimeProfile;
}

export async function resolveDeployRuntimeEnv(
  profile: "secrets-only",
  requiredDirectEnv: readonly string[],
): Promise<NodeJS.ProcessEnv> {
  try {
    const resolveRuntimeProfile = await loadResolveRuntimeProfile();
    return {
      ...process.env,
      ...resolveRuntimeProfile(profile),
    } as NodeJS.ProcessEnv;
  } catch (error) {
    const missing = requiredDirectEnv.filter((key) => !process.env[key]);
    if (process.env.CI === "true" && missing.length === 0) {
      return { ...process.env };
    }
    if (process.env.CI === "true") {
      throw new Error(`Deploy runtime is missing required values: ${missing.join(", ")}`);
    }
    throw error;
  }
}
