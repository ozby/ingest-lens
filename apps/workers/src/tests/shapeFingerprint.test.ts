import { describe, expect, it } from "vitest";
import { shapeFingerprint } from "../intake/shapeFingerprint";

describe("shapeFingerprint", () => {
  it("returns the same fingerprint for same shape with different values", () => {
    const a = shapeFingerprint({ first_name: "Alice" });
    const b = shapeFingerprint({ first_name: "Bob" });

    expect(a).toBe(b);
  });

  it("returns different fingerprints when a field is renamed", () => {
    const snakeCase = shapeFingerprint({ first_name: "x" });
    const camelCase = shapeFingerprint({ firstName: "x" });

    expect(snakeCase).not.toBe(camelCase);
  });

  it("includes nested paths in the fingerprint", () => {
    const nested = shapeFingerprint({ a: { b: 1 } });
    const flat = shapeFingerprint({ a: 1 });

    expect(nested).not.toBe(flat);
  });

  it("is deterministic regardless of insertion order", () => {
    const ab = shapeFingerprint({ a: 1, b: 2 });
    const ba = shapeFingerprint({ b: 2, a: 1 });

    expect(ab).toBe(ba);
  });

  it("returns 'empty' for null", () => {
    expect(shapeFingerprint(null)).toBe("empty");
  });

  it("returns 'empty' for undefined", () => {
    expect(shapeFingerprint(undefined)).toBe("empty");
  });

  it("returns 'empty' for a non-object primitive", () => {
    expect(shapeFingerprint(42)).toBe("empty");
  });
});
