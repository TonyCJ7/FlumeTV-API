import _trim from "lodash/trim";

export const MEDIAFLOW_PROXY_URL = _trim(process.env.MEDIAFLOW_PROXY_URL ?? "");
export const MEDIAFLOW_PROXY_API_PASSWORD = _trim(process.env.MEDIAFLOW_PROXY_API_PASSWORD ?? "");
export const MEDIAFLOW_PROXY_PUBLIC_URL = _trim(process.env.MEDIAFLOW_PROXY_PUBLIC_URL ?? "");
export const PROXY_ACCEPTED_USERS_RAW = process.env.PROXY_ACCEPTED_USERS ?? "";

const MEDIAFLOW_PROXY_TRANSCODE_RAW = _trim(
  process.env.MEDIAFLOW_PROXY_TRANSCODE ?? "",
).toLowerCase();

/** When true, MediaFlow `generate_urls` items include `query_params: { transcode: "true" }`. */
export const MEDIAFLOW_PROXY_TRANSCODE_ENABLED =
  MEDIAFLOW_PROXY_TRANSCODE_RAW === "1" ||
  MEDIAFLOW_PROXY_TRANSCODE_RAW === "true" ||
  MEDIAFLOW_PROXY_TRANSCODE_RAW === "yes";

const MEDIAFLOW_PROXY_RESOLVE_REDIRECTS_RAW = _trim(
  process.env.MEDIAFLOW_PROXY_RESOLVE_REDIRECTS ?? "",
).toLowerCase();

/**
 * When true, resolve panel playback redirects before MediaFlow `generate_urls`.
 * Enabled when transcode is on, or when `MEDIAFLOW_PROXY_RESOLVE_REDIRECTS` is set.
 */
export const MEDIAFLOW_PROXY_RESOLVE_REDIRECTS_ENABLED =
  MEDIAFLOW_PROXY_TRANSCODE_ENABLED ||
  MEDIAFLOW_PROXY_RESOLVE_REDIRECTS_RAW === "1" ||
  MEDIAFLOW_PROXY_RESOLVE_REDIRECTS_RAW === "true" ||
  MEDIAFLOW_PROXY_RESOLVE_REDIRECTS_RAW === "yes";

export const PLAYBACK_REDIRECT_RESOLVE_TIMEOUT_MS = 15_000;
export const PLAYBACK_REDIRECT_MAX_HOPS = 5;

export const MEDIAFLOW_GENERATE_URLS_TIMEOUT_MS = 30_000;
export const MEDIAFLOW_BATCH_CHUNK_SIZE = 50;
