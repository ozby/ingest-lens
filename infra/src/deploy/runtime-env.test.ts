import { describe, expect, it, vi } from "vitest";

import { loadResolveRuntimeProfile } from "./runtime-env";

describe("loadResolveRuntimeProfile", () => {
  it("loads resolveRuntimeProfile from the resolved framework runtime module path", async () => {
    const resolveModule = vi.fn(() => "/tmp/runtime-env/index.js");
    const resolveRuntimeProfile = vi.fn(async () => ({ JWT_SECRET: "secret" }));
    const importModule = vi.fn(async (specifier: string) => {
      expect(specifier).toBe("file:///tmp/runtime-env/index.js");
      return { resolveRuntimeProfile };
    });

    const loaded = await loadResolveRuntimeProfile(resolveModule, importModule);

    expect(resolveModule).toHaveBeenCalledWith("@webpresso/webpresso/runtime/env");
    expect(importModule).toHaveBeenCalledOnce();
    expect(await loaded("secrets-only")).toEqual({ JWT_SECRET: "secret" });
  });
});
