export function getDestination(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (!new Set(["http:", "https:"]).has(url.protocol)) return null;
    return { hostname: url.hostname, pathname: `${url.pathname}${url.search}` };
  } catch {
    return null;
  }
}

export function describeBypassError(error) {
  const code = error?.response?.data?.error || (error?.code === "ECONNABORTED" ? "upstream_timeout" : "unknown");
  const retryAfter = error?.response?.data?.retryAfter;
  const messages = {
    invalid_url: "Enter a valid public http or https link.",
    unsupported_link: "That link is not supported. Check the supported-sites list and try another link.",
    rate_limited: retryAfter ? `Too many requests. Try again in about ${retryAfter} seconds.` : "Too many requests. Wait briefly and try again.",
    upstream_unavailable: "The bypass service is temporarily unavailable. Try again shortly.",
    upstream_timeout: "The bypass service took too long to respond. Try again.",
    unauthorized: "Your session expired. Sign in again to continue."
  };
  return { code, message: messages[code] || "That link could not be bypassed. Try again." };
}
