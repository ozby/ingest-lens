import { describe, expect, it } from "vitest";

import { resolveRuntimeProfile } from "./index";

describe("runtime-env-local", () => {
  it("supports the none profile without secrets", async () => {
    await expect(resolveRuntimeProfile("none", { fresh: true })).resolves.toEqual({});
  });
});
