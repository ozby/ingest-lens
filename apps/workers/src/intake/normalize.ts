import {
  brandNormalizedEnvelope,
  type ApprovedMappingRevision,
  type IntakeAttemptRecord,
  type MappingSuggestion,
  type NormalizedRecordEnvelope,
} from "@repo/types";
import { getFixtureReference, getTargetContract, resolveContractId } from "./contracts";
import { resolveSourcePath } from "./sourcePath";

export interface NormalizeWithMappingInput {
  payload: unknown;
  suggestions: readonly MappingSuggestion[];
}

export interface CreateNormalizedEnvelopeInput {
  attempt: IntakeAttemptRecord;
  mappingVersion: ApprovedMappingRevision;
  record: Record<string, unknown>;
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

function applyParseNumber(value: unknown): unknown {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim().length > 0) return Number(value);
  return value;
}

function applyParseBoolean(value: unknown): unknown {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return value;
}

type TransformFn = (value: unknown) => unknown;

const TRANSFORM_FNS: Record<string, TransformFn> = {
  copy: (v) => v,
  trim: (v) => (typeof v === "string" ? v.trim() : v),
  normalize_whitespace: (v) => (typeof v === "string" ? normalizeWhitespace(v) : v),
  lowercase: (v) => (typeof v === "string" ? v.toLowerCase() : v),
  uppercase: (v) => (typeof v === "string" ? v.toUpperCase() : v),
  parse_number: applyParseNumber,
  parse_boolean: applyParseBoolean,
  join_text: (v) => (Array.isArray(v) ? v.join(", ") : v),
  to_array: (v) => (Array.isArray(v) ? v : [v]),
};

function applyTransform(
  value: unknown,
  transformKind: MappingSuggestion["transformKind"],
): unknown {
  return (TRANSFORM_FNS[transformKind] ?? ((v) => v))(value);
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

export function createNormalizedEnvelope(
  input: CreateNormalizedEnvelopeInput,
): NormalizedRecordEnvelope {
  const resolvedContractId = resolveContractId(input.mappingVersion.contractId);
  if (resolvedContractId === undefined) {
    throw new Error(`Unknown contract id: ${input.mappingVersion.contractId}`);
  }
  const contract = getTargetContract(resolvedContractId);

  const fixtureReference = input.attempt.sourceFixtureId
    ? getFixtureReference(input.attempt.sourceFixtureId)
    : undefined;

  return brandNormalizedEnvelope({
    eventType: "ingest.record.normalized",
    recordType: contract.targetRecordType,
    schemaVersion: "v1",
    contractId: input.attempt.contractId,
    contractVersion: input.attempt.contractVersion,
    mappingVersionId: input.mappingVersion.mappingVersionId,
    intakeAttemptId: input.attempt.intakeAttemptId,
    mappingTraceId: input.attempt.mappingTraceId,
    source: {
      kind: input.attempt.sourceKind,
      fixtureId: input.attempt.sourceFixtureId,
      sourceHash: input.attempt.sourceHash,
      sourceSystem: input.attempt.sourceSystem,
      sourceUrl: fixtureReference?.sourceUrl,
      capturedAt: input.attempt.createdAt,
    },
    record: input.record,
  });
}
