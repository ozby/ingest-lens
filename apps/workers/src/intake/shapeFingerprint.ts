/**
 * shapeFingerprint — derives a stable string key from the structural shape of a
 * payload (keys + value-types, not actual values). Used by HealStreamDO to detect
 * whether an incoming payload matches the previously-approved mapping without
 * calling the LLM.
 *
 * The fingerprint is deterministic: same shape → same fingerprint, regardless
 * of field values, insertion order within an object, or array item ordering.
 */

type ShapeNode = string | { [key: string]: ShapeNode } | ShapeNode[];

function deriveShape(value: unknown): ShapeNode {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    // Represent arrays by the union of element shapes (deduplicated)
    const elementShapes = Array.from(new Set(value.map((v) => JSON.stringify(deriveShape(v)))));
    elementShapes.sort();
    return elementShapes.map((s) => JSON.parse(s) as ShapeNode);
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const result: { [key: string]: ShapeNode } = {};
    for (const key of keys) {
      result[key] = deriveShape(obj[key]);
    }
    return result;
  }
  return typeof value;
}

export function shapeFingerprint(payload: unknown): string {
  const shape = deriveShape(payload);
  return JSON.stringify(shape);
}
