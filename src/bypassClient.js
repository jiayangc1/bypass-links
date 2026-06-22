import { isUrlLike } from "./urlExtractor.js";
import {
  UnsupportedLinkError,
  UpstreamRateLimitError,
  UpstreamUnavailableError,
  getRetryAfterSeconds
} from "./errors.js";
import { createLogger, serializeError, summarizeUrl } from "./logger.js";
import { requestWithPolicy } from "./outboundRequest.js";
import { parsePublicHttpUrl, resolvePublicHttpUrl } from "./urlValidator.js";

const BYPASS_API_BASE_URL = "https://api.bypass.vip/premium/";
export const DEFAULT_BYPASS_OPERATION_TIMEOUT_MS = 20_000;

export function createBypassClient({
  apiKey,
  authHeader,
  maxRetries = 2,
  maxHops = 5,
  fetchImpl = fetch,
  lookupImpl,
  logger = createLogger("bypass"),
  dnsTimeoutMs = 2_000,
  operationTimeoutMs = DEFAULT_BYPASS_OPERATION_TIMEOUT_MS,
  queue = { schedule: (task) => task() },
  timeoutMs = 8_000
}) {
  async function bypassOnce(url, { failureLogLevel = "error", refresh = false, signal } = {}) {
    const validatedUrl = (await resolvePublicHttpUrl(url, { lookupImpl, timeoutMs: dnsTimeoutMs })).toString();
    const requestUrl = new URL(refresh ? "refresh" : "bypass", BYPASS_API_BASE_URL);
    requestUrl.searchParams.set("url", validatedUrl);
    const startedAt = Date.now();

    logger.info("bypass_api_request_started", {
      mode: refresh ? "refresh" : "bypass",
      url: summarizeUrl(validatedUrl),
      authHeader
    });

    const response = await queue.schedule(() => requestWithPolicy(fetchImpl, requestUrl, {
      method: "GET",
      headers: {
        [authHeader]: apiKey
      },
      signal
    }, { maxRetries, timeoutMs }));

    if (!response.ok) {
      logger[failureLogLevel]("bypass_api_request_failed", {
        statusCode: response.status,
        durationMs: Date.now() - startedAt,
        url: summarizeUrl(validatedUrl)
      });
      if ([400, 404, 422].includes(response.status)) {
        throw new UnsupportedLinkError();
      }
      if (response.status === 429) {
        throw new UpstreamRateLimitError(getRetryAfterSeconds(response));
      }
      throw new UpstreamUnavailableError(`bypass.vip request failed with HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (typeof payload.result !== "string" || payload.result.length === 0) {
      logger.error("bypass_api_invalid_response", {
        statusCode: response.status,
        durationMs: Date.now() - startedAt,
        hasResult: Boolean(payload.result)
      });
      throw new Error("bypass.vip response did not include a result");
    }

    logger.info("bypass_api_request_succeeded", {
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
      resultIsUrl: isUrlLike(payload.result),
      resultLength: payload.result.length,
      result: summarizeUrl(payload.result)
    });

    return payload.result;
  }

  async function bypass(url, options = {}) {
    let currentUrl = url;
    let lastResult = "";
    const operationSignal = options.signal || globalThis.AbortSignal.timeout(operationTimeoutMs);

    for (let hop = 0; hop < maxHops; hop += 1) {
      try {
        logger.info("bypass_hop_started", {
          hop: hop + 1,
          maxHops,
          url: summarizeUrl(currentUrl)
        });
        const result = await bypassOnce(currentUrl, {
          ...options,
          failureLogLevel: lastResult ? "warn" : "error",
          signal: operationSignal
        });
        if (!isUrlLike(result)) {
          logger.info("bypass_finished", {
            hop: hop + 1,
            reason: "non_url_result",
            resultLength: result.length
          });
          return result;
        }

        const nextUrl = parsePublicHttpUrl(result).toString();
        if (nextUrl === currentUrl) {
          logger.info("bypass_finished", {
            hop: hop + 1,
            reason: "same_url",
            resultLength: result.length
          });
          return nextUrl;
        }

        currentUrl = nextUrl;
        lastResult = nextUrl;
      } catch (error) {
        if (lastResult) {
          logger.warn("bypass_returning_last_successful_result", {
            hop: hop + 1,
            result: summarizeUrl(lastResult),
            error: serializeError(error)
          });
          return lastResult;
        }
        logger.error("bypass_hop_failed", {
          hop: hop + 1,
          hasLastResult: false,
          error: serializeError(error)
        });
        throw error;
      }
    }

    return (await resolvePublicHttpUrl(lastResult, { lookupImpl, timeoutMs: dnsTimeoutMs })).toString();
  }

  return {
    bypass,
    bypassOnce
  };
}
