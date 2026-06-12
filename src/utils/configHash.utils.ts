import crypto from "crypto";
import _entries from "lodash/entries";
import _isEmpty from "lodash/isEmpty";
import _join from "lodash/join";
import _map from "lodash/map";
import _sortBy from "lodash/sortBy";
import _toLower from "lodash/toLower";
import _trim from "lodash/trim";

import type {
  DirectCanonicalPayload,
  DirectHashInput,
  XtreamCanonicalPayload,
  XtreamHashInput,
} from "@/types/provider.types";

/**
 * Lexicographic key order at every object level; deterministic JSON for hashing.
 */
function stableStringify(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const parts = _map(value, (item) => {
      return stableStringify(item);
    });
    return `[${_join(parts, ",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sortedEntries = _sortBy(_entries(record), 0); // sort by key
    const pairs = _map(sortedEntries, (entry) => {
      const entryKey = entry[0];
      const entryValue = entry[1];
      const fragment = stableStringify(entryValue);
      return `${JSON.stringify(entryKey)}:${fragment}`;
    });
    return `{${_join(pairs, ",")}}`;
  }
  return "null";
}

function sha256HexOfCanonicalUtf8(canonicalJson: string): string {
  return crypto.createHash("sha256").update(canonicalJson, "utf8").digest("hex");
}

/**
 * Normalizes URLs for hashing: lowercase host, trim trailing `/` on path, drop `#fragment`,
 * keep whatever userinfo/query/path the URL already has (encoded consistently).
 */
function normalizeProviderUrl(raw: string): string {
  const trimmed = _trim(raw);
  if (!trimmed) {
    return "";
  }
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    parsed.hostname = _toLower(parsed.hostname);
    const pathname = parsed.pathname.replace(/\/+$/, "") || "";
    const host = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
    const search = parsed.search ?? "";
    let userPrefix = "";
    if (!_isEmpty(parsed.username) || !_isEmpty(parsed.password)) {
      const encUser = encodeURIComponent(parsed.username);
      const encPass = encodeURIComponent(parsed.password);
      userPrefix = _isEmpty(parsed.password) ? `${encUser}@` : `${encUser}:${encPass}@`;
    }
    return `${parsed.protocol}//${userPrefix}${host}${pathname}${search}`;
  } catch {
    return trimmed;
  }
}

/** Canonical object for Xtream hash (includes panel credentials). Bump `v` only when hash semantics change in production. */
function buildXtreamCanonicalPayload(input: XtreamHashInput): XtreamCanonicalPayload {
  const normalizedUrl = normalizeProviderUrl(input.panelUrl);
  const normalizedEpgUrl = normalizeProviderUrl(input.epgUrl ?? "");

  return {
    custom_epg: input.customEpg ?? "",
    epg_offset: Math.trunc(Number(input.epgOffset)) || 0,
    epg_url: normalizedEpgUrl,
    has_custom_epg: input.hasCustomEpg,
    panel_password: input.panelPassword,
    panel_username: input.panelUsername,
    url: normalizedUrl,
    v: 1,
  };
}

/** Canonical object for Direct hash. Bump `v` only when hash semantics change in production. */
function buildDirectCanonicalPayload(input: DirectHashInput): DirectCanonicalPayload {
  const normalizedM3u = normalizeProviderUrl(input.m3uUrl);
  const normalizedEpgUrl = normalizeProviderUrl(input.epgUrl ?? "");

  return {
    epg_offset: Math.trunc(Number(input.epgOffset)) || 0,
    epg_url: normalizedEpgUrl,
    has_custom_epg: input.hasCustomEpg,
    m3u_url: normalizedM3u,
    v: 1,
  };
}

export function computeXtreamConfigHash(input: XtreamHashInput): string {
  const payload = buildXtreamCanonicalPayload(input);
  const canonicalJson = stableStringify(payload);
  return sha256HexOfCanonicalUtf8(canonicalJson);
}

export function computeDirectConfigHash(input: DirectHashInput): string {
  const payload = buildDirectCanonicalPayload(input);
  const canonicalJson = stableStringify(payload);
  return sha256HexOfCanonicalUtf8(canonicalJson);
}
