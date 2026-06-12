import _compact from "lodash/compact";
import _map from "lodash/map";
import _split from "lodash/split";
import _trim from "lodash/trim";

import {
  MEDIAFLOW_PROXY_API_PASSWORD,
  MEDIAFLOW_PROXY_PUBLIC_URL,
  MEDIAFLOW_PROXY_URL,
  PROXY_ACCEPTED_USERS_RAW,
} from "@/constants/streamProxy.constants";

export function isStreamProxyConfigured(): boolean {
  return MEDIAFLOW_PROXY_URL !== "" && MEDIAFLOW_PROXY_API_PASSWORD !== "";
}

export function isStreamProxyActive(hasProxy: boolean): boolean {
  return hasProxy && isStreamProxyConfigured();
}

export function isProxiablePlaybackUrl(url: string): boolean {
  return /^https?:\/\//i.test(_trim(url));
}

export function parseProxyAcceptedUserIds(): string[] | null {
  const raw = PROXY_ACCEPTED_USERS_RAW;

  if (raw === undefined || raw === null || _trim(raw) === "") {
    return null;
  }

  const splitTokens = _split(raw, ",");
  const trimmedParts = _map(splitTokens, (token) => {
    return _trim(token);
  });

  return _compact(trimmedParts);
}

export function trimMediaflowBaseUrl(url: string): string {
  return _trim(url).replace(/\/+$/, "");
}

export function rewriteMediaflowPublicUrl(proxiedUrl: string): string {
  const publicBase = _trim(MEDIAFLOW_PROXY_PUBLIC_URL);

  if (publicBase === "") {
    return proxiedUrl;
  }

  try {
    const parsedProxied = new URL(proxiedUrl);
    const parsedPublic = new URL(publicBase);

    parsedProxied.protocol = parsedPublic.protocol;
    parsedProxied.hostname = parsedPublic.hostname;
    parsedProxied.port = parsedPublic.port;

    return parsedProxied.toString();
  } catch {
    return proxiedUrl;
  }
}

/** Redact credentials and API secrets before logging playback or proxy URLs. */
export function redactPlaybackUrlForLog(url: string): string {
  try {
    const parsed = new URL(url);

    if (parsed.username) {
      parsed.username = "***";
    }

    if (parsed.password) {
      parsed.password = "***";
    }

    const segments = parsed.pathname.split("/");
    const segmentKind = segments[1];
    const isXtreamPlaybackPath =
      segmentKind === "movie" || segmentKind === "live" || segmentKind === "series";

    if (isXtreamPlaybackPath) {
      const redactedSegments = segments.map((segment, index) => {
        if (index === 2 || index === 3) {
          return "***";
        }

        return segment;
      });

      parsed.pathname = redactedSegments.join("/");
    }

    if (parsed.searchParams.has("api_password")) {
      parsed.searchParams.set("api_password", "***");
    }

    if (parsed.searchParams.has("token")) {
      parsed.searchParams.set("token", "***");
    }

    return parsed.toString();
  } catch {
    return _trim(url).slice(0, 120);
  }
}

/** Host + path only — safe summary for proxied MediaFlow links. */
export function summarizeProxiedUrlForLog(url: string): string {
  try {
    const parsed = new URL(url);

    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "invalid-url";
  }
}

export function filenameFromPlaybackUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split("/").filter(Boolean);
    const basename = segments[segments.length - 1];

    if (basename) {
      return basename;
    }
  } catch {
    // fall through
  }

  return "stream";
}
