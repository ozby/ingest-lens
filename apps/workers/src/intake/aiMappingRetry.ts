import { NoObjectGeneratedError } from "ai";

export class ModelTimeoutError extends Error {
  readonly code = "model_timeout";

  constructor(modelLabel: string, timeoutMs: number) {
    super(`${modelLabel} timed out after ${timeoutMs}ms`);
    this.name = "ModelTimeoutError";
  }
}

const RETRYABLE_ERROR_PATTERNS = [
  /\b429\b/i,
  /\b503\b/i,
  /\brate limit/i,
  /\btemporar(?:y|ily)\b/i,
  /\btimeout\b/i,
  /\bconnection\b/i,
  /\betimedout\b/i,
  /\beconnreset\b/i,
  /\beai_again\b/i,
] as const;

export function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export async function withTimeout<T>(
  operation: (abortSignal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  modelLabel: string,
): Promise<T> {
  const abortController = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const result = await new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => {
        const timeoutError = new ModelTimeoutError(modelLabel, timeoutMs);
        abortController.abort(timeoutError);
        reject(timeoutError);
      }, timeoutMs);

      operation(abortController.signal).then(resolve, reject);
    });

    return result;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export function isRetryableModelError(error: unknown): boolean {
  if (error instanceof ModelTimeoutError) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const errorCode =
    typeof (error as { code?: unknown }).code === "string"
      ? (error as unknown as { code: string }).code
      : "";
  const errorText = `${error.name} ${error.message} ${errorCode}`.trim();

  return RETRYABLE_ERROR_PATTERNS.some((pattern) => pattern.test(errorText));
}

export async function runWithRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: {
    maxAttempts: number;
    retryDelayMs: number;
    sleep: (delayMs: number) => Promise<void>;
  },
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        throw error;
      }

      if (!isRetryableModelError(error)) {
        throw error;
      }

      lastError = error;

      if (attempt >= options.maxAttempts) {
        break;
      }

      await options.sleep(options.retryDelayMs);
    }
  }

  throw lastError;
}
