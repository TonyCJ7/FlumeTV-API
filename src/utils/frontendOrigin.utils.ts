import _compact from "lodash/compact";
import _map from "lodash/map";
import _trim from "lodash/trim";

const DEFAULT_FRONTEND_ORIGIN = "http://localhost:7000";

function frontendOriginsListFromEnv(): string[] {
  const raw = process.env.FRONTEND_ORIGIN;

  if (!raw || _trim(raw) === "") {
    return [DEFAULT_FRONTEND_ORIGIN];
  }

  const parts = _compact(_map(raw.split(","), (seg) => _trim(seg)));

  return parts.length > 0 ? parts : [DEFAULT_FRONTEND_ORIGIN];
}

/** All comma-separated `FRONTEND_ORIGIN` values (for CORS). */
export function frontendOriginsFromEnv(): string[] {
  return frontendOriginsListFromEnv();
}

/** First `FRONTEND_ORIGIN` segment with trailing slashes stripped (for public redirects). */
export function frontendPublicOriginFromEnv(): string {
  const first = frontendOriginsListFromEnv()[0];

  return first.replace(/\/+$/, "");
}
