import _includes from "lodash/includes";

import { ROOM_LAST_OUTCOMES } from "@/constants/room.constants";
import type { RoomLastOutcome } from "@/types/room.types";

export function parseRoomLastOutcome(value: string | null | undefined): RoomLastOutcome | null {
  if (value == null || value.length === 0) {
    return null;
  }

  if (_includes(ROOM_LAST_OUTCOMES as readonly string[], value)) {
    return value as RoomLastOutcome;
  }

  return null;
}
