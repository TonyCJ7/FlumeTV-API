/**
 * Fetch queue + scheduler tick tuning. Read at process startup; restart the server after changing env.
 */

export const FETCH_PARALLELISM = parseInt(process.env.FETCH_PARALLELISM || "4", 10);

export const FETCH_MAX_BACKLOG_MS =
  parseInt(process.env.FETCH_MAX_BACKLOG_HOURS || "20", 10) * 3600000;

export const SCHEDULER_DUE_POLL_MS = parseInt(process.env.SCHEDULER_DUE_POLL_MS || "30000", 10);

export const SCHEDULER_INTERVAL_DEFAULT_MIN = parseInt(
  process.env.DEFAULT_SCHEDULER_INTERVAL_MINUTES || "1440",
  10,
);

/** Cap `fetch_timing` row count; oldest rows are deleted before insert when at cap. */
export const FETCH_TIMING_MAX_ROWS = parseInt(process.env.FETCH_TIMING_MAX_ROWS || "500", 10);

/**
 * When `fetch_timing` has no rows (or AVG is unusable), use this for the backlog guard only so the
 * ~20h cap still applies (see docs/backend-reference.md).
 */
export const SYNC_FETCH_MS_FALLBACK = parseInt(
  process.env.DEFAULT_FETCH_DURATION_MS_ESTIMATE || "120000",
  10,
);

/**
 * Long timeout for Xtream catalog/list fetches (`get_*_categories`, `get_*_streams`, `get_series`).
 */
const xtreamCatalogFetchTimeoutFromEnv = process.env.XTREAM_CATALOG_FETCH_TIMEOUT_MS || "3600000";

export const XTREAM_CATALOG_TIMEOUT_MS = parseInt(xtreamCatalogFetchTimeoutFromEnv, 10);

/** Timeout for single-title meta (`get_vod_info`, `get_series_info`). Default 2 minutes. */
export const XTREAM_META_TIMEOUT_MS = parseInt(
  process.env.XTREAM_META_FETCH_TIMEOUT_MS || "120000",
  10,
);

/** Direct playlist (M3U) download timeout. */
export const DIRECT_M3U_TIMEOUT_MS = parseInt(
  process.env.DIRECT_M3U_FETCH_TIMEOUT_MS || "3600000",
  10,
);
