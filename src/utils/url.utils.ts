import path from "node:path";

import _split from "lodash/split";
import _toLower from "lodash/toLower";

export function extensionFromPathExt(ext: string): string | null {
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
