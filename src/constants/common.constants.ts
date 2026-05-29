export const PORT = parseInt(process.env.PORT || "7001", 10);

export const ADDON_NAME = "FlumeTV";
export const ADDON_ID = "org.flumetv";

/** Express mount path for public Stremio addon routes (`/addon/:token/...`). */
export const ADDON_HTTP_MOUNT_PREFIX = "/addon";

export const STREAM_LIMIT_PER_PAGE = 100;

/** httpOnly session cookie name for REST API (not Stremio config token). */
export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "session";
