/**
 * stremio-addon-sdk is CommonJS (`module.exports`). In this ESM project, named
 * imports from "stremio-addon-sdk" fail at runtime — import runtime API from here.
 */
import StremioAddonSdk from "stremio-addon-sdk";

export const addonBuilder = StremioAddonSdk.addonBuilder;
