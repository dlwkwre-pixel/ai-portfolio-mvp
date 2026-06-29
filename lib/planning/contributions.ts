// Pure date math for the contribution / DCA scheduler. Shared by the server
// actions and the reminder cron. All math is in UTC date-only to avoid TZ drift.

export type Cadence = "weekly" | "biweekly" | "monthly";

export const CADENCES: Cadence[] = ["weekly", "biweekly", "monthly"];
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toUTCMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function parseISO(s: string): Date {
  const [y, m, dd] = s.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, dd ?? 1));
}
function clampDayOfMonth(day: number): number {
  if (!Number.isFinite(day)) return 1;
  return Math.min(28, Math.max(1, Math.round(day)));
}

// First due date on/after `from`.
export function firstDueDate(cadence: Cadence, anchorDay: number, from: Date = new Date()): string {
  const base = toUTCMidnight(from);
  if (cadence === "monthly") {
    const day = clampDayOfMonth(anchorDay);
    let d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), day));
    if (d < base) d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, day));
    return isoDate(d);
  }
  const target = ((Math.round(anchorDay) % 7) + 7) % 7; // 0-6
  const add = (target - base.getUTCDay() + 7) % 7;
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + add);
  return isoDate(d);
}

// Next due date after the current one fires.
export function advanceDue(cadence: Cadence, anchorDay: number, currentDue: string): string {
  const cur = parseISO(currentDue);
  if (cadence === "monthly") {
    const day = clampDayOfMonth(anchorDay);
    return isoDate(new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, day)));
  }
  const add = cadence === "weekly" ? 7 : 14;
  const d = new Date(cur);
  d.setUTCDate(d.getUTCDate() + add);
  return isoDate(d);
}

export function cadenceLabel(cadence: Cadence, anchorDay: number): string {
  if (cadence === "monthly") {
    const day = clampDayOfMonth(anchorDay);
    const suffix = day === 1 || day === 21 ? "st" : day === 2 || day === 22 ? "nd" : day === 3 || day === 23 ? "rd" : "th";
    return `Monthly on the ${day}${suffix}`;
  }
  const wd = WEEKDAYS[((Math.round(anchorDay) % 7) + 7) % 7];
  return cadence === "weekly" ? `Every ${wd}` : `Every other ${wd}`;
}

// Approximate annualized total of a recurring contribution.
export function annualizedAmount(cadence: Cadence, amount: number): number {
  const periods = cadence === "weekly" ? 52 : cadence === "biweekly" ? 26 : 12;
  return amount * periods;
}
