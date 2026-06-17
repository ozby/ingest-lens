import { describe, expect, it } from "vitest";

import { resolveGenericSecretManagerToken } from "./secret-selection";

describe("resolveGenericSecretManagerToken", () => {
  it("prefers the explicit generic secret-manager token", () => {
    expect(
      resolveGenericSecretManagerToken({
        SECRET_MANAGER_TOKEN: "generic-token",
        CI_SECRET_PROVIDER_TOKEN: "ci-token",
      }),
    ).toBe("generic-token");
  });

  it("falls back to undefined when no generic token is present", () => {
    expect(
      resolveGenericSecretManagerToken({
        CI_SECRET_PROVIDER_TOKEN: "ci-token",
      }),
    ).toBeUndefined();
  });
});
