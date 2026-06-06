import { describe, expect, it } from "vitest";

import { add, clamp } from "./quality-sample.js";

describe("quality sample", () => {
  it("adds two numbers", () => {
    expect(add(2, 3)).toBe(5);
  });

  it("clamps values below, inside, and above the range", () => {
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it("rejects an invalid range", () => {
    expect(() => clamp(1, 10, 0)).toThrow(RangeError);
  });
});
