import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadResolveRuntimeProfile,
  resolveDeployRuntimeEnv,
  setResolveRuntimeProfileForTests,
} from "./runtime-env";

describe("runtime env deploy resolution", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    setResolveRuntimeProfileForTests(null);
    process.env = {
      ...originalEnv,
      PATH: "/usr/bin",
      CI: "",
    };
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.NEON_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    setResolveRuntimeProfileForTests(null);
  });

  it("caches the runtime profile resolver", async () => {
    const first = await loadResolveRuntimeProfile();
    const second = await loadResolveRuntimeProfile();

    expect(first).toBe(second);
  });

  it("merges resolved runtime secrets into the deploy environment", async () => {
    const resolver = vi.fn().mockResolvedValue({
      JWT_SECRET: "secret",
      DATABASE_URL: "postgres://example",
    });
    setResolveRuntimeProfileForTests(resolver);

    const env = await resolveDeployRuntimeEnv("secrets-only", []);

    expect(resolver).toHaveBeenCalledWith("secrets-only");
    expect(env.PATH).toBe("/usr/bin");
    expect(env.JWT_SECRET).toBe("secret");
    expect(env.DATABASE_URL).toBe("postgres://example");
  });

  it("uses direct CI env when required deploy values are already present", async () => {
    const resolver = vi.fn().mockRejectedValue(new Error("should not resolve in CI"));
    setResolveRuntimeProfileForTests(resolver);
    process.env.CI = "true";
    process.env.CLOUDFLARE_API_TOKEN = "token";

    const env = await resolveDeployRuntimeEnv("secrets-only", ["CLOUDFLARE_API_TOKEN"]);

    expect(resolver).not.toHaveBeenCalled();
    expect(env.CLOUDFLARE_API_TOKEN).toBe("token");
  });

  it("fails loudly in CI when required deploy values are missing", async () => {
    const resolver = vi.fn();
    setResolveRuntimeProfileForTests(resolver);
    process.env.CI = "true";

    await expect(
      resolveDeployRuntimeEnv("secrets-only", ["CLOUDFLARE_API_TOKEN", "NEON_API_KEY"]),
    ).rejects.toThrow(
      "Deploy runtime is missing required values: CLOUDFLARE_API_TOKEN, NEON_API_KEY",
    );
    expect(resolver).not.toHaveBeenCalled();
  });

  it("rethrows resolver failures outside CI", async () => {
    const error = new Error("secret resolution failed");
    const resolver = vi.fn().mockRejectedValue(error);
    setResolveRuntimeProfileForTests(resolver);

    await expect(resolveDeployRuntimeEnv("secrets-only", [])).rejects.toBe(error);
    expect(resolver).toHaveBeenCalledWith("secrets-only");
  });
});
