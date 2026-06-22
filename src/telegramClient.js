import { createLogger, serializeError } from "./logger.js";
import { requestWithPolicy } from "./outboundRequest.js";

export function createTelegramClient({
  botToken,
  fetchImpl = fetch,
  logger = createLogger("telegram"),
  maxRetries = 2,
  timeoutMs = 8_000
}) {
  const apiBase = `https://api.telegram.org/bot${botToken}`;

  async function telegramRequest(method, body) {
    const startedAt = Date.now();
    logger.info("telegram_api_request_started", {
      method,
      chatId: body?.chat_id,
      textLength: typeof body?.text === "string" ? body.text.length : undefined,
      parseMode: body?.parse_mode,
      webhookUrl: method === "setWebhook" ? body?.url : undefined
    });

    try {
      const response = await requestWithPolicy(fetchImpl, `${apiBase}/${method}`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(body)
      }, {
        maxRetries: method === "setWebhook" ? maxRetries : 0,
        retryUnsafe: method === "setWebhook",
        timeoutMs
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        const description = payload.description || `HTTP ${response.status}`;
        logger.error("telegram_api_request_failed", {
          method,
          statusCode: response.status,
          description,
          durationMs: Date.now() - startedAt
        });
        throw new Error(`Telegram ${method} failed: ${description}`);
      }

      logger.info("telegram_api_request_succeeded", {
        method,
        statusCode: response.status,
        durationMs: Date.now() - startedAt
      });

      return payload;
    } catch (error) {
      logger.error("telegram_api_request_error", {
        method,
        durationMs: Date.now() - startedAt,
        error: serializeError(error)
      });
      throw error;
    }
  }

  function setWebhook({ url, secretToken }) {
    return telegramRequest("setWebhook", {
      url,
      allowed_updates: ["message"],
      secret_token: secretToken
    });
  }

  function sendMessage({ chatId, text, parseMode }) {
    const body = {
      chat_id: chatId,
      text,
      disable_web_page_preview: false
    };

    if (parseMode) {
      body.parse_mode = parseMode;
    }

    return telegramRequest("sendMessage", body);
  }

  return {
    setWebhook,
    sendMessage
  };
}
