import type { Request, Response } from "express";
import _toString from "lodash/toString";
import type { ContentType, Cache } from "stremio-addon-sdk";

import { addonInterface } from "@/addon/addon";
import { Args } from "@/types/stremio.types";
import { parseStremioCatalogExtra, sendStremioAddonResponse } from "@/utils/addonRoute.utils";
import { logError } from "@/utils/debug.utils";

export type AddonResourceName = "catalog" | "meta" | "stream";

type AddonInterfaceGet = (
  resource: AddonResourceName,
  type: ContentType,
  id: string,
  extra: Args["extra"],
  config: string,
) => Promise<Partial<Cache> & { redirect?: string }>;

/** Runtime `getInterface().get` is positional; `@types/stremio-addon-sdk` declares a single-arg shape. */
const getAddonResource = addonInterface.get as unknown as AddonInterfaceGet;

function isNoHandlerError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "noHandler" in error &&
    (error as { noHandler: boolean }).noHandler === true
  );
}

/** GET `/addon/:config_hash/{catalog|meta|stream}/:type/:id.json` — dispatches via `addonInterface.get`. */
export async function handleAddonResourceRoute(
  req: Request,
  res: Response,
  resourceOverride?: AddonResourceName,
): Promise<void> {
  try {
    const resource = resourceOverride ?? (req.params.resource as AddonResourceName);
    const config_hash = _toString(req.params.config_hash ?? "");
    const type = req.params.type as ContentType;
    const id = _toString(req.params.id ?? "");
    const extra = resource === "catalog" ? parseStremioCatalogExtra(req) : ({} as Args["extra"]);

    const result = await getAddonResource(resource, type, id, extra, config_hash);

    sendStremioAddonResponse(res, result);
  } catch (error) {
    if (isNoHandlerError(error)) {
      res.status(404).json({ err: "not found" });
      return;
    }

    logError("addon resource route", "Handler error", error);
    res.status(500).json({ err: "handler error" });
  }
}
