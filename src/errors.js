export class PublicHttpError extends Error {
  constructor(message, {
    code = "internal_server_error",
    status = 500,
    retryAfter = null,
    cause
  } = {}) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export class InvalidUrlError extends PublicHttpError {
  constructor(message = "Enter a valid public http or https link.") {
    super(message, { code: "invalid_url", status: 400 });
  }
}

export class UnsupportedLinkError extends PublicHttpError {
  constructor(message = "This link is not supported.") {
    super(message, { code: "unsupported_link", status: 422 });
  }
}

export class UpstreamRateLimitError extends PublicHttpError {
  constructor(retryAfter = null) {
    super("The bypass service is temporarily rate limited.", {
      code: "rate_limited",
      status: 429,
      retryAfter
    });
  }
}

export class UpstreamUnavailableError extends PublicHttpError {
  constructor(message = "An upstream service is unavailable.", cause) {
    super(message, { code: "upstream_unavailable", status: 502, cause });
  }
}

export class UpstreamTimeoutError extends PublicHttpError {
  constructor(message = "An upstream service timed out.", cause) {
    super(message, { code: "upstream_timeout", status: 504, cause });
  }
}

export function getRetryAfterSeconds(response) {
  const value = response.headers?.get?.("retry-after");
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds);
  }

  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  }

  return null;
}
