import type { MappingSuggestion } from "@repo/types";
import { resolveSourcePath } from "./sourcePath";

export interface NormalizeWithMappingInput {
  payload: unknown;
  suggestions: readonly MappingSuggestion[];
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function setNestedValue(record: Record<string, unknown>, fieldPath: string, value: unknown): void {
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

function parseNumber(value: unknown): unknown {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim().length > 0) return Number(value);
  return value;
}

function parseBoolean(value: unknown): unknown {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return value;
}

const transformDispatch: Record<MappingSuggestion["transformKind"], (value: unknown) => unknown> = {
  copy: (v) => v,
  trim: (v) => (typeof v === "string" ? v.trim() : v),
  normalize_whitespace: (v) => (typeof v === "string" ? normalizeWhitespace(v) : v),
  lowercase: (v) => (typeof v === "string" ? v.toLowerCase() : v),
  uppercase: (v) => (typeof v === "string" ? v.toUpperCase() : v),
  parse_number: parseNumber,
  parse_boolean: parseBoolean,
  join_text: (v) => (Array.isArray(v) ? v.join(", ") : v),
  to_array: (v) => (Array.isArray(v) ? v : [v]),
};

function applyTransform(
  value: unknown,
  transformKind: MappingSuggestion["transformKind"],
): unknown {
  const fn = transformDispatch[transformKind];
  return fn ? fn(value) : value;
}

export function normalizeWithMapping(input: NormalizeWithMappingInput): Record<string, unknown> {
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
