import dns from "node:dns/promises";
import net from "node:net";

import _trim from "lodash/trim";

export class OutboundProviderUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboundProviderUrlError";
  }
}

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

function expandIpv6(address: string): string {
  const withoutZone = address.split("%")[0].toLowerCase();

  if (!withoutZone.includes("::")) {
    return withoutZone;
  }

  const [head, tail] = withoutZone.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const missing = 8 - headParts.length - tailParts.length;
  const middle = Array.from({ length: missing }, () => "0");
  return [...headParts, ...middle, ...tailParts].join(":");
}

function ipv6ToBytes(address: string): Buffer {
  const expanded = expandIpv6(address);
  const parts = expanded.split(":");

  if (parts.length !== 8) {
    throw new OutboundProviderUrlError("Provider URL is invalid");
  }

  const bytes = Buffer.alloc(16);

  for (let index = 0; index < 8; index += 1) {
    const value = parseInt(parts[index], 16);

    if (!Number.isFinite(value) || value < 0 || value > 0xffff) {
      throw new OutboundProviderUrlError("Provider URL is invalid");
    }

    bytes[index * 2] = (value >> 8) & 0xff;
    bytes[index * 2 + 1] = value & 0xff;
  }

  return bytes;
}

function assertIpAllowed(address: string): void {
  if (net.isIPv4(address)) {
    const parts = address.split(".").map(Number);
    const [first, second] = parts;

    if (first === 127) {
      throw new OutboundProviderUrlError("Provider URL is not allowed");
    }

    if (first === 10) {
      throw new OutboundProviderUrlError("Provider URL is not allowed");
    }

    if (first === 172 && second >= 16 && second <= 31) {
      throw new OutboundProviderUrlError("Provider URL is not allowed");
    }

    if (first === 192 && second === 168) {
      throw new OutboundProviderUrlError("Provider URL is not allowed");
    }

    if (first === 169 && second === 254) {
      throw new OutboundProviderUrlError("Provider URL is not allowed");
    }

    if (first === 0) {
      throw new OutboundProviderUrlError("Provider URL is not allowed");
    }

    return;
  }

  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase().split("%")[0];

    if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") {
      throw new OutboundProviderUrlError("Provider URL is not allowed");
    }

    const bytes = ipv6ToBytes(normalized);
    const firstByte = bytes[0];
    const secondByte = bytes[1];

    if ((firstByte & 0xfe) === 0xfc) {
      throw new OutboundProviderUrlError("Provider URL is not allowed");
    }

    if (firstByte === 0xfe && (secondByte & 0xc0) === 0x80) {
      throw new OutboundProviderUrlError("Provider URL is not allowed");
    }
  }
}

export async function assertOutboundProviderUrlAllowed(rawUrl: string): Promise<void> {
  const trimmed = _trim(rawUrl);

  if (!trimmed) {
    throw new OutboundProviderUrlError("Provider URL is required");
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new OutboundProviderUrlError("Provider URL is invalid");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new OutboundProviderUrlError("Provider URL must use http or https");
  }

  if (parsed.username || parsed.password) {
    throw new OutboundProviderUrlError("Provider URL must not include credentials");
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new OutboundProviderUrlError("Provider URL is not allowed");
  }

  const ipVersion = net.isIP(hostname);

  if (ipVersion === 4 || ipVersion === 6) {
    assertIpAllowed(hostname);
    return;
  }

  const lookupResults = await dns.lookup(hostname, { all: true, verbatim: true });

  for (const result of lookupResults) {
    assertIpAllowed(result.address);
  }
}

export async function assertOutboundProviderUrlAllowedIfPresent(
  url: string | null | undefined,
): Promise<void> {
  const trimmed = _trim(url ?? "");

  if (!trimmed) {
    return;
  }

  await assertOutboundProviderUrlAllowed(trimmed);
}
