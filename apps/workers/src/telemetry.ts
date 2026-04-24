import type { Env } from "./db/client";
import type {
  DriftCategory,
  IngestStatus,
  IntakeAttemptStatus,
  SourceReferenceKind,
} from "@repo/types";

export type DeliveryStatus = "ack" | "retry" | "dropped";

export interface RecordDeliveryOptions {
  queueId: string;
  messageId: string;
  topicId: string | null;
  status: DeliveryStatus;
  latencyMs: number;
  attempt: number;
}

export function recordDelivery(env: Env, opts: RecordDeliveryOptions): void {
  try {
    env.ANALYTICS.writeDataPoint({
      blobs: [opts.queueId, opts.messageId, opts.status, opts.topicId ?? ""],
      doubles: [opts.latencyMs, opts.attempt],
      indexes: [opts.queueId],
    });
  } catch {
    // best-effort: telemetry failure must never break delivery
  }
}

export interface IntakeTelemetryEvent {
  contractId: string;
  deliveryTargetId: string;
  deliveryTargetKind: "queue" | "topic";
  driftCategory: DriftCategory;
  event: string;
  ingestStatus: IngestStatus;
  mappingTraceId: string;
  modelName: string;
  overallConfidence: number;
  promptVersion: string;
  sourceKind: SourceReferenceKind;
  sourceSystem: string;
  status: IntakeAttemptStatus;
  validationErrorCount: number;
}

export function buildIntakeTelemetryFields(
  event: IntakeTelemetryEvent,
): Record<string, number | string> {
  return {
    event: event.event,
    status: event.status,
    ingest_status: event.ingestStatus,
    mapping_trace_id: event.mappingTraceId,
    contract_id: event.contractId,
    source_system: event.sourceSystem,
    source_kind: event.sourceKind,
    drift_category: event.driftCategory,
    prompt_version: event.promptVersion,
    model_name: event.modelName,
    delivery_target_kind: event.deliveryTargetKind,
    delivery_target_id: event.deliveryTargetId,
    overall_confidence: event.overallConfidence,
    validation_error_count: event.validationErrorCount,
  };
}

export function recordIntakeLifecycle(env: Env, event: IntakeTelemetryEvent): void {
  const fields = buildIntakeTelemetryFields(event);

  try {
    env.ANALYTICS.writeDataPoint({
      blobs: [
        String(fields.event),
        String(fields.status),
        String(fields.ingest_status),
        String(fields.mapping_trace_id),
        String(fields.contract_id),
        String(fields.source_system),
        String(fields.source_kind),
        String(fields.drift_category),
        String(fields.prompt_version),
        String(fields.model_name),
        String(fields.delivery_target_kind),
        String(fields.delivery_target_id),
      ],
      doubles: [Number(fields.overall_confidence), Number(fields.validation_error_count)],
      indexes: [event.mappingTraceId],
    });
  } catch {
    // best-effort: telemetry failure must never break intake
  }
}
