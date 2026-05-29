import type { Request, Response } from "express";
import _trim from "lodash/trim";

import { REST_ERROR_CODES } from "@/constants/errorCodes.constants";
import type { GetStremioManifestUrlResponseBody } from "@/types/rest.types";
import { encodeToken } from "@/utils/crypto.utils";
import { sendKnownRestError } from "@/utils/restError.utils";

function publicBaseForManifest(req: Request): string {
  const baseUrl = _trim(process.env.BASE_URL ?? "");
  if (baseUrl !== "") {
    return baseUrl.replace(/\/+$/, "");
  }

  return `${req.protocol}://${req.get("host")}`;
}

/** GET `/api/stremio/manifest-url` — clipboard manifest + Stremio Web install link. */
export function handleGetStremioManifestUrl(req: Request, res: Response): void {
  const userId = req.userId;

  if (!userId) {
    sendKnownRestError(res, REST_ERROR_CODES.AUTH_SESSION_MISSING);
    return;
  }

  const token = encodeToken({ uuid: userId });
  const publicBase = publicBaseForManifest(req);
  const manifestUrl = `${publicBase}/${token}/manifest.json`;
  const stremioWebInstallUrl = `https://web.stremio.com/#/addons?addon=${encodeURIComponent(manifestUrl)}`;
  const body: GetStremioManifestUrlResponseBody = { manifestUrl, stremioWebInstallUrl };

  res.status(200).json(body);
}
