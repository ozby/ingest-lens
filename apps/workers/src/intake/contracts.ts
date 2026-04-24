import type {
  DeliveryTarget,
  DriftCategory,
  MappingSuggestionBatch,
  SourceReferenceKind,
} from "@repo/types";
import { getDemoFixtureById } from "./demoFixtures";
import { resolveSourcePath } from "./sourcePath";

export interface DeterministicDependencies {
  clock: () => Date;
  idGenerator: () => string;
  hashPayload: (payload: unknown) => string;
}

export interface TargetContractDefinition {
  id: string;
  version: string;
  targetRecordType: string;
  targetFields: readonly string[];
  requiredFields: readonly string[];
}

export interface FixtureReference {
  id: string;
  sourceSystem: string;
  payload: Record<string, unknown>;
  sourceUrl: string;
  contractHint?: string;
  summary?: string;
}

export const DEFAULT_REVIEW_PAYLOAD_TTL_HOURS = 24;
export const MAX_PAYLOAD_DEPTH = 8;
export const MAX_PAYLOAD_BYTES = 64_000;

export const TARGET_CONTRACTS = {
  "job-posting-v1": {
    id: "job-posting-v1",
    version: "v1",
    targetRecordType: "job_posting",
    targetFields: ["name", "status", "department", "location", "post_url", "employment_type"],
    requiredFields: ["name", "post_url"],
  },
  "employee-v1": {
    id: "employee-v1",
    version: "v1",
    targetRecordType: "employee",
    targetFields: [
      "id",
      "first_name",
      "last_name",
      "email",
      "employment_type",
      "department",
      "start_date",
      "manager_id",
      "job_title",
      "custom_fields.shirt_size",
      "custom_fields.team_budget",
      "custom_fields.certifications",
    ],
    requiredFields: ["first_name", "last_name", "email"],
  },
  "application-v1": {
    id: "application-v1",
    version: "v1",
    targetRecordType: "application",
    targetFields: ["id", "candidate_id", "job_id", "current_stage", "status", "applied_at"],
    requiredFields: ["id", "status"],
  },
} as const satisfies Record<string, TargetContractDefinition>;

export type ContractId = keyof typeof TARGET_CONTRACTS;

export function getTargetContract(contractId: ContractId): TargetContractDefinition {
  return TARGET_CONTRACTS[contractId];
}

export function resolveContractId(value: string): ContractId | undefined {
  return value in TARGET_CONTRACTS ? (value as ContractId) : undefined;
}

export function getFixtureReference(fixtureId: string): FixtureReference | undefined {
  return getDemoFixtureById(fixtureId);
}

export function validateDeliveryTarget(target: DeliveryTarget): string[] {
  const hasQueue = typeof target.queueId === "string" && target.queueId.length > 0;
  const hasTopic = typeof target.topicId === "string" && target.topicId.length > 0;

  if (hasQueue === hasTopic) {
    return ["Exactly one delivery target is required: queueId xor topicId."];
  }

  return [];
}

export function classifyDriftCategory(
  missingRequiredFields: readonly string[],
  ambiguousTargetFields: readonly string[],
): DriftCategory {
  if (ambiguousTargetFields.length > 0) {
    return "ambiguous_mapping";
  }

  if (missingRequiredFields.length > 0) {
    return "missing_field";
  }

  return "renamed_field";
}

export function sourceKindFromFixtureId(fixtureId?: string): SourceReferenceKind {
  return fixtureId ? "fixture_reference" : "inline_payload";
}

export function calculatePayloadDepth(payload: unknown): number {
  if (Array.isArray(payload)) {
    return (
      1 + payload.reduce((maxDepth, value) => Math.max(maxDepth, calculatePayloadDepth(value)), 0)
    );
  }

  if (payload !== null && typeof payload === "object") {
    return (
      1 +
      Object.values(payload).reduce(
        (maxDepth, value) => Math.max(maxDepth, calculatePayloadDepth(value)),
        0,
      )
    );
  }

  return 0;
}

export function calculatePayloadBytes(payload: unknown): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}

export interface DeterministicFallbackInput {
  payload: unknown;
  sourceSystem: string;
  contractId: string;
  contractVersion: string;
  promptVersion: string;
  targetFields: readonly string[];
}

interface DeterministicFallbackSuggestionCandidate {
  sourcePath: string;
  targetField: string;
  transformKind: MappingSuggestionBatch["suggestions"][number]["transformKind"];
  explanation: string;
}

export function createDeterministicFallbackBatch(
  input: DeterministicFallbackInput,
): MappingSuggestionBatch | null {
  const resolvedContractId = resolveContractId(input.contractId);
  if (resolvedContractId === undefined || resolvedContractId !== "job-posting-v1") {
    return null;
  }
  const contract = getTargetContract(resolvedContractId);

  const candidates: readonly DeterministicFallbackSuggestionCandidate[] = [
    {
      sourcePath: "/title",
      targetField: "name",
      transformKind: "copy",
      explanation: "Ashby-style title fields map directly to the normalized job name.",
    },
    {
      sourcePath: "/name",
      targetField: "name",
      transformKind: "copy",
      explanation: "Greenhouse-style name fields map directly to the normalized job name.",
    },
    {
      sourcePath: "/text",
      targetField: "name",
      transformKind: "copy",
      explanation: "Lever text fields map directly to the normalized job name.",
    },
    {
      sourcePath: "/status",
      targetField: "status",
      transformKind: "copy",
      explanation: "Status fields can be preserved as-is for deterministic review.",
    },
    {
      sourcePath: "/state",
      targetField: "status",
      transformKind: "copy",
      explanation: "Lever state fields carry the publish status for the posting.",
    },
    {
      sourcePath: "/department",
      targetField: "department",
      transformKind: "copy",
      explanation: "Department fields map directly into the normalized department field.",
    },
    {
      sourcePath: "/departments/0/name",
      targetField: "department",
      transformKind: "copy",
      explanation: "The first department name is the deterministic department fallback.",
    },
    {
      sourcePath: "/team",
      targetField: "department",
      transformKind: "copy",
      explanation: "Lever team fields are reused as the normalized department.",
    },
    {
      sourcePath: "/locations",
      targetField: "location",
      transformKind: "join_text",
      explanation: "Array locations are joined into the normalized location text.",
    },
    {
      sourcePath: "/location",
      targetField: "location",
      transformKind: "copy",
      explanation: "Single-string location fields map directly to the normalized location.",
    },
    {
      sourcePath: "/offices/0/location/name",
      targetField: "location",
      transformKind: "copy",
      explanation:
        "The first Greenhouse office location is used for deterministic location mapping.",
    },
    {
      sourcePath: "/apply_url",
      targetField: "post_url",
      transformKind: "copy",
      explanation: "Ashby apply URLs map directly into the normalized posting URL.",
    },
    {
      sourcePath: "/applyUrl",
      targetField: "post_url",
      transformKind: "copy",
      explanation: "Lever apply URLs map directly into the normalized posting URL.",
    },
    {
      sourcePath: "/employment_type",
      targetField: "employment_type",
      transformKind: "copy",
      explanation: "Employment type values can be reused without transformation.",
    },
    {
      sourcePath: "/workplaceType",
      targetField: "employment_type",
      transformKind: "copy",
      explanation: "Lever workplace types serve as the deterministic employment type fallback.",
    },
  ];

  const suggestions = candidates.flatMap((candidate, index) => {
    if (!input.targetFields.includes(candidate.targetField)) {
      return [];
    }

    const resolved = resolveSourcePath(input.payload, candidate.sourcePath);
    if (!resolved.ok) {
      return [];
    }

    return [
      {
        id: `fallback-${index + 1}`,
        sourcePath: candidate.sourcePath,
        targetField: candidate.targetField,
        transformKind: candidate.transformKind,
        confidence: 0.92,
        explanation: candidate.explanation,
        evidenceSample:
          typeof resolved.value === "string" ? resolved.value : JSON.stringify(resolved.value),
        deterministicValidation: {
          isValid: true,
          validatedAt: new Date().toISOString(),
          errors: [],
        },
        reviewStatus: "pending",
        replayStatus: "not_requested",
      } satisfies MappingSuggestionBatch["suggestions"][number],
    ];
  });

  if (suggestions.length === 0) {
    return null;
  }

  const mappedTargetFields = new Set(suggestions.map((suggestion) => suggestion.targetField));
  const missingRequiredFields = contract.requiredFields.filter(
    (field) => !mappedTargetFields.has(field),
  );
  const ambiguousTargetFields: string[] = [];

  return {
    mappingTraceId: crypto.randomUUID(),
    contractId: input.contractId,
    contractVersion: input.contractVersion,
    sourceSystem: input.sourceSystem,
    promptVersion: input.promptVersion,
    generatedAt: new Date().toISOString(),
    overallConfidence: missingRequiredFields.length === 0 ? 0.92 : 0.78,
    driftCategories: [classifyDriftCategory(missingRequiredFields, ambiguousTargetFields)],
    missingRequiredFields,
    ambiguousTargetFields,
    suggestions,
    summary:
      missingRequiredFields.length === 0
        ? `Deterministic local fallback produced ${suggestions.length} review suggestions.`
        : `Deterministic local fallback produced ${suggestions.length} suggestions but still needs ${missingRequiredFields.join(", ")}.`,
  };
}
