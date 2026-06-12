import type { RoomLogTone } from "@/types/room.types";

/**
 * Room statuses that block a new prefetch enqueue for the same hash (see scheduler queue).
 */
export const ACTIVE_SYNC_ROOM_STATUSES = ["queued", "running", "fetching"] as const;

/** Frozen log `tone` literals for SSE + DB (frontend color mapping). */
export const ROOM_LOG_TONES: readonly RoomLogTone[] = [
  "default",
  "error",
  "warning",
  "success",
  "info",
] as const;

/** Terminal room states during worker/queue close before reset to `idle`. */
export const TERMINAL_ROOM_STATUSES = ["cancelled", "completed", "failed", "error"] as const;

/** Persisted on `room.last_outcome` — result of the most recent finished sync run. */
export const ROOM_LAST_OUTCOMES = ["cancelled", "completed", "failed", "error"] as const;

/** `room.closed_reason` when an active sync outlived the process (queue/worker map is empty on boot). */
export const ROOM_CLOSED_REASON_PROCESS_RESTARTED = "process_restarted";

/** User-facing prefetch log line appended when an active sync is failed on process boot. */
export const ROOM_PROCESS_RESTARTED_LOG_LINE = "Server restarted during sync";

/**
 * `room.triggered_by` must reference `user.user_id`. Scheduler-driven prefetch uses this synthetic user
 * (created at DB init) so rows are identifiable as scheduler-started, not tied to an arbitrary bridge user.
 */
export const SCHEDULER_TRIGGER_USER_ID = "scheduler";
