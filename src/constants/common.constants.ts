export const PORT = parseInt(process.env.PORT || "7001", 10);

export const ADDON_NAME = "FlumeTV";
export const ADDON_ID = "org.flumetv";

/** Stremio manifest `logo` — same asset as README (`FlumeTV-UI/public/assets/flumeMix.png`). */
export const ADDON_LOGO_URL =
  "https://raw.githubusercontent.com/TonyCJ7/FlumeTV-UI/refs/heads/main/public/assets/flume.png";

/** Express mount path for public Stremio addon routes (`/addon/:token/...`). */
export const ADDON_HTTP_MOUNT_PREFIX = "/addon";

export const STREAM_LIMIT_PER_PAGE = 100;

/** Minimum search term length before trigram fuzzy matching is applied; shorter terms use ILIKE only. */
export const CATALOG_SEARCH_FUZZY_MIN_LENGTH = 3;

/** pg_trgm similarity threshold (0–1) for fuzzy catalog name search. */
export const CATALOG_SEARCH_SIMILARITY_THRESHOLD = 0.4;

/** httpOnly session cookie name for REST API (not Stremio config token). */
export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "session";
