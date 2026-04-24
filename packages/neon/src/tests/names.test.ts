import { describe, expect, it } from "vitest";
import { generateBranchName } from "../names";

describe("generateBranchName", () => {
  it("builds deterministic branch names from explicit inputs", () => {
    expect(
      generateBranchName({
        prefix: "e2e",
        timestamp: new Date("2026-04-24T10:11:12.000Z"),
        randomSuffix: "abc1",
      }),
    ).toBe("e2e/20260424101112-abc1");
  });
});
