/** Backoff delays for the failed-email cron retryer (in milliseconds). */
export const RETRY_DELAY_MS = [
  5 * 60_000, // 5 min  — fast retry after transient blip
  15 * 60_000, // 15 min
  60 * 60_000, // 1 h
  4 * 60 * 60_000, // 4 h    — last attempt before permanent failure
] as const;

/** Number of cron-based retry attempts before an email is abandoned. */
export const MAX_RETRY_COUNT = RETRY_DELAY_MS.length; // 4
