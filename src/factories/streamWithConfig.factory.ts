import type { ConfigType, StreamWithConfig, StreamWithConfigDbRow } from "@/types/stream.types";
import { decryptPanelPasswordStored } from "@/utils/crypto.utils";

/** Maps a joined stream + config SQL row to the addon `StreamWithConfig` union (decrypts panel password). */
export function streamWithConfigFromDbRow(
  row: StreamWithConfigDbRow | undefined,
): StreamWithConfig[keyof StreamWithConfig] {
  if (!row) {
    return {} as StreamWithConfig[keyof StreamWithConfig];
  }

  const passwordStored = row.password;
  let password = passwordStored ?? "";

  if (typeof passwordStored === "string" && passwordStored.length > 0) {
    password = decryptPanelPasswordStored(passwordStored);
  }

  return {
    ...row,
    config_type: row.config_type as ConfigType,
    password,
  } as StreamWithConfig[keyof StreamWithConfig];
}
