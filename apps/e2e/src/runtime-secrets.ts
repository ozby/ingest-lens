import type { RuntimeProfile } from "@repo/runtime-env-local";

export const LOCAL_E2E_JWT_SECRET = "local-dev-jwt-secret";
export const LOCAL_E2E_BETTER_AUTH_SECRET = "local-dev-better-auth-secret-32-chars!!";

type Logger = Pick<Console, "warn">;

type ResolveRuntimeProfile = (
  profile: RuntimeProfile,
  options?: { fresh?: boolean },
) => Promise<Record<string, string>>;

export function nonEmptyEnvValue(
  env: Record<string, string | undefined>,
  key: string,
): string | undefined {
  const value = env[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function hasInjectedNeonRuntimeConfig(env: Record<string, string | undefined>): boolean {
  return Boolean(nonEmptyEnvValue(env, "NEON_API_KEY") && nonEmptyEnvValue(env, "NEON_PROJECT_ID"));
}

export function hasSecretProviderToken(env: Record<string, string | undefined>): boolean {
  return Boolean(
    nonEmptyEnvValue(env, "SECRET_MANAGER_TOKEN") ||
    nonEmptyEnvValue(env, "CI_SECRET_PROVIDER_TOKEN") ||
    nonEmptyEnvValue(env, "DOPPLER_TOKEN"),
  );
}

export async function resolveE2eSecretEnv({
  env,
  resolveRuntimeProfile,
  logger = console,
}: {
  env: NodeJS.ProcessEnv;
  resolveRuntimeProfile: ResolveRuntimeProfile;
  logger?: Logger;
}): Promise<NodeJS.ProcessEnv> {
  const injectedNeonConfig = hasInjectedNeonRuntimeConfig(env);
  const providerTokenPresent = hasSecretProviderToken(env);
  const shouldResolveSecrets = !injectedNeonConfig || providerTokenPresent;

  if (!shouldResolveSecrets) {
    return { ...env };
  }

  try {
    const runtimeSecrets = await resolveRuntimeProfile("secrets-only", { fresh: true });
    if (providerTokenPresent && !hasInjectedNeonRuntimeConfig(runtimeSecrets)) {
      throw new Error(
        "Secret provider did not return required e2e Neon secrets (NEON_API_KEY, NEON_PROJECT_ID).",
      );
    }
    return {
      ...env,
      ...runtimeSecrets,
    };
  } catch (error) {
    if (!injectedNeonConfig || providerTokenPresent) {
      throw error;
    }

    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    logger.warn(`[e2e] Secret-provider resolution skipped; using injected Neon env: ${reason}`);
    return { ...env };
  }
}

export function resolveE2eAuthSecrets(env: Record<string, string | undefined>): {
  jwtSecret: string;
  betterAuthSecret: string;
} {
  return {
    jwtSecret:
      nonEmptyEnvValue(env, "JWT_SECRET") ??
      nonEmptyEnvValue(env, "ENCRYPTION_KEY") ??
      LOCAL_E2E_JWT_SECRET,
    betterAuthSecret: nonEmptyEnvValue(env, "BETTER_AUTH_SECRET") ?? LOCAL_E2E_BETTER_AUTH_SECRET,
  };
}
