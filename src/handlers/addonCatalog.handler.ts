import { Cache, MetaPreview } from "stremio-addon-sdk";

import { getCatalogs } from "@/database/catalog.db";
import { listActiveHashes } from "@/database/common.db";
import { metaPreviewFactory } from "@/factories/streamCatalog.factory";
import { Args } from "@/types/stremio.types";
import { decodeToken } from "@/utils/crypto.utils";
import { dlog, logError, logWarn } from "@/utils/debug.utils";

export async function addonCatalogHandler(args: Args): Promise<{ metas: MetaPreview[] } & Cache> {
  try {
    const { config: config_hash = "", type, extra } = args;
    if (!config_hash) {
      logWarn("addon catalog", "Invalid config token");
      dlog("[CATALOG] Invalid config token");
    }
    const config = decodeToken(config_hash);
    if (!config) {
      return { metas: [] };
    }

    const { uuid } = config as { uuid: string };
    const hashes = await listActiveHashes(uuid);
    if (!hashes.length) {
      return { metas: [] };
    }
    const catalogs = await getCatalogs(hashes, type, extra);
    return {
      metas: catalogs.map((catalog) => metaPreviewFactory(catalog, type)),
    };
  } catch (error) {
    logError("addon catalog", "Handler error", error);
    dlog("[CATALOG] Error", error);
    return {
      metas: [],
    };
  }
}
