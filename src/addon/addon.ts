import { ADDON_ID, ADDON_NAME } from "@/constants/common.constants";
import { ID_PREFIX } from "@/constants/stream.constants";
import { addonCatalogHandler } from "@/handlers/addonCatalog.handler";
import { addonMetaHandler } from "@/handlers/addonMeta.handler";
import { addonBuilder } from "@/utils/stremioAddonSdk.utils";
import { addonStreamHandler } from "@/handlers/addonStream.handler";

export const builder = new addonBuilder({
  id: ADDON_ID,
  name: ADDON_NAME,
  description:
    "FlumeTV — M3U, EPG, and Xtream with encrypted configs, caching, and series support (Xtream + Direct)",
  version: "1.0.0",
  resources: ["catalog", "stream", "meta"],
  types: ["tv", "movie", "series"],
  catalogs: [
    {
      id: "iptv_channels",
      type: "tv",
      name: "Live channels",
      extra: [{ name: "search" }, { name: "skip" }],
    },
    {
      id: "iptv_movies",
      type: "movie",
      name: "Movies",
      extra: [{ name: "search" }, { name: "skip" }],
    },
    {
      id: "iptv_series",
      type: "series",
      name: "Series",
      extra: [{ name: "search" }, { name: "skip" }],
    },
  ],
  idPrefixes: [ID_PREFIX],
  behaviorHints: {
    configurable: true,
    configurationRequired: false,
  },
});

builder.defineStreamHandler(addonStreamHandler);

builder.defineCatalogHandler(addonCatalogHandler);
builder.defineMetaHandler(addonMetaHandler);

export const addonInterface = builder.getInterface();
