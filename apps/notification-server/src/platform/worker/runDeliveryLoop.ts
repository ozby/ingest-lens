import axios from "axios";
import type {
  ClaimedDeliveryJob,
  DeliveryAttemptStatus,
  RecordDeliveryAttemptRequest,
} from "@repo/types";

import config from "#config";
import { signPayload } from "#platform/security/signature";
import {
  classifyDeliveryFailure,
  resolveBackoffDelay,
} from "#platform/worker/classifyDeliveryResult";

const createAttemptPayload = (
  job: ClaimedDeliveryJob,
  args: {
    attemptNumber: number;
    startedAt: string;
    finishedAt: string;
    status: DeliveryAttemptStatus;
    responseStatus?: number;
    failureKind?: RecordDeliveryAttemptRequest["failureKind"];
    errorMessage?: string;
    nextAttemptAt?: string;
  },
): RecordDeliveryAttemptRequest => ({
  workerId: config.workerId,
  attemptNumber: args.attemptNumber,
  scheduledFor: job.delivery.nextAttemptAt ?? job.delivery.createdAt,
  startedAt: args.startedAt,
  finishedAt: args.finishedAt,
  responseStatus: args.responseStatus,
  failureKind: args.failureKind,
  errorMessage: args.errorMessage,
  outcome: {
    deliveryStatus:
      args.status === "delivered"
        ? "delivered"
        : args.status === "retryable_failure"
          ? "retry_scheduled"
          : "failed",
    nextAttemptAt: args.nextAttemptAt,
  },
});

const claimNextDelivery = async (): Promise<ClaimedDeliveryJob | undefined> => {
  const response = await axios.post<{
    data: { job: ClaimedDeliveryJob | null };
  }>(`${config.controlPlaneUrl}/internal/deliveries/claim-next`, {
    workerId: config.workerId,
  });

  return response.data.data.job ?? undefined;
};

const recordAttempt = async (
  deliveryId: string,
  payload: RecordDeliveryAttemptRequest,
): Promise<void> => {
  await axios.post(
    `${config.controlPlaneUrl}/internal/deliveries/${deliveryId}/attempts`,
    payload,
  );
};

const deliverJob = async (job: ClaimedDeliveryJob): Promise<void> => {
  const startedAt = new Date().toISOString();
  const body = JSON.stringify({
    deliveryId: job.delivery.id,
    eventId: job.event.id,
    eventType: job.event.eventTypeKey,
    payload: job.event.payload,
  });

  const headers = {
    "content-type": "application/json",
    "x-delivery-id": job.delivery.id,
    "x-event-id": job.event.id,
    "x-event-type": job.event.eventTypeKey,
    "x-event-signature": signPayload(job.endpoint.signingSecret, body),
  };

  try {
    const response = await axios.post(job.endpoint.url, body, {
      headers,
      timeout: config.deliveryRequestTimeoutMs,
      validateStatus: () => true,
    });
    const finishedAt = new Date().toISOString();

    if (response.status >= 200 && response.status < 300) {
      await recordAttempt(
        job.delivery.id,
        createAttemptPayload(job, {
          attemptNumber: job.delivery.attemptCount + 1,
          startedAt,
          finishedAt,
          status: "delivered",
          responseStatus: response.status,
        }),
      );
      return;
    }

    const failure = classifyDeliveryFailure(response.status, undefined);
    const nextAttemptAt = failure.retryable
      ? new Date(
          Date.now() +
            resolveBackoffDelay(
              job.subscription.backoffScheduleMs,
              job.delivery.attemptCount + 1,
            ),
        ).toISOString()
      : undefined;

    await recordAttempt(
      job.delivery.id,
      createAttemptPayload(job, {
        attemptNumber: job.delivery.attemptCount + 1,
        startedAt,
        finishedAt,
        status: failure.retryable ? "retryable_failure" : "terminal_failure",
        responseStatus: response.status,
        failureKind: failure.failureKind,
        errorMessage: failure.errorMessage,
        nextAttemptAt,
      }),
    );
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const failure = classifyDeliveryFailure(undefined, error);
    const nextAttemptAt = failure.retryable
      ? new Date(
          Date.now() +
            resolveBackoffDelay(
              job.subscription.backoffScheduleMs,
              job.delivery.attemptCount + 1,
            ),
        ).toISOString()
      : undefined;

    await recordAttempt(
      job.delivery.id,
      createAttemptPayload(job, {
        attemptNumber: job.delivery.attemptCount + 1,
        startedAt,
        finishedAt,
        status: failure.retryable ? "retryable_failure" : "terminal_failure",
        failureKind: failure.failureKind,
        errorMessage: failure.errorMessage,
        nextAttemptAt,
      }),
    );
  }
};

export const startDeliveryLoop = () => {
  const timer = setInterval(() => {
    void claimNextDelivery()
      .then((job) => {
        if (!job) {
          return;
        }

        return deliverJob(job);
      })
      .catch((error) => {
        if (config.nodeEnv !== "test") {
          console.error("[delivery-worker] claim/process failed", error);
        }
      });
  }, config.pollIntervalMs);

  return {
    stop: () => clearInterval(timer),
  };
};
