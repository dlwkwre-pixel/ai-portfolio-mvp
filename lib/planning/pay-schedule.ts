import { looksLikePayroll, type CashFlowTransaction } from "./transactions";

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

export type DetectedSchedule = { frequency: "weekly" | "biweekly" | "semimonthly" | "monthly"; perCheck: number; checks: number };

const DAY = 86_400_000;

// Needs 2+ paychecks for the source in the last ~120 days. Uses the typical gap between
// them: ~7d weekly, ~14d biweekly, ~15d on 1st/15th-style dates semimonthly, ~30d monthly.
export function detectPayFrequency(txns: CashFlowTransaction[], sourceId: string, today: Date): DetectedSchedule | null {
  const since = new Date(today.getTime() - 120 * DAY).toISOString().slice(0, 10);
  const checks = txns
    .filter((t) => t.direction === "in" && t.cash_flow_item_id === sourceId && t.txn_date >= since && t.amount > 0)
    .sort((a, b) => a.txn_date.localeCompare(b.txn_date));
  if (checks.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < checks.length; i++) {
    const g = Math.round((Date.parse(checks[i].txn_date) - Date.parse(checks[i - 1].txn_date)) / DAY);
    if (g >= 3) gaps.push(g); // same-week split deposits aren't a schedule
  }
  if (gaps.length === 0) return null;
  const sortedGaps = gaps.slice().sort((a, b) => a - b);
  const gap = sortedGaps[Math.floor(sortedGaps.length / 2)];
  const amounts = checks.map((c) => c.amount).sort((a, b) => a - b);
  const perCheck = Math.round(amounts[Math.floor(amounts.length / 2)] * 100) / 100;

  let frequency: DetectedSchedule["frequency"] | null = null;
  if (gap >= 6 && gap <= 8) frequency = "weekly";
  else if (gap >= 13 && gap <= 15) {
    // 14-day gaps that always land near the same two dates read as twice-a-month pay
    const days = checks.map((c) => Number(c.txn_date.slice(8, 10)));
    const semimonthlyLike = days.every((d) => d <= 2 || (d >= 14 && d <= 16) || d >= 28);
    frequency = semimonthlyLike && gap === 15 ? "semimonthly" : "biweekly";
  } else if (gap >= 16 && gap <= 17) frequency = "semimonthly";
  else if (gap >= 27 && gap <= 33) frequency = "monthly";
  return frequency ? { frequency, perCheck, checks: checks.length } : null;
}
