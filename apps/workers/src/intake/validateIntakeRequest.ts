import type { DeliveryTarget, SourceReferenceKind } from "@repo/types";
import {
  DEFAULT_REVIEW_PAYLOAD_TTL_HOURS,
  MAX_PAYLOAD_BYTES,
  MAX_PAYLOAD_DEPTH,
  calculatePayloadBytes,
  calculatePayloadDepth,
  getFixtureReference,
  getTargetContract,
  resolveContractId,
  sourceKindFromFixtureId,
  validateDeliveryTarget,
  type DeterministicDependencies,
  type FixtureReference,
  type TargetContractDefinition,
} from "./contracts";

export interface IntakeValidationSuccess {
  ok: true;
  value: {
    contract: TargetContractDefinition;
    deliveryTarget: DeliveryTarget;
    payload: Record<string, unknown>;
    redactedSummary: string;
    reviewPayload: Record<string, unknown> | null;
    reviewPayloadExpiresAt?: string;
    sourceFixture?: FixtureReference;
    sourceHash: string;
    sourceKind: SourceReferenceKind;
    sourceSystem: string;
  };
}

export interface IntakeValidationFailure {
  ok: false;
  errors: string[];
}

export type IntakeValidationResult = IntakeValidationFailure | IntakeValidationSuccess;

export const SOURCE_SYSTEM_MAX_LENGTH = 100;

export interface ValidateIntakeRequestInput {
  contractId: string;
  fixtureId?: string;
  payload?: unknown;
  queueId?: string;
  sourceSystem: string;
  topicId?: string;
}

export interface ValidateIntakeRequestDependencies extends DeterministicDependencies {
  reviewPayloadTtlHours?: number;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summarizePayload(payload: Record<string, unknown>): string {
  const keys = Object.keys(payload).sort();
  if (keys.length === 0) {
    return "Payload captured with no enumerable top-level fields.";
  }

  const visibleKeys = keys.slice(0, 8).join(", ");
  const remainder = keys.length > 8 ? ` (+${keys.length - 8} more)` : "";
  return `Payload captured with top-level fields: ${visibleKeys}${remainder}.`;
}

export function defaultHashPayload(payload: unknown): string {
  const source = JSON.stringify(payload);
  let hash = 5381;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 33) ^ source.charCodeAt(index);
  }
  return `payload_${(hash >>> 0).toString(16)}`;
}

interface SourceResolution {
  sourceFixture?: FixtureReference;
  payload?: Record<string, unknown>;
  errors: string[];
}

function resolveSource(input: ValidateIntakeRequestInput): SourceResolution {
  const hasFixtureId = typeof input.fixtureId === "string" && input.fixtureId.trim().length > 0;
  const hasPayload = input.payload !== undefined;

  if (hasFixtureId === hasPayload) {
    return { errors: ["Provide exactly one source input: fixtureId xor payload."] };
  }

  if (hasFixtureId) {
    const sourceFixture = getFixtureReference(input.fixtureId as string);
    if (!sourceFixture) {
      return { errors: ["Unknown fixture id."] };
    }
    return { sourceFixture, payload: sourceFixture.payload, errors: [] };
  }

  if (!isObjectRecord(input.payload)) {
    return { errors: ["Payload must be a JSON object."] };
  }
  return { payload: input.payload, errors: [] };
}

function validatePayloadConstraints(payload: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const payloadDepth = calculatePayloadDepth(payload);
  if (payloadDepth > MAX_PAYLOAD_DEPTH) {
    errors.push(`Payload depth must be <= ${MAX_PAYLOAD_DEPTH}.`);
  }
  const payloadBytes = calculatePayloadBytes(payload);
  if (payloadBytes > MAX_PAYLOAD_BYTES) {
    errors.push(`Payload size must be <= ${MAX_PAYLOAD_BYTES} bytes.`);
  }
  return errors;
}

function buildSuccessValue(
  input: ValidateIntakeRequestInput,
  contract: TargetContractDefinition,
  payload: Record<string, unknown>,
  sourceFixture: FixtureReference | undefined,
  dependencies: ValidateIntakeRequestDependencies,
): IntakeValidationSuccess["value"] {
  const reviewPayloadExpiresAt =
    sourceFixture === undefined
      ? new Date(
          dependencies.clock().getTime() +
            (dependencies.reviewPayloadTtlHours ?? DEFAULT_REVIEW_PAYLOAD_TTL_HOURS) *
              60 *
              60 *
              1000,
        ).toISOString()
      : undefined;
  return {
    contract,
    deliveryTarget: { queueId: input.queueId, topicId: input.topicId },
    payload,
    redactedSummary: summarizePayload(payload),
    reviewPayload: sourceFixture ? null : payload,
    reviewPayloadExpiresAt,
    sourceFixture,
    sourceHash: dependencies.hashPayload(payload),
    sourceKind: sourceKindFromFixtureId(sourceFixture?.id),
    sourceSystem: sourceFixture?.sourceSystem ?? input.sourceSystem,
  };
}

export function validateIntakeRequest(
  input: ValidateIntakeRequestInput,
  dependencies: ValidateIntakeRequestDependencies,
): IntakeValidationResult {
  const errors: string[] = [];

  // FIX-9 (CSO audit): guard against unbounded sourceSystem strings
  if (input.sourceSystem.length > SOURCE_SYSTEM_MAX_LENGTH) {
    errors.push(`sourceSystem must be at most ${SOURCE_SYSTEM_MAX_LENGTH} characters.`);
  }

  const resolvedContractId = resolveContractId(input.contractId);
  const contract: TargetContractDefinition | undefined =
    resolvedContractId === undefined ? undefined : getTargetContract(resolvedContractId);
  if (!contract) {
    errors.push("Unknown contract id.");
  }

  errors.push(...validateDeliveryTarget({ queueId: input.queueId, topicId: input.topicId }));

  const { sourceFixture, payload, errors: sourceErrors } = resolveSource(input);
  errors.push(...sourceErrors);

  if (!payload || errors.length > 0) {
    return { ok: false, errors };
  }

  errors.push(...validatePayloadConstraints(payload));

  if (errors.length > 0 || !contract) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: buildSuccessValue(input, contract, payload, sourceFixture, dependencies),
  };
}
