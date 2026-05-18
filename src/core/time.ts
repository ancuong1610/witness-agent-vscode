// ---------------------------------------------------------------------------
// time.ts — Local-time formatting helpers for Witness artifact metadata.
// ---------------------------------------------------------------------------
//
// All functions in this module use the LOCAL machine timezone, not UTC.
//
// Why this module exists:
//   `new Date().toISOString()` returns a UTC timestamp (e.g.
//   "2026-05-14T23:45:00.000Z"). For developers whose local timezone is ahead
//   of UTC, the UTC date portion is yesterday's date. Session IDs, handover
//   IDs, and every human-visible "Created At / Assessed At / Generated At"
//   field in Witness artifacts must reflect the developer's local date and
//   time, not the UTC equivalent.
//
// OTel telemetry (telemetryWriter.ts) is intentionally excluded from this
// module: absolute UTC timestamps are correct for structured event logs.
//
// ---------------------------------------------------------------------------

/**
 * Returns the local date as a `YYYY-MM-DD` string.
 *
 * Uses the local timezone of the running machine, not UTC.
 *
 * @param date - Date to format. Defaults to the current time.
 */
export function formatLocalDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns a human-readable local timestamp as `YYYY-MM-DD HH:mm:ss`.
 *
 * Uses the local timezone of the running machine, not UTC. Suitable for
 * "Created At", "Assessed At", "Generated At" and similar fields inside
 * Witness markdown artifacts where the developer needs to read the time at
 * a glance without mentally converting from UTC.
 *
 * @param date - Date to format. Defaults to the current time.
 */
export function formatLocalTimestamp(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
