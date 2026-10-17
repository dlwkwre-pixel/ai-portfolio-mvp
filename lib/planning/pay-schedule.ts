import { looksLikePayroll, payEvents, type CashFlowTransaction } from "./transactions";

// Pay-schedule helpers for income entered by hand (no bank link):
//  - likelyPaycheckSource: does a new "extra" income entry look like a paycheck from one of
//    the user's income lines? (so it can replace expected pay instead of adding on top)
//  - detectPayFrequency: from recorded paychecks, how often is this person actually paid?
//    Catches a biweekly paycheck entered with frequency "monthly", which makes "expected"
//    one paycheck a month instead of about 2.17.

export type IncomeLine = { id: string; label: string; amount: number; frequency: string };

// Amount within 30% of a line's paycheck, or a payroll-sounding description. For a monthly
// line both the full amount and half of it count as "a paycheck" (twice-a-month pay).
export function likelyPaycheckSource(amount: number, text: string, lines: IncomeLine[]): IncomeLine | null {
  if (!(amount > 0) || lines.length === 0) return null;
  let best: { line: IncomeLine; diff: number } | null = null;
  for (const line of lines) {
    const candidates = line.frequency === "monthly" ? [line.amount, line.amount / 2] : [line.amount];
    for (const c of candidates) {
      if (!(c > 0)) continue;
      const diff = Math.abs(amount - c) / c;
      if (diff <= 0.3 && (!best || diff < best.diff)) best = { line, diff };
    }
  }
  if (best) return best.line;
  return looksLikePayroll(text) && lines.length === 1 ? lines[0] : null;
}

// confident=false: the paychecks fit both "twice a month" and "every 2 weeks" (too few to
// tell them apart) — callers shouldn't push a switch between those two on that evidence.
export type DetectedSchedule = { frequency: "weekly" | "biweekly" | "semimonthly" | "monthly"; perCheck: number; checks: number; confident: boolean };

const DAY = 86_400_000;

// Needs 2+ paychecks for the source in the last ~120 days. Uses the typical gap between
// them: ~7d weekly, ~14d biweekly, ~15d on 1st/15th-style dates semimonthly, ~30d monthly.
export function detectPayFrequency(txns: CashFlowTransaction[], sourceId: string, today: Date): DetectedSchedule | null {
  const since = new Date(today.getTime() - 120 * DAY).toISOString().slice(0, 10);
  // Split direct deposits (same paycheck, two accounts) are one paycheck.
  const checks = payEvents(txns
    .filter((t) => t.direction === "in" && t.cash_flow_item_id === sourceId && t.txn_date >= since && t.amount > 0));
  if (checks.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < checks.length; i++) gaps.push(Math.round((Date.parse(checks[i].date) - Date.parse(checks[i - 1].date)) / DAY));
  const sortedGaps = gaps.slice().sort((a, b) => a - b);
  const gap = sortedGaps[Math.floor(sortedGaps.length / 2)];
  const amounts = checks.map((c) => c.amount).sort((a, b) => a - b);
  const perCheck = Math.round(amounts[Math.floor(amounts.length / 2)] * 100) / 100;

  if (gap >= 6 && gap <= 8) return { frequency: "weekly", perCheck, checks: checks.length, confident: true };
  if (gap >= 27 && gap <= 33) return { frequency: "monthly", perCheck, checks: checks.length, confident: true };
  if (gap >= 12 && gap <= 18) {
    // Twice a month lands on the same two days every month (15th + last day, or 1st +
    // 15th, give or take a weekend); every-2-weeks drifts ~2 days a month. Month-end days
    // fold onto day 0 so "the 30th/31st" and "the 1st" read as the same payday.
    const days = checks.map((c) => { const d = Number(c.date.slice(8, 10)); return d >= 27 ? 0 : d; });
    const early = days.filter((d) => d < 10), late = days.filter((d) => d >= 10);
    const tight = (xs: number[]) => xs.length === 0 || Math.max(...xs) - Math.min(...xs) <= 4;
    const steadyDays = tight(early) && tight(late);
    // Telling them apart needs ~4 paychecks (2 months); fewer fits both.
    const confident = checks.length >= 4;
    return { frequency: steadyDays ? "semimonthly" : "biweekly", perCheck, checks: checks.length, confident };
  }
  return null;
}
