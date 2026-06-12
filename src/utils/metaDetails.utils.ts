import _isEmpty from "lodash/isEmpty";
import _toNumber from "lodash/toNumber";
import _toString from "lodash/toString";
import _trim from "lodash/trim";
import type { Stream as StremioPlaybackStream } from "stremio-addon-sdk";

const MAX_HTTP_IMAGE_URL = 8192;
const MAX_DATA_IMAGE_URL = 512 * 1024;

/** Inclusive unix second bounds (~1980–2100); rejects small ints mistaken for dates. */
const MIN_UNIX_SEC = 315_532_800;
const MAX_UNIX_SEC = 4_102_444_800;
const MIN_UNIX_MS = MIN_UNIX_SEC * 1000;
const MAX_UNIX_MS = MAX_UNIX_SEC * 1000;

const YOUTUBE_ID_PATTERN =
  /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})|^(?:[\w-]{11})$/;

export function isNonEmptyStringLike(value: unknown): boolean {
  const coerced = _toString(value);
  const trimmed = _trim(coerced);

  return !_isEmpty(trimmed);
}

/**
 * Returns the first usable poster/thumbnail URL: http(s), or bounded data:image base64.
 */
export function firstValidImageUrl(...candidates: (string | undefined)[]): string {
  for (const candidate of candidates) {
    const asString = _toString(candidate);
    const trimmed = _trim(asString);

    if (_isEmpty(trimmed)) {
      continue;
    }

    if (/^https?:\/\//i.test(trimmed) && trimmed.length <= MAX_HTTP_IMAGE_URL) {
      return trimmed;
    }

    if (
      trimmed.startsWith("data:image/") &&
      trimmed.includes(";base64,") &&
      trimmed.length <= MAX_DATA_IMAGE_URL
    ) {
      return trimmed;
    }
  }

  return "";
}

export function stremioPlaybackStreamFromUrl(
  playableUrl: string,
  nameLabel?: string,
): StremioPlaybackStream {
  const labelTrimmed = _trim(_toString(nameLabel));
  const stream: StremioPlaybackStream = {
    url: playableUrl,
  };

  if (!_isEmpty(labelTrimmed)) {
    stream.name = labelTrimmed;
  }

  return stream;
}

export function extractYouTubeVideoId(trailerField?: string): string | undefined {
  const asString = _toString(trailerField);
  const trimmed = _trim(asString);

  if (_isEmpty(trimmed)) {
    return undefined;
  }

  const match = trimmed.match(YOUTUBE_ID_PATTERN);

  return match?.[1] ?? undefined;
}

/**
 * Parses Xtream date strings or unix timestamps into ISO 8601, or undefined if not plausible.
 */
export function parseReleaseTimestampToIso(raw?: string): string | undefined {
  const asString = _toString(raw);
  const trimmed = _trim(asString);

  if (_isEmpty(trimmed)) {
    return undefined;
  }

  if (/^\d+$/.test(trimmed)) {
    const numeric = _toNumber(trimmed);

    if (trimmed.length <= 10) {
      if (numeric < MIN_UNIX_SEC || numeric > MAX_UNIX_SEC) {
        return undefined;
      }

      const millisFromUnixSeconds = numeric * 1000;
      const dateFromUnixSeconds = new Date(millisFromUnixSeconds);

      return dateFromUnixSeconds.toISOString();
    }

    if (numeric < MIN_UNIX_MS || numeric > MAX_UNIX_MS) {
      return undefined;
    }

    const dateFromUnixMillis = new Date(numeric);

    return dateFromUnixMillis.toISOString();
  }

  const parsedMs = Date.parse(trimmed);

  if (!Number.isFinite(parsedMs)) {
    return undefined;
  }

  const dateFromParsed = new Date(parsedMs);

  return dateFromParsed.toISOString();
}

export function normalizeImdbRatingForMeta(rating?: string): string {
  const ratingAsString = _toString(rating);
  const trimmed = _trim(ratingAsString);

  if (_isEmpty(trimmed)) {
    return "";
  }

  const numeric = _toNumber(trimmed);

  if (!numeric || numeric <= 0 || Number.isNaN(numeric)) {
    return "";
  }

  return trimmed;
}
