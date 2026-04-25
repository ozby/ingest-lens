/**
 * deepFreeze — recursively freezes an object and all its nested properties.
 *
 * Shallow Object.freeze is insufficient — nested objects and arrays must also
 * be frozen. Spread+override still works after freeze:
 *   { ...frozen, key: newValue } creates a new unfrozen object.
 */
export function deepFreeze<T extends object>(obj: T): Readonly<T> {
  Object.freeze(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    const value = (obj as Record<string, unknown>)[key];
    if (value !== null && typeof value === "object") {
      deepFreeze(value as object);
    }
  }
  return obj as Readonly<T>;
}
