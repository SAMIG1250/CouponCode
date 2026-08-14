import logger from "./logger.server";

const TRANSIENT_ERROR_PATTERN =
  /fetch failed|no response available|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|network|socket hang up|timeout/i;

type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  label?: string;
};

function isTransientError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT_ERROR_PATTERN.test(message);
}

export async function retryOnTransientFailure<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 400;
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isTransientError(error) || attempt === retries) {
        throw error;
      }

      logger.warn(
        {
          attempt,
          retries,
          label: options.label,
          error: error instanceof Error ? error.message : String(error),
          event: "transient_operation_retry",
        },
        "retrying after transient failure",
      );

      await new Promise((resolve) =>
        setTimeout(resolve, baseDelayMs * attempt),
      );
    }
  }

  throw lastError;
}
