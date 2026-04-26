import type { MappingSuggestion } from "@repo/types";

/**
 * Derives a stable fingerprint for a set of mapping suggestions.
 * Two batches with the same source field → target field mappings
 * produce the same fingerprint regardless of ordering.
 */
export function shapeFingerprint(suggestions: readonly MappingSuggestion[]): string {
  const pairs = suggestions
    .map((s) => `${s.sourcePath}:${s.targetField}`)
    .sort()
    .join("|");
  return pairs;
}
