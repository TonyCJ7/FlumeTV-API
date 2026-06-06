import path from "node:path";

import _split from "lodash/split";
import _toLower from "lodash/toLower";
import _trim from "lodash/trim";

const SEASON_EPISODE_PATTERNS: RegExp[] = [
  /\bS(\d{1,2})\s*E(\d{1,4})\b/i,
  /\bS(\d{1,2})\s*\.\s*E(\d{1,4})\b/i,
  /\b(\d{1,2})\s*[xX]\s*(\d{1,4})\b/,
  /\bSeason\s+(\d{1,2})\s+Episode\s+(\d{1,4})\b/i,
  /\bSeason\s+(\d{1,2})\s*,\s*Episode\s+(\d{1,4})\b/i,
];

function extensionFromPathExt(ext: string): string | null {
  if (!ext || ext.length <= 1) {
    return null;
  }

  return _toLower(ext.slice(1));
}

export function fileExtensionFromUrl(url: string): string | null {
  try {
    const u = new URL(url);

    return extensionFromPathExt(path.extname(u.pathname));
  } catch {
    const noQuery = _split(url, "?")[0] ?? url;

    return extensionFromPathExt(path.extname(noQuery));
  }
}

/**
 * Returns season / episode and a best-effort series title when an IPTV-style label contains
 * common `S01E01` / `1x02` / `Season 1 Episode 2` markers.
 */
export function parseSeasonEpisodeFromTitle(rawTitle: string): {
  episode: number;
  season: number;
  /** Text before the matched marker (trimmed), for grouping into a series row. */
  seriesTitleHint: string;
} | null {
  const title = _trim(rawTitle);

  if (!title) {
    return null;
  }

  for (const pattern of SEASON_EPISODE_PATTERNS) {
    const match = pattern.exec(title);

    if (!match) {
      continue;
    }

    const season = Number.parseInt(match[1] ?? "", 10);
    const episode = Number.parseInt(match[2] ?? "", 10);

    if (!Number.isFinite(season) || !Number.isFinite(episode) || season < 0 || episode < 0) {
      continue;
    }

    const idx = match.index ?? 0;
    const before = _trim(title.slice(0, idx));

    const seriesTitleHint =
      before.length > 0 ? before.replace(/\s*[-–—|•]\s*$/, "") : _trim(title.replace(pattern, ""));

    return {
      episode,
      season,
      seriesTitleHint: seriesTitleHint.length > 0 ? seriesTitleHint : title,
    };
  }

  return null;
}
