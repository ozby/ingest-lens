// RFC 6585 / RFC 8470 + AWS SDK precedent for retry classification.
// Permanent: 4xx that indicate the subscriber is misconfigured or gone.
// Transient: 5xx and the three 4xx codes that are rate/timeout signals.
const TRANSIENT_4XX = new Set([408, 425, 429]);

export type FailureClass = "permanent" | "transient";

export function classifyFailure(status: number | "throw"): FailureClass {
  if (status === "throw") return "transient";
  if (status >= 500) return "transient";
  if (status >= 400 && !TRANSIENT_4XX.has(status)) return "permanent";
  return "transient";
}

const BACKOFF_SECONDS = [5, 10, 20, 40, 80];

/**
 * Returns the retry delay for a given HTTP status and platform attempt count.
 * Permanent 4xx collapse to 0s (exhausting max_retries routes to DLQ quickly).
 * Transient failures use exponential backoff.
 */
export function retryDelaySeconds(status: number | "throw", attempts: number): number {
  const backoffIndex = Math.min(attempts - 1, BACKOFF_SECONDS.length - 1);
  return classifyFailure(status) === "permanent" ? 0 : (BACKOFF_SECONDS[backoffIndex] ?? 5);
}
