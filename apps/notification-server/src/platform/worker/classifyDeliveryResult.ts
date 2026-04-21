import type { DeliveryFailureKind } from "@repo/types";

export interface DeliveryFailureOutcome {
  errorMessage: string;
  failureKind: DeliveryFailureKind;
  responseStatus?: number;
  retryable: boolean;
}

export const classifyDeliveryFailure = (
  responseStatus: number | undefined,
  error: unknown,
): DeliveryFailureOutcome => {
  if (typeof responseStatus === "number") {
    if (responseStatus === 429) {
      return {
        errorMessage: `Endpoint rate limited the delivery with status ${responseStatus}.`,
        failureKind: "rate_limited",
        responseStatus,
        retryable: true,
      };
    }

    if (responseStatus >= 500) {
      return {
        errorMessage: `Endpoint returned ${responseStatus}.`,
        failureKind: "upstream_server_error",
        responseStatus,
        retryable: true,
      };
    }

    if (responseStatus >= 400) {
      return {
        errorMessage: `Endpoint rejected the delivery with status ${responseStatus}.`,
        failureKind: "upstream_client_error",
        responseStatus,
        retryable: false,
      };
    }
  }

  if (error instanceof Error && error.name === "TimeoutError") {
    return {
      errorMessage: "Delivery request timed out.",
      failureKind: "timeout",
      retryable: true,
    };
  }

  if (error instanceof Error) {
    return {
      errorMessage: error.message,
      failureKind: "network_error",
      retryable: true,
    };
  }

  return {
    errorMessage: "Unknown delivery failure.",
    failureKind: "unknown",
    retryable: false,
  };
};

export const resolveBackoffDelay = (
  schedule: number[],
  attemptNumber: number,
): number => {
  if (schedule.length === 0) {
    return attemptNumber * 1000;
  }

  return (
    schedule[Math.min(attemptNumber - 1, schedule.length - 1)] ??
    schedule[schedule.length - 1] ??
    0
  );
};
