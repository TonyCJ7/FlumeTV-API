import querystring from "querystring";

import type { Request, Response } from "express";
import type { Cache } from "stremio-addon-sdk";
import _isArray from "lodash/isArray";
import _isEmpty from "lodash/isEmpty";
import _isFinite from "lodash/isFinite";
import _toNumber from "lodash/toNumber";

import type { Args } from "@/types/stremio.types";
import { logWarn } from "@/utils/debug.utils";

const CACHE_HEADER_MAP: Record<keyof Cache, string> = {
  cacheMaxAge: "max-age",
  staleRevalidate: "stale-while-revalidate",
  staleError: "stale-if-error",
};

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

type StremioAddonCachePayload = Partial<Cache> & { redirect?: string };

function firstQueryParam(value: string | string[] | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (_isArray(value)) {
    return value[0];
  }

  return value;
}

/** Coerce raw querystring catalog extras to typed `Args.extra` (SDK passes strings from `qs.parse`). */
function catalogExtraFromQuery(raw: Record<string, string | string[] | undefined>): Args["extra"] {
  const extra: Args["extra"] = {};

  const search = firstQueryParam(raw.search);
  if (!_isEmpty(search)) {
    extra.search = search;
  }

  const genre = firstQueryParam(raw.genre);
  if (!_isEmpty(genre)) {
    extra.genre = genre;
  }

  const skipRaw = firstQueryParam(raw.skip);
  if (!_isEmpty(skipRaw)) {
    const skip = _toNumber(skipRaw);
    if (_isFinite(skip) && skip >= 0) {
      extra.skip = Math.floor(skip);
    }
  }

  return extra;
}

/** Parse catalog `extra` query params from the URL tail (mirrors SDK `getRouter`). */
export function parseStremioCatalogExtra(req: Request): Args["extra"] {
  if (!req.params.extra) {
    return {};
  }

  const lastSegment = req.url.split("/").pop();
  if (!lastSegment || !lastSegment.endsWith(".json")) {
    return {};
  }

  const raw = querystring.parse(lastSegment.slice(0, -5));
  return catalogExtraFromQuery(raw);
}

/** Send Stremio addon JSON with cache headers and optional redirect (parity with SDK `getRouter`). */
export function sendStremioAddonResponse(res: Response, payload: StremioAddonCachePayload): void {
  const cacheParts: string[] = [];

  for (const prop of Object.keys(CACHE_HEADER_MAP) as (keyof Cache)[]) {
    const cacheProp = CACHE_HEADER_MAP[prop];
    const cacheValue = payload[prop];

    if (cacheValue === undefined || !Number.isInteger(cacheValue)) {
      continue;
    }

    if (cacheValue > ONE_YEAR_SECONDS) {
      logWarn(
        "addon route",
        `${prop} set to more than 1 year — cache times are in seconds, not milliseconds`,
      );
    }

    cacheParts.push(`${cacheProp}=${cacheValue}`);
  }

  const cacheControl = cacheParts.join(", ");

  if (cacheControl !== "") {
    res.setHeader("Cache-Control", `${cacheControl}, public`);
  }

  if (payload.redirect) {
    res.redirect(307, payload.redirect);
    return;
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(200).json(payload);
}
