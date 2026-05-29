/**
 * Sentinel `category_id` for Xtream streams whose panel row omits `category_id` or references a missing category.
 * Stored only in-memory for sync formatting; written to PostgreSQL `*_category.category_id` as a negative integer.
 */
/** Sentinel category id when panel omits a label for a stream’s category. */
export const XTREAM_FALLBACK_CATEGORY_ID = -999999;
