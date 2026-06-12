/** Persisted on `room.last_outcome` — result of the most recent finished sync run. */
export type RoomLastOutcome = "cancelled" | "completed" | "failed" | "error";

/**
 * Snapshot of a prefetch/sync `room` row as exposed via `hash_config.room_id`
 * (e.g. `getRoomSummary`, list endpoints, Server-Sent Events payloads).
 */
export type RoomSummary = {
  roomId: number;
  /** Matches `room.status` in the database (e.g. `queued`, `running`, `completed`). */
  roomStatus: string;
};

/** Log line color contract for `/logs/stream` (`event: log` payload field `tone`). */
export type RoomLogTone = "default" | "error" | "warning" | "success" | "info";

export type RoomLogKind = "text" | "sector";

export type RoomLogSectorStatus = "pending" | "in_progress" | "success" | "error";

/** Structured prefetch log line on log SSE and in `room_log_line` replay. */
export type RoomLogSsePayload = {
  seq: number;
  line: string;
  tone: RoomLogTone;
  kind?: RoomLogKind;
  logKey?: string;
  sector?: string;
  status?: RoomLogSectorStatus;
  bytesRead?: number;
  bytesTotal?: number | null;
  sectorPercent?: number | null;
};

export type AppendRoomLogStreamLineParams = {
  bytesRead?: number | null;
  bytesTotal?: number | null;
  hash: string;
  kind?: RoomLogKind;
  level?: string;
  line: string;
  logKey?: string | null;
  roomId: number;
  sector?: string | null;
  sectorPercent?: number | null;
  status?: RoomLogSectorStatus | null;
  tone?: RoomLogTone;
};

/** Raw SQL row for `room_log_line` replay queries. */
export type RoomLogStreamSqlRow = {
  bytes_read: number | null;
  bytes_total: number | null;
  created_at: string | null;
  kind: string;
  level: string | null;
  line: string;
  log_key: string | null;
  sector: string | null;
  sector_percent: number | null;
  seq: number;
  status: string | null;
  tone: string;
};

/** HTTP / SSE progress payload (assembled from `room.sync_*` columns). */
export type RoomSyncProgress = {
  /** Integer 0–100, monotonic non-decreasing within one room run. */
  percent: number;
  /** e.g. `auth` | `live` | `vod` | `series` | `m3u` | `db` */
  phase?: string;
  bytesRead?: number;
  /** `null` when `Content-Length` is unavailable. */
  bytesTotal?: number | null;
};

/**
 * Room + hash_config fields read for Server-Sent Events (`/api/hashes/:hash/room/events`).
 */
export type RoomSseSnapshot = {
  closedReason: string | null;
  hash: string;
  lastOutcome: RoomLastOutcome | null;
  lastSyncedAt: string | null;
  logsTail: string | null;
  progress: RoomSyncProgress | null;
  roomId: number | null;
  roomStatus: string | null;
  roomUpdatedAt: string | null;
  triggeredBy: string | null;
};

/** `room.sync_*` columns on joined list / snapshot queries. */
export type RoomSyncProgressSqlColumns = {
  sync_bytes_read: number | null;
  sync_bytes_total: number | null;
  sync_percent: number | null;
  sync_phase: string | null;
};

/**
 * `hash_config` LEFT JOIN `room` for enqueue checks (`room` may be missing).
 */
export type HashConfigLinkedRoomRow = {
  room_id: number | null;
  room_status: string | null;
};

/**
 * Inner-join row from `getRoomSummary` (SQL aliases `room_id` / `room_status`).
 */
export type RoomJoinedSummaryRow = {
  room_id: number;
  room_status: string;
};

/**
 * Raw SQL row for `getRoomSseSnapshot` (snake_case columns from PostgreSQL).
 */
export type RoomSseSqlRow = RoomSyncProgressSqlColumns & {
  closed_reason: string | null;
  hash: string;
  last_outcome: string | null;
  last_synced_at: string | null;
  logs_tail: string | null;
  room_id: number | null;
  room_status: string | null;
  room_updated_at: string | null;
  triggered_by: string | null;
};
