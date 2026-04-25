import { describe, it, expect } from "vitest";
import { deepFreeze } from "../deep-freeze";

describe("deepFreeze", () => {
  it("freezes a flat object", () => {
    const obj = deepFreeze({ a: 1, b: "hello" });
    expect(Object.isFrozen(obj)).toBe(true);
  });

  it("freezes nested objects", () => {
    const obj = deepFreeze({ outer: { inner: { deep: 42 } } });
    expect(Object.isFrozen(obj.outer)).toBe(true);
    expect(Object.isFrozen(obj.outer.inner)).toBe(true);
  });

  it("freezes arrays at top level", () => {
    const arr = deepFreeze([1, 2, 3]);
    expect(Object.isFrozen(arr)).toBe(true);
  });

  it("freezes nested arrays", () => {
    const obj = deepFreeze({ items: [{ id: 1 }, { id: 2 }] });
    expect(Object.isFrozen(obj.items)).toBe(true);
    expect(Object.isFrozen(obj.items[0])).toBe(true);
  });

  it("spread+override creates a new unfrozen object", () => {
    const frozen = deepFreeze({ a: 1, b: 2 });
    const copy = { ...frozen, b: 99 };
    expect(Object.isFrozen(copy)).toBe(false);
    expect(copy.b).toBe(99);
    expect(frozen.b).toBe(2);
  });

  it("handles objects with Date values", () => {
    const obj = deepFreeze({ createdAt: new Date("2026-01-01") });
    expect(Object.isFrozen(obj)).toBe(true);
    expect(Object.isFrozen(obj.createdAt)).toBe(true);
  });

  it("handles null values without throwing", () => {
    const obj = deepFreeze({ a: null, b: 1 });
    expect(Object.isFrozen(obj)).toBe(true);
  });

  it("returns the same reference", () => {
    const original = { x: 1 };
    const result = deepFreeze(original);
    expect(result).toBe(original);
  });
});
