import { UpstreamTimeoutError, UpstreamUnavailableError, getRetryAfterSeconds } from "./errors.js";

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);

export async function requestWithPolicy(fetchImpl, url, options = {}, {
  maxRetries = 2,
  retryUnsafe = false,
  sleepImpl = sleep,
  timeoutMs = 8_000
} = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const retryCount = retryUnsafe || IDEMPOTENT_METHODS.has(method) ? maxRetries : 0;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const timeoutSignal = globalThis.AbortSignal.timeout(timeoutMs);
    const signal = options.signal
      ? globalThis.AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;

    try {
      const response = await fetchImpl(url, { ...options, signal });
      if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt === retryCount) {
        return response;
      }

      await sleepImpl(retryDelayMs(response, attempt));
    } catch (error) {
      const timedOut = timeoutSignal.aborted && !options.signal?.aborted;
      if (attempt < retryCount && (!options.signal?.aborted || timedOut)) {
        await sleepImpl(100 * (2 ** attempt));
        continue;
      }

      if (timedOut || error?.name === "TimeoutError" || options.signal?.reason?.name === "TimeoutError") {
        throw new UpstreamTimeoutError(undefined, error);
      }

      if (options.signal?.aborted) {
        throw error;
      }

      throw new UpstreamUnavailableError(undefined, error);
    }
  }

  throw new UpstreamUnavailableError();
}

function retryDelayMs(response, attempt) {
  const retryAfter = getRetryAfterSeconds(response);
  if (retryAfter !== null) {
    return Math.min(retryAfter * 1_000, 2_000);
  }

  return 100 * (2 ** attempt);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
