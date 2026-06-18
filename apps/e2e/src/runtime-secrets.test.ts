import { describe, expect, it, vi } from "vitest";

import {
  LOCAL_E2E_BETTER_AUTH_SECRET,
  LOCAL_E2E_JWT_SECRET,
  hasInjectedNeonRuntimeConfig,
  hasSecretProviderToken,
  nonEmptyEnvValue,
  resolveE2eAuthSecrets,
  resolveE2eSecretEnv,
} from "./runtime-secrets";

describe("runtime secret resolution", () => {
  it("treats empty workflow secret expressions as missing values", () => {
    const env = {
      BETTER_AUTH_SECRET: "",
      JWT_SECRET: "",
      NEON_API_KEY: "neon-api-key",
      NEON_PROJECT_ID: "neon-project-id",
    };

    expect(nonEmptyEnvValue(env, "BETTER_AUTH_SECRET")).toBeUndefined();
    expect(hasInjectedNeonRuntimeConfig(env)).toBe(true);
    expect(resolveE2eAuthSecrets(env)).toEqual({
      jwtSecret: LOCAL_E2E_JWT_SECRET,
      betterAuthSecret: LOCAL_E2E_BETTER_AUTH_SECRET,
    });
  });

  it("prefers provider/direct runtime auth secrets when non-empty", () => {
    expect(
      resolveE2eAuthSecrets({
        ENCRYPTION_KEY: "encryption-key",
        JWT_SECRET: "jwt-secret",
        BETTER_AUTH_SECRET: "better-auth-secret",
      }),
    ).toEqual({
      jwtSecret: "jwt-secret",
      betterAuthSecret: "better-auth-secret",
    });
  });

  it("uses ENCRYPTION_KEY as the JWT-compatible e2e fallback before local defaults", () => {
    expect(resolveE2eAuthSecrets({ ENCRYPTION_KEY: "encryption-key" }).jwtSecret).toBe(
      "encryption-key",
    );
  });

  it("recognizes all supported secret-provider token aliases", () => {
    expect(hasSecretProviderToken({ SECRET_MANAGER_TOKEN: "token" })).toBe(true);
    expect(hasSecretProviderToken({ CI_SECRET_PROVIDER_TOKEN: "token" })).toBe(true);
    expect(hasSecretProviderToken({ DOPPLER_TOKEN: "token" })).toBe(true);
    expect(hasSecretProviderToken({ DOPPLER_TOKEN: "" })).toBe(false);
  });

  it("skips provider loading for local act when Neon is already injected and no provider token exists", async () => {
    const resolveRuntimeProfile = vi.fn(async () => ({ BETTER_AUTH_SECRET: "provider-secret" }));
    const env = await resolveE2eSecretEnv({
      env: {
        NEON_API_KEY: "neon-api-key",
        NEON_PROJECT_ID: "neon-project-id",
      },
      resolveRuntimeProfile,
    });

    expect(resolveRuntimeProfile).not.toHaveBeenCalled();
    expect(env.BETTER_AUTH_SECRET).toBeUndefined();
  });

  it("loads provider secrets when a provider token is present even if Neon is injected", async () => {
    const resolveRuntimeProfile = vi.fn(async () => ({
      BETTER_AUTH_SECRET: "provider-secret",
      NEON_API_KEY: "provider-neon-api-key",
      NEON_PROJECT_ID: "provider-neon-project-id",
    }));
    const env = await resolveE2eSecretEnv({
      env: {
        DOPPLER_TOKEN: "provider-token",
        NEON_API_KEY: "neon-api-key",
        NEON_PROJECT_ID: "neon-project-id",
      },
      resolveRuntimeProfile,
    });

    expect(resolveRuntimeProfile).toHaveBeenCalledWith("secrets-only", { fresh: true });
    expect(env.BETTER_AUTH_SECRET).toBe("provider-secret");
    expect(env.NEON_API_KEY).toBe("provider-neon-api-key");
  });

  it("fails closed when neither provider secrets nor injected Neon config are available", async () => {
    await expect(
      resolveE2eSecretEnv({
        env: {},
        resolveRuntimeProfile: async () => {
          throw new Error("provider unavailable");
        },
        logger: { warn: vi.fn() },
      }),
    ).rejects.toThrow("provider unavailable");
  });

  it("fails closed when a provider token is present but provider loading fails", async () => {
    const warn = vi.fn();
    await expect(
      resolveE2eSecretEnv({
        env: {
          DOPPLER_TOKEN: "provider-token",
          NEON_API_KEY: "neon-api-key",
          NEON_PROJECT_ID: "neon-project-id",
        },
        resolveRuntimeProfile: async () => {
          throw new Error("doppler unavailable");
        },
        logger: { warn },
      }),
    ).rejects.toThrow("doppler unavailable");

    expect(warn).not.toHaveBeenCalled();
  });

  it("fails closed when provider auth is present but required Neon e2e secrets are absent", async () => {
    await expect(
      resolveE2eSecretEnv({
        env: {
          DOPPLER_TOKEN: "provider-token",
          NEON_API_KEY: "direct-neon-api-key",
          NEON_PROJECT_ID: "direct-neon-project-id",
        },
        resolveRuntimeProfile: async () => ({ BETTER_AUTH_SECRET: "provider-secret" }),
      }),
    ).rejects.toThrow(
      "Secret provider did not return required e2e Neon secrets (NEON_API_KEY, NEON_PROJECT_ID).",
    );
  });
});
