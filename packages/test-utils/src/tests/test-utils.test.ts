import { describe, it, expect } from "vitest";
import * as testUtils from "../index";

describe("@repo/test-utils", () => {
  it("keeps the public helper surface intentionally empty until helpers are added", () => {
    expect(Object.keys(testUtils)).toEqual([]);
  });
});
