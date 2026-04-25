import { describe, it, expect } from "vitest";
import * as testUtils from "../index";

describe("@repo/test-utils", () => {
  it("exports deepFreeze", () => {
    expect(typeof testUtils.deepFreeze).toBe("function");
  });
});
