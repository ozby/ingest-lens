import { describe, expect, it } from "vitest";

import { loadResolveRuntimeProfile } from "./runtime-env";

describe("loadResolveRuntimeProfile", () => {
  it("caches the runtime profile resolver", async () => {
    const first = await loadResolveRuntimeProfile();
    const second = await loadResolveRuntimeProfile();

    expect(first).toBe(second);
  });
});
