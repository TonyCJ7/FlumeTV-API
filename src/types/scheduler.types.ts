/**
 * Scheduler row shape for “due now” queries (`listSchedulerRowsDueNow`).
 */
export type SchedulerRowDue = {
  hashId: string;
  intervalMinutes: number;
};

/**
 * Current scheduler row for a hash (interval + next run), e.g. room Server-Sent Events and config list API.
 */
export type SchedulerSnapshot = {
  intervalMinutes: number;
  nextTriggerAt: string;
};

/**
 * Postgres row shape for `getSchedulerSnapshot` (column aliases match SELECT).
 */
export type SchedulerSnapshotSqlRow = {
  interval_minutes: number;
  next_trigger_at: string;
};
