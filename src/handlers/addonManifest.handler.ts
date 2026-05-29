import type { Request, Response } from "express";

import { addonInterface } from "@/addon/addon";

/** GET `/addon/:config_hash/manifest.json` — static manifest JSON (keeps `behaviorHints.configurable` for Stremio Configure). */
export function handleGetAddonManifest(_req: Request, res: Response): void {
  const { manifest } = addonInterface;

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(200).json(manifest);
}
