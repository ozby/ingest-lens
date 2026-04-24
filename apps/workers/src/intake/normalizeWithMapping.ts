import type { MappingSuggestion } from "@repo/types";
import { resolveSourcePath } from "./sourcePath";

export interface NormalizeWithMappingInput {
  payload: unknown;
  suggestions: readonly MappingSuggestion[];
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function setNestedValue(
  record: Record<string, unknown>,
  fieldPath: string,
  value: unknown,
): void {
  const segments = fieldPath.split(".");
  let current: Record<string, unknown> = record;

  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      current[segment] = value;
      return;
    }

    const existing = current[segment];
    if (typeof existing === "object" && existing !== null && !Array.isArray(existing)) {
      current = existing as Record<string, unknown>;
      return;
    }

    const next: Record<string, unknown> = {};
    current[segment] = next;
    current = next;
  });
}

function applyTransform(
  value: unknown,
  transformKind: MappingSuggestion["transformKind"],
): unknown {
  switch (transformKind) {
    case "copy":
      return value;
    case "trim":
      return typeof value === "string" ? value.trim() : value;
    case "normalize_whitespace":
      return typeof value === "string" ? normalizeWhitespace(value) : value;
    case "lowercase":
      return typeof value === "string" ? value.toLowerCase() : value;
    case "uppercase":
      return typeof value === "string" ? value.toUpperCase() : value;
    case "parse_number":
      return typeof value === "number"
        ? value
        : typeof value === "string" && value.trim().length > 0
          ? Number(value)
          : value;
    case "parse_boolean":
      if (typeof value === "boolean") {
        return value;
      }
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true") return true;
        if (normalized === "false") return false;
      }
      return value;
    case "join_text":
      return Array.isArray(value) ? value.join(", ") : value;
    case "to_array":
      return Array.isArray(value) ? value : [value];
    default:
      return value;
  }
}

export function normalizeWithMapping(
  input: NormalizeWithMappingInput,
): Record<string, unknown> {
  const record: Record<string, unknown> = {};

  input.suggestions.forEach((suggestion) => {
    const resolved = resolveSourcePath(input.payload, suggestion.sourcePath);
    if (!resolved.ok) {
      throw new Error(`Unable to resolve ${suggestion.sourcePath}: ${resolved.message}`);
    }

    setNestedValue(
      record,
      suggestion.targetField,
      applyTransform(resolved.value, suggestion.transformKind),
    );
  });

  return record;
}
