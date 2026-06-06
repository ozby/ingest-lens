import { describe, expect, it } from "vitest";

import { createRuntimeEnv } from "@webpresso/runtime-env";

import { secretsResolver } from "./index";

describe("runtime-env-local", () => {
  it("supports the none profile without secrets", async () => {
    const { resolveRuntimeProfile } = createRuntimeEnv(secretsResolver);
    await expect(resolveRuntimeProfile("none", { fresh: true })).resolves.toEqual({});
  });
});
