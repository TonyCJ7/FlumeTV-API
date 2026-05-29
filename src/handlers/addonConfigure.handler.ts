import type { Request, Response } from "express";
import _toString from "lodash/toString";
import _trim from "lodash/trim";

import { decodeToken } from "@/utils/crypto.utils";
import { dlog, logWarn } from "@/utils/debug.utils";
import { frontendPublicOriginFromEnv } from "@/utils/frontendOrigin.utils";

/** GET `/addon/:config_hash/configure` — redirect Stremio Configure to frontend config panel. */
export function handleAddonConfigureRedirect(req: Request, res: Response): void {
  const config_hash = _toString(req.params.config_hash ?? "");
  const frontendOrigin = frontendPublicOriginFromEnv();
  const configPath = `${frontendOrigin}/config`;

  const payload = decodeToken<{ uuid?: string }>(config_hash);
  const uuid = payload ? _trim(payload.uuid ?? "") : "";

  if (!payload || uuid === "") {
    logWarn("addon configure", "Invalid config token");
    dlog("[CONFIGURE] Invalid config token");
    res.redirect(302, configPath);
    return;
  }

  const location = `${configPath}?uuid=${encodeURIComponent(uuid)}`;
  res.redirect(302, location);
}
