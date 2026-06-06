import { createRequire } from "node:module";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { createRuntimeEnv as packageCreateRuntimeEnv } from "@webpresso/runtime-env";

type ResolveRuntimeProfile = (profile: "secrets-only") => Promise<Record<string, string>>;

const require = createRequire(import.meta.url);

let cachedResolveRuntimeProfile: ResolveRuntimeProfile | null = null;

export async function loadResolveRuntimeProfile(
  resolveModule: (specifier: string) => string = require.resolve,
  importModule: (specifier: string) => Promise<unknown> = (specifier) => import(specifier),
  createRuntimeEnv: typeof packageCreateRuntimeEnv = packageCreateRuntimeEnv,
): Promise<ResolveRuntimeProfile> {
  if (cachedResolveRuntimeProfile) return cachedResolveRuntimeProfile;

  const modulePath = resolveModule("@repo/runtime-env-local");
  const moduleHref = pathToFileURL(modulePath).href;
  const loaded = (await importModule(moduleHref)) as {
    secretsResolver?: unknown;
  };

  if (!loaded.secretsResolver) {
    throw new Error(
      "Expected @repo/runtime-env-local to export secretsResolver",
    );
  }

  cachedResolveRuntimeProfile = createRuntimeEnv(
    loaded.secretsResolver as typeof secretsResolver,
  ).resolveRuntimeProfile;
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
