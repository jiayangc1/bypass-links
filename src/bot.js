import { createLogger, summarizeUrl } from "./logger.js";
import { requestWithPolicy } from "./outboundRequest.js";
import { extractMessageText, extractUrls } from "./urlExtractor.js";

export function formatTelegramReply(result) {
  if (typeof result === "string" && result.startsWith("https://")) {
    return {
      text: `<a href="${escapeHtmlAttribute(result)}">Download</a>`,
      parseMode: "HTML"
    };
  }

  return {
    text: `${result}\n`
  };
}

export async function processTelegramUpdate(update, {
  bypassClient,
  telegramClient,
  logger = createLogger("bot")
}) {
  const message = update?.message;
  if (!message?.chat?.id) {
    logger.warn("telegram_update_ignored", {
      updateId: update?.update_id,
      reason: "missing_message"
    });
    return { processed: false, reason: "missing_message" };
  }

  const text = extractMessageText(message);
  const urls = extractUrls(text);
  logger.info("telegram_message_received", {
    updateId: update?.update_id,
    messageId: message.message_id,
    chatId: message.chat.id,
    chatType: message.chat.type,
    textLength: text.length,
    urlCount: urls.length,
    urls: urls.map((url) => summarizeUrl(url))
  });

  if (urls.length === 0) {
    return { processed: true, sent: 0 };
  }

  const [url] = urls;
  let sent = 0;

  logger.info("telegram_bypass_started", {
    updateId: update?.update_id,
    messageId: message.message_id,
    chatId: message.chat.id,
    url: summarizeUrl(url),
    ignoredUrlCount: urls.length - 1
  });
  const result = await bypassClient.bypass(url);
  const reply = formatTelegramReply(result);

  logger.info("telegram_reply_sending", {
    updateId: update?.update_id,
    messageId: message.message_id,
    chatId: message.chat.id,
    resultIsUrl: typeof result === "string" && result.startsWith("https://"),
    resultLength: typeof result === "string" ? result.length : 0,
    parseMode: reply.parseMode || null
  });

  await telegramClient.sendMessage({
    chatId: message.chat.id,
    text: reply.text,
    parseMode: reply.parseMode
  });

  sent += 1;
  logger.info("telegram_reply_sent", {
    updateId: update?.update_id,
    messageId: message.message_id,
    chatId: message.chat.id,
    sent
  });

  return { processed: true, sent };
}

export async function notifyDiscord(webhookUrl, error, fetchImpl = fetch, { timeoutMs = 5_000 } = {}) {
  if (!webhookUrl) {
    return;
  }

  const stack = error?.stack || String(error);
  const message = `# Error Detected in Automation Link Bypasser\nError: ${error.message || error}\n\`\`\`${stack}\`\`\``;

  await requestWithPolicy(fetchImpl, webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ message })
  }, { maxRetries: 0, timeoutMs }).catch((notifyError) => {
    console.error("Failed to send Discord error notification", notifyError);
  });
}

function escapeHtmlAttribute(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
