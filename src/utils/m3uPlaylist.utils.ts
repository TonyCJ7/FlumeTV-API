import _trim from "lodash/trim";

export type M3uExtinfLineParts = {
  displayTitle: string;
  groupTitle: string | null;
  logo: string | null;
};

/** IPTV `#EXTINF`: attributes use double quotes; display name follows the last top-level comma. */
export function parseM3uExtinfLine(line: string): M3uExtinfLineParts {
  const groupMatch = /group-title\s*=\s*"([^"]*)"/i.exec(line);
  const logoMatch = /tvg-logo\s*=\s*"([^"]*)"/i.exec(line);
  const lastComma = line.lastIndexOf(",");

  let displayTitle = _trim(
    lastComma >= 0 ? line.slice(lastComma + 1) : line.replace(/^#EXTINF\s*:\s*[^\s]+\s*/, ""),
  );

  if (lastComma < 0) {
    displayTitle = _trim(line.replace(/^#EXTINF\s*:\s*[^\s]+\s*/, ""));
  }

  return {
    displayTitle,
    groupTitle: groupMatch ? (groupMatch[1] ?? null) : null,
    logo: logoMatch ? (logoMatch[1] ?? null) : null,
  };
}

/** Whether a non-directive M3U line looks like a stream URL. */
export function isProbablyM3uStreamUrlLine(line: string): boolean {
  const t = _trim(line);

  if (!t || t.startsWith("#")) {
    return false;
  }

  return /^https?:\/\//i.test(t) || t.startsWith("rtmp://") || t.startsWith("rtsp://");
}
