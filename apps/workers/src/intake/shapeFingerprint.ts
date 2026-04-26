import { defaultHashPayload } from "./validateIntakeRequest";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectLeafPaths(obj: Record<string, unknown>, prefix: string): string[] {
  const paths: string[] = [];
  for (const key of Object.keys(obj)) {
    const fullPath = prefix.length > 0 ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (isObjectRecord(value)) {
      paths.push(...collectLeafPaths(value, fullPath));
    } else {
      paths.push(fullPath);
    }
  }
  return paths;
}

// Returns "empty" for null/undefined/non-object payloads (fail-open).
// Hashes sorted leaf field paths only — value changes don't affect the fingerprint.
export function shapeFingerprint(payload: unknown): string {
  if (!isObjectRecord(payload)) {
    return "empty";
  }

  const leafPaths = collectLeafPaths(payload, "");
  leafPaths.sort();
  return defaultHashPayload(leafPaths);
}
