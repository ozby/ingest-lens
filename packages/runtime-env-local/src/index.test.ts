import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { resolveRuntimeProfile } from "./index";
import { resolveGenericSecretManagerToken, shouldUseInjectedSecretEnv } from "./secret-selection";
import { readSecretsConfig } from "./secrets-config";

describe("runtime-env-local", () => {
  it("supports the none profile without secrets", async () => {
    await expect(resolveRuntimeProfile("none", { fresh: true })).resolves.toEqual({});
  });

  it("accepts CI secret-provider token aliases", () => {
    expect(resolveGenericSecretManagerToken({ SECRET_MANAGER_TOKEN: "secret-manager" })).toBe(
      "secret-manager",
    );
    expect(resolveGenericSecretManagerToken({ CI_SECRET_PROVIDER_TOKEN: "ci-provider" })).toBe(
      "ci-provider",
    );
    expect(resolveGenericSecretManagerToken({ DOPPLER_TOKEN: "doppler" })).toBe("doppler");
    expect(
      resolveGenericSecretManagerToken({ SECRET_MANAGER_TOKEN: "", DOPPLER_TOKEN: "" }),
    ).toBeUndefined();
  });

  it("uses directly injected secrets only when no provider token is present", () => {
    expect(
      shouldUseInjectedSecretEnv({
        ENCRYPTION_KEY: "encryption-key",
        CLOUDFLARE_API_TOKEN: "cloudflare-token",
      }),
    ).toBe(true);
    expect(
      shouldUseInjectedSecretEnv({
        CI_SECRET_PROVIDER_TOKEN: "provider-token",
        ENCRYPTION_KEY: "encryption-key",
        CLOUDFLARE_API_TOKEN: "cloudflare-token",
      }),
    ).toBe(false);
  });

  it("reads the tracked secrets config in fresh CI git checkouts", () => {
    const repo = mkdtempSync(path.join(tmpdir(), "runtime-env-local-config-"));
    try {
      execFileSync("git", ["init"], { cwd: repo, stdio: "ignore" });
      mkdirSync(path.join(repo, ".webpresso"), { recursive: true });
      writeFileSync(
        path.join(repo, ".webpresso", "secrets.config.json"),
        JSON.stringify({ manager: "doppler", projectId: "node-pubsub" }),
      );

      expect(readSecretsConfig(repo)).toEqual({
        manager: "doppler",
        projectId: "node-pubsub",
      });
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
