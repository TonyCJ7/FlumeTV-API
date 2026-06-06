export const ADDON_STREAM_TYPE = {
  MOVIE: "movie",
  SERIES: "series",
  LIVE: "live",
} as const;

export const STREMIO_STREAM_TYPE = {
  MOVIE: "movie",
  SERIES: "series",
  TV: "tv",
  CHANNEL: "channel",
} as const;

export const ID_PREFIX = "iptv_t1496:";

export const STREAM_TABLE_TYPE_MAP = {
  movie: "movie_stream",
  series: "series_stream",
  tv: "live_stream",
  channel: "live_stream",
} as const;

export const CATEGORY_TABLE_TYPE_MAP = {
  movie: "movie_category",
  series: "series_category",
  tv: "live_category",
  channel: "live_category",
} as const;

/** Stored in `hash_config.config_type` (TEXT CHECK); same literals as DB enum. */
export const CONFIG_TYPE = {
  XTREME: "xtreme",
  DIRECT: "direct",
} as const;

/**
 * Sentinel `category_id` for Xtream streams whose panel row omits `category_id` or references a missing category.
 * Stored only in-memory for sync formatting; written to PostgreSQL `*_category.category_id` as a negative integer.
 */
/** Sentinel category id when panel omits a label for a stream's category. */
export const XTREAM_FALLBACK_CATEGORY_ID = -999999;
