import type {
  DeliveryTarget,
  DriftCategory,
  SourceReferenceKind,
} from "@repo/types";
import { getDemoFixtureById } from "./demoFixtures";

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

export const TARGET_CONTRACTS: Record<string, TargetContractDefinition> = {
  "job-posting-v1": {
    id: "job-posting-v1",
    version: "v1",
    targetRecordType: "job_posting",
    targetFields: [
      "name",
      "status",
      "department",
      "location",
      "post_url",
      "employment_type",
    ],
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
    targetFields: [
      "id",
      "candidate_id",
      "job_id",
      "current_stage",
      "status",
      "applied_at",
    ],
    requiredFields: ["id", "status"],
  },
};

export function getTargetContract(
  contractId: string,
): TargetContractDefinition | undefined {
  return TARGET_CONTRACTS[contractId];
}

export function getFixtureReference(
  fixtureId: string,
): FixtureReference | undefined {
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

export function sourceKindFromFixtureId(
  fixtureId?: string,
): SourceReferenceKind {
  return fixtureId ? "fixture_reference" : "inline_payload";
}

export function calculatePayloadDepth(payload: unknown): number {
  if (Array.isArray(payload)) {
    return (
      1 +
      payload.reduce(
        (maxDepth, value) => Math.max(maxDepth, calculatePayloadDepth(value)),
        0,
      )
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
