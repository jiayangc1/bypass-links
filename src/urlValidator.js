import { lookup as dnsLookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { InvalidUrlError } from "./errors.js";

const MAX_URL_LENGTH = 4_096;
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const ALLOWED_PORTS = new Set(["80", "443"]);
const BLOCKED_HOST_SUFFIXES = [
  ".home",
  ".internal",
  ".invalid",
  ".lan",
  ".local",
  ".localdomain",
  ".localhost",
  ".test"
];

export function parsePublicHttpUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_URL_LENGTH) {
    throw new InvalidUrlError();
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new InvalidUrlError();
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol) || !url.hostname) {
    throw new InvalidUrlError();
  }

  if (url.username || url.password) {
    throw new InvalidUrlError("URLs containing credentials are not allowed.");
  }

  if (url.port && !ALLOWED_PORTS.has(url.port)) {
    throw new InvalidUrlError("Only standard HTTP and HTTPS ports are allowed.");
  }

  const hostname = normalizedHostname(url);
  if (
    hostname === "localhost"
    || !hostname.includes(".")
    || BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
    || isNonPublicIp(hostname)
  ) {
    throw new InvalidUrlError("Private or local network URLs are not allowed.");
  }

  return url;
}

export async function resolvePublicHttpUrl(value, {
  lookupImpl = dnsLookup,
  timeoutMs = 2_000
} = {}) {
  const url = parsePublicHttpUrl(value);
  const hostname = normalizedHostname(url);
  if (ipaddr.isValid(hostname)) {
    return url;
  }

  let timer;
  try {
    const addresses = await Promise.race([
      lookupImpl(hostname, { all: true, verbatim: true }),
      new Promise((_resolve, reject) => {
        timer = globalThis.setTimeout(() => reject(new InvalidUrlError("URL hostname resolution timed out.")), timeoutMs);
        timer.unref?.();
      })
    ]);
    if (
      !Array.isArray(addresses)
      || addresses.length === 0
      || addresses.some(({ address }) => !ipaddr.isValid(address) || isNonPublicIp(address))
    ) {
      throw new InvalidUrlError("URL hostname resolves to a private or local network.");
    }
  } catch (error) {
    if (error instanceof InvalidUrlError) {
      throw error;
    }
    throw new InvalidUrlError("URL hostname could not be resolved.");
  } finally {
    globalThis.clearTimeout(timer);
  }

  return url;
}

export function isPublicHttpUrl(value) {
  try {
    parsePublicHttpUrl(value);
    return true;
  } catch {
    return false;
  }
}

function isNonPublicIp(hostname) {
  if (!ipaddr.isValid(hostname)) {
    return false;
  }

  let address = ipaddr.parse(hostname);
  if (address.kind() === "ipv6" && address.isIPv4MappedAddress()) {
    address = address.toIPv4Address();
  }

  return address.range() !== "unicast";
}

function normalizedHostname(url) {
  return url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}
