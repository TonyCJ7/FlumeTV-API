import { ADDON_ID, ADDON_LOGO_URL, ADDON_NAME } from "@/constants/common.constants";
import { ID_PREFIX } from "@/constants/stream.constants";
import { addonCatalogHandler } from "@/handlers/addonCatalog.handler";
import { addonStreamHandler } from "@/handlers/addonStream.handler";
import { addonMetaHandler } from "@/handlers/addonMeta.handler";
import { addonBuilder } from "@/utils/stremioAddonSdk.utils";

export const builder = new addonBuilder({
  id: ADDON_ID,
  name: ADDON_NAME,
  description:
    "FlumeTV — M3U, EPG, and Xtream with encrypted configs, caching, and series support (Xtream + Direct)",
  logo: ADDON_LOGO_URL,
  version: "1.0.0",
  resources: ["catalog", "stream", "meta"],
  types: ["tv", "movie", "series"],
  catalogs: [
    {
      id: "flumetv_channels",
      type: "tv",
      name: "Live channels",
      extra: [{ name: "search" }, { name: "skip" }],
    },
    {
      id: "flumetv_movies",
      type: "movie",
      name: "Movies",
      extra: [{ name: "search" }, { name: "skip" }],
    },
    {
      id: "flumetv_series",
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
