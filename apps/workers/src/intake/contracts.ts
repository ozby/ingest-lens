import type { DeliveryTarget, DriftCategory, SourceReferenceKind } from "@repo/types";

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
  contractHint: string;
  payload: Record<string, unknown>;
  sourceUrl: string;
}

export const DEFAULT_REVIEW_PAYLOAD_TTL_HOURS = 24;
export const MAX_PAYLOAD_DEPTH = 8;
export const MAX_PAYLOAD_BYTES = 64_000;

export const TARGET_CONTRACTS: Record<string, TargetContractDefinition> = {
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
};

export const PUBLIC_FIXTURES: Record<string, FixtureReference> = {
  "ashby-job-001": {
    id: "ashby-job-001",
    sourceSystem: "ashby",
    contractHint: "job-posting-v1",
    sourceUrl: "https://huggingface.co/datasets/edwarddgao/open-apply-jobs",
    payload: {
      title: "Staff Software Engineer, Backend",
      apply_url: "https://jobs.ashbyhq.com/example-co/abc123",
      employment_type: "FullTime",
      department: "Engineering",
      locations: ["Remote"],
    },
  },
  "greenhouse-job-001": {
    id: "greenhouse-job-001",
    sourceSystem: "greenhouse",
    contractHint: "job-posting-v1",
    sourceUrl: "https://huggingface.co/datasets/edwarddgao/open-apply-jobs",
    payload: {
      id: 7654321,
      name: "Senior Data Engineer",
      status: "open",
      departments: [{ id: 101, name: "Data Platform" }],
      offices: [{ id: 201, location: { name: "Austin, TX" } }],
      created_at: "2026-01-15T09:00:00Z",
      updated_at: "2026-04-01T14:22:00Z",
    },
  },
  "lever-posting-001": {
    id: "lever-posting-001",
    sourceSystem: "lever",
    contractHint: "job-posting-v1",
    sourceUrl: "https://huggingface.co/datasets/edwarddgao/open-apply-jobs",
    payload: {
      id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      text: "Senior Frontend Engineer",
      state: "published",
      team: "Frontend",
      location: "Remote - Europe",
      applyUrl: "https://jobs.lever.co/example-co/a1b2c3d4",
      workplaceType: "remote",
    },
  },
};

export function getTargetContract(contractId: string): TargetContractDefinition | undefined {
  return TARGET_CONTRACTS[contractId];
}

export function getFixtureReference(fixtureId: string): FixtureReference | undefined {
  return PUBLIC_FIXTURES[fixtureId];
}

export function getAllFixtureReferences(): FixtureReference[] {
  return Object.values(PUBLIC_FIXTURES);
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
