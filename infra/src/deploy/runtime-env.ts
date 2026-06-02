import { resolveRuntimeProfile } from "@webpresso/webpresso/runtime/env";
import process from "node:process";

export async function resolveDeployRuntimeEnv(
  profile: "secrets-only",
  requiredDirectEnv: readonly string[],
): Promise<NodeJS.ProcessEnv> {
  try {
    return {
      ...process.env,
      ...(await resolveRuntimeProfile(profile)),
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
