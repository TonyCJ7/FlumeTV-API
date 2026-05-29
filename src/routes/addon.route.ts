import cors from "cors";
import { Router } from "express";

import { handleAddonConfigureRedirect } from "@/handlers/addonConfigure.handler";
import { handleGetAddonManifest } from "@/handlers/addonManifest.handler";
import { handleAddonResourceRoute } from "@/handlers/addonResource.handler";

export const addonRouter = Router({ mergeParams: true });

addonRouter.use(cors());

addonRouter.get("/manifest.json", handleGetAddonManifest);

addonRouter.get("/configure", handleAddonConfigureRedirect);

addonRouter.get("/catalog/:type/:id/:extra.json", (req, res) => {
  void handleAddonResourceRoute(req, res, "catalog");
});

addonRouter.get("/:resource(catalog|meta|stream)/:type/:id.json", (req, res) => {
  void handleAddonResourceRoute(req, res);
});

addonRouter.use((_req, res) => {
  res.status(404).json({ err: "not found" });
});
