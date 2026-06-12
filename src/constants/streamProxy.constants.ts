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

export const MEDIAFLOW_GENERATE_URLS_TIMEOUT_MS = 30_000;
export const MEDIAFLOW_BATCH_CHUNK_SIZE = 50;
