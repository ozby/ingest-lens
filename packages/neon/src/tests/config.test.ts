import { describe, expect, it } from "vitest";
import { getNeonConfig, isNeonAvailable } from "../config";

describe("@repo/neon config", () => {
  it("reads Neon config from environment-like objects", () => {
    expect(
      getNeonConfig({
        NEON_API_KEY: "neon-key",
        NEON_PROJECT_ID: "project-id",
        NEON_PARENT_BRANCH_ID: "parent-branch-id",
      }),
    ).toEqual({
      apiKey: "neon-key",
      projectId: "project-id",
      parentBranchId: "parent-branch-id",
      apiBaseUrl: "https://console.neon.tech/api/v2",
    });
  });

  it("reports availability only when all required Neon vars exist", () => {
    expect(
      isNeonAvailable({
        NEON_API_KEY: "neon-key",
        NEON_PROJECT_ID: "project-id",
        NEON_PARENT_BRANCH_ID: "parent-branch-id",
      }),
    ).toBe(true);
    expect(isNeonAvailable({ NEON_API_KEY: "missing-rest" })).toBe(false);
  });
});
