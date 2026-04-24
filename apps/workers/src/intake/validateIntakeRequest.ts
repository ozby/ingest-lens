import type { DeliveryTarget, SourceReferenceKind } from "@repo/types";
import {
  DEFAULT_REVIEW_PAYLOAD_TTL_HOURS,
  MAX_PAYLOAD_BYTES,
  MAX_PAYLOAD_DEPTH,
  calculatePayloadBytes,
  calculatePayloadDepth,
  getFixtureReference,
  getTargetContract,
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

export function validateIntakeRequest(
  input: ValidateIntakeRequestInput,
  dependencies: ValidateIntakeRequestDependencies,
): IntakeValidationResult {
  const errors: string[] = [];
  const contract = getTargetContract(input.contractId);

  if (!contract) {
    errors.push("Unknown contract id.");
  }

  const deliveryTargetErrors = validateDeliveryTarget({
    queueId: input.queueId,
    topicId: input.topicId,
  });
  errors.push(...deliveryTargetErrors);

  const hasFixtureId = typeof input.fixtureId === "string" && input.fixtureId.trim().length > 0;
  const hasPayload = input.payload !== undefined;

  if (hasFixtureId === hasPayload) {
    errors.push("Provide exactly one source input: fixtureId xor payload.");
  }

  let sourceFixture: FixtureReference | undefined;
  if (hasFixtureId) {
    sourceFixture = getFixtureReference(input.fixtureId as string);
    if (!sourceFixture) {
      errors.push("Unknown fixture id.");
    }
  }

  let payload: Record<string, unknown> | undefined;
  if (hasPayload) {
    if (!isObjectRecord(input.payload)) {
      errors.push("Payload must be a JSON object.");
    } else {
      payload = input.payload;
    }
  }

  if (sourceFixture) {
    payload = sourceFixture.payload;
  }

  if (!payload) {
    return {
      ok: false,
      errors,
    };
  }

  const payloadDepth = calculatePayloadDepth(payload);
  if (payloadDepth > MAX_PAYLOAD_DEPTH) {
    errors.push(`Payload depth must be <= ${MAX_PAYLOAD_DEPTH}.`);
  }

  const payloadBytes = calculatePayloadBytes(payload);
  if (payloadBytes > MAX_PAYLOAD_BYTES) {
    errors.push(`Payload size must be <= ${MAX_PAYLOAD_BYTES} bytes.`);
  }

  if (errors.length > 0 || !contract) {
    return {
      ok: false,
      errors,
    };
  }

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
    ok: true,
    value: {
      contract,
      deliveryTarget: {
        queueId: input.queueId,
        topicId: input.topicId,
      },
      payload,
      redactedSummary: summarizePayload(payload),
      reviewPayload: sourceFixture ? null : payload,
      reviewPayloadExpiresAt,
      sourceFixture,
      sourceHash: dependencies.hashPayload(payload),
      sourceKind: sourceKindFromFixtureId(sourceFixture?.id),
      sourceSystem: sourceFixture?.sourceSystem ?? input.sourceSystem,
    },
  };
}
