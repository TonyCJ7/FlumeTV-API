import _includes from "lodash/includes";

import { ACTIVE_SYNC_ROOM_STATUSES } from "@/constants/room.constants";
import { CONFIG_TYPE } from "@/constants/stream.constants";
import { parseRoomLastOutcome } from "@/utils/roomOutcome.utils";
import { roomSyncProgressFromRow } from "@/utils/syncProgress.utils";
import type { UserConfigListDbRow } from "@/types/provider.types";
import type {
  ConfigListItemDirect,
  ConfigListItemXtream,
  ConfigListSchedulerSnapshot,
} from "@/types/rest.types";

function schedulerSnapshotFromRow(row: UserConfigListDbRow): ConfigListSchedulerSnapshot | null {
  if (row.scheduler_next_trigger_at == null || row.scheduler_interval_minutes == null) {
    return null;
  }

  return {
    intervalMinutes: row.scheduler_interval_minutes,
    nextTriggerAt: row.scheduler_next_trigger_at,
  };
}

function listItemBaseFromRow(row: UserConfigListDbRow, userId: string) {
  const isRoomActive =
    row.room_status != null && _includes(ACTIVE_SYNC_ROOM_STATUSES, row.room_status);

  return {
    configName: row.config_name,
    hash: row.hash,
    isActive: row.user_is_active,
    isRoomActive,
    lastSyncedAt: row.last_synced_at,
    progress: roomSyncProgressFromRow(row),
    roomId: row.room_id,
    roomLastOutcome: parseRoomLastOutcome(row.room_last_outcome),
    roomStatus: row.room_status,
    scheduler: schedulerSnapshotFromRow(row),
    triggeredBy: row.triggered_by,
    triggeredByMe: row.triggered_by != null && row.triggered_by === userId,
  };
}

export function xtremeConfigItemFactory(
  row: UserConfigListDbRow,
  userId: string,
): ConfigListItemXtream {
  const base = listItemBaseFromRow(row, userId);

  return {
    ...base,
    customEpg: row.xtream_custom_epg,
    epgOffset: Math.trunc(Number(row.xtream_epg_offset)) || 0,
    epgUrl: row.xtream_epg_url,
    hasCustomEpg: !!row.xtream_has_custom_epg,
    panelUrl: row.xtream_url ?? "",
    panelUsername: row.xtream_username ?? "",
    type: "xtream",
  };
}

export function directConfigItemFactory(
  row: UserConfigListDbRow,
  userId: string,
): ConfigListItemDirect {
  const base = listItemBaseFromRow(row, userId);

  return {
    ...base,
    epgOffset: Math.trunc(Number(row.direct_epg_offset)) || 0,
    epgUrl: row.direct_epg_url,
    hasCustomEpg: !!row.direct_has_custom_epg,
    m3uUrl: row.direct_m3u_url ?? "",
    type: "direct",
  };
}

/**
 * Maps a joined `user_hash` / `hash_config` / provider / `room` / `scheduler` row to a REST list item.
 */
export function configItemFactory(
  row: UserConfigListDbRow,
  userId: string,
): ConfigListItemXtream | ConfigListItemDirect {
  if (row.config_type === CONFIG_TYPE.XTREME) {
    return xtremeConfigItemFactory(row, userId);
  }

  return directConfigItemFactory(row, userId);
}
