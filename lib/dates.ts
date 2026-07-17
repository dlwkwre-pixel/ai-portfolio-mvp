// Date-only string helpers.
//
// `new Date("2026-07-16")` parses as UTC MIDNIGHT, so in any timezone west of
// UTC, formatting it back with toLocaleDateString shows the PREVIOUS day —
// chart axes and tooltips were labeling Friday's snapshot "Thursday" for every
// US user. Parsing at local noon sidesteps the boundary in both directions.
//
// Use these for any "YYYY-MM-DD" (or ISO string where only the day matters).
// Full ISO timestamps with a time component are fine to hand to new Date() directly.

/** Parse a date-only string (or the day part of an ISO timestamp) at LOCAL noon. */
export function parseDay(day: string): Date {
  return new Date(day.slice(0, 10) + "T12:00:00");
}

/** Format a date-only string for display without the UTC off-by-one. */
export function formatDay(day: string, options?: Intl.DateTimeFormatOptions): string {
  const d = parseDay(day);
  if (isNaN(d.getTime())) return day;
  return d.toLocaleDateString(undefined, options ?? { month: "short", day: "numeric" });
}
