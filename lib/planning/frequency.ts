// Cash-flow frequencies, including bills that repeat every N months (insurance every 6,
// a tag renewal every 12, a service every 4). Pure helpers shared by client and server.
//
// Stored in cash_flow_items.frequency as: weekly | biweekly | semimonthly | monthly |
// quarterly | annual | every_{N}_months (2–24). A periodic bill also has:
//   due_anchor — any date it's due (YYYY-MM-DD); due months repeat every N from there
//   bill_mode  — "spread": plan amount/N every month (a set-aside), payment counted
//                          as amount/N so the due month doesn't spike;
//                "when_paid": $0 in other months, the full amount in the due month.

export type BillMode = "spread" | "when_paid";

const EVERY_N_RE = /^every_(\d{1,2})_months$/;

const PER_MONTH: Record<string, number> = {
  weekly: 52 / 12, biweekly: 26 / 12, semimonthly: 2, monthly: 1, quarterly: 1 / 3, annual: 1 / 12,
};

/** Months between payments for a periodic bill, else null (monthly or more often). */
export function intervalMonths(frequency: string): number | null {
  if (frequency === "quarterly") return 3;
  if (frequency === "annual") return 12;
  const m = EVERY_N_RE.exec(frequency);
  if (m) { const n = Number(m[1]); return n >= 2 && n <= 24 ? n : null; }
  return null;
}

export function frequencyForInterval(n: number): string {
  if (n <= 1) return "monthly";
  if (n === 3) return "quarterly";
  if (n === 12) return "annual";
  return `every_${Math.min(24, Math.round(n))}_months`;
}

export function isValidFrequency(frequency: string): boolean {
  return frequency in PER_MONTH || intervalMonths(frequency) !== null;
}

export function toMonthlyAmount(amount: number, frequency: string): number {
  const n = intervalMonths(frequency);
  if (n) return amount / n;
  return amount * (PER_MONTH[frequency] ?? 1);
}

export function frequencyLabel(frequency: string): string {
  const n = intervalMonths(frequency);
  if (n === 12) return "Every year";
  if (n) return `Every ${n} months`;
  return ({ weekly: "Weekly", biweekly: "Every 2 weeks", semimonthly: "Twice a month", monthly: "Monthly" } as Record<string, string>)[frequency] ?? "Monthly";
}

export function frequencySuffix(frequency: string): string {
  const n = intervalMonths(frequency);
  if (n === 12) return "yr";
  if (n === 3) return "qtr";
  if (n) return `${n}mo`;
  return ({ weekly: "wk", biweekly: "2wk", semimonthly: "½mo", monthly: "mo" } as Record<string, string>)[frequency] ?? "mo";
}

type ScheduledItem = { amount: number; frequency: string; due_anchor?: string | null; bill_mode?: string | null };

function anchorPeriod(anchor: string | null | undefined): number | null {
  if (!anchor || !/^\d{4}-\d{2}/.test(anchor)) return null;
  return Number(anchor.slice(0, 4)) * 12 + (Number(anchor.slice(5, 7)) - 1);
}

/** Months since the last due month (0 = due this month), or null without an anchor. */
export function monthsSinceDue(item: ScheduledItem, year: number, month: number): number | null {
  const n = intervalMonths(item.frequency);
  const a = anchorPeriod(item.due_anchor);
  if (!n || a === null) return null;
  const diff = year * 12 + (month - 1) - a;
  return ((diff % n) + n) % n;
}

/** The next due month on or after (year, month), as { year, month }, or null. */
export function nextDueMonth(item: ScheduledItem, year: number, month: number): { year: number; month: number } | null {
  const n = intervalMonths(item.frequency);
  const since = monthsSinceDue(item, year, month);
  if (!n || since === null) return null;
  const p = year * 12 + (month - 1) + (since === 0 ? 0 : n - since);
  return { year: Math.floor(p / 12), month: (p % 12) + 1 };
}

export type BillMonth = {
  plan: number;              // what this line contributes to the month's budget
  assumed: number;           // counted when nothing is recorded for the month
  askForPayment: boolean;    // show it in "Planned, not recorded yet"
  paymentAmount: number;     // the amount to suggest when it is asked for
  countActual: (actual: number) => number; // how a recorded payment counts toward the month
  periodic: boolean;
  due: boolean | null;
};

/**
 * How one budget line behaves in one month. `entry` is the budget-history row in effect
 * that month (amount + its own frequency) — months before a schedule change keep the
 * plan they had, instead of being reinterpreted with the new frequency.
 */
export function billPlanForMonth(
  item: ScheduledItem,
  entry: { amount: number; frequency: string } | null,
  year: number,
  month: number,
): BillMonth {
  const amount = entry?.amount ?? item.amount;
  const frequency = entry?.frequency && entry.frequency !== item.frequency ? entry.frequency : item.frequency;
  const n = intervalMonths(frequency);
  if (!n || frequency !== item.frequency) {
    const plan = toMonthlyAmount(amount, frequency);
    return { plan, assumed: plan, askForPayment: true, paymentAmount: plan, countActual: (a) => a, periodic: false, due: null };
  }
  const since = monthsSinceDue(item, year, month);
  const due = since === null ? null : since === 0;
  if (item.bill_mode === "when_paid" && due !== null) {
    const plan = due ? amount : 0;
    return { plan, assumed: plan, askForPayment: due, paymentAmount: amount, countActual: (a) => a, periodic: true, due };
  }
  // spread (default, and the fallback when no due date is set)
  const perMonth = amount / n;
  return { plan: perMonth, assumed: perMonth, askForPayment: due === true, paymentAmount: amount, countActual: (a) => a / n, periodic: true, due };
}
