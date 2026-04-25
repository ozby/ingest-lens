import type {
  ApprovedMappingRevision,
  IntakeAttemptRecord,
  NormalizedRecordEnvelope,
} from "@repo/types";
import { brandNormalizedEnvelope } from "@repo/types";
import { getTargetContract, resolveContractId } from "./contracts";

export interface CreateNormalizedEnvelopeInput {
  attempt: IntakeAttemptRecord;
  mappingVersion: ApprovedMappingRevision;
  record: Record<string, unknown>;
}

export function createNormalizedEnvelope(
  input: CreateNormalizedEnvelopeInput,
): NormalizedRecordEnvelope {
  const contractId = resolveContractId(input.mappingVersion.contractId);
  if (contractId === undefined) {
    throw new Error(`Unknown contract id: ${input.mappingVersion.contractId}`);
  }
  const contract = getTargetContract(contractId);

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
      capturedAt: input.attempt.createdAt,
    },
    record: input.record,
  });
}
