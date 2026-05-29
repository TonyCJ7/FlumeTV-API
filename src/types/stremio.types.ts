import type { Args as RawArgs } from "stremio-addon-sdk";

export type CatalogExtra = Partial<RawArgs["extra"]>;

export interface Args extends Omit<RawArgs, "extra"> {
  config?: string;
  extra: CatalogExtra;
}
