// "Available to Invest" — how much of the user's current cash is actually free to
// move into investments right now, given bills that are known to be coming due but
// haven't been paid yet. Built for users who can't (or don't want to) connect a
// bank via Plaid: it works entirely off recurring cash_flow_items the user already
// enters, with no live balance sync required.
//
// The core trick: last_paid_for_date stores the SPECIFIC due-date occurrence that
// was satisfied (e.g. "2026-08-03"), not the day the user clicked "Mark Paid". That
// makes "is this currently owed" a plain date-equality check against the next
// occurrence, rather than fuzzy day-count/lookahead heuristics — which matters
// because a bill like a credit card that's already accruing charges toward its next
// due date should count as owed continuously, not just in the final days before it's
// due, while a bill that was just paid should stop counting until its next cycle.

import type { CashFlowItem } from "@/app/planning/planning-actions";

// ── Local calendar-day helpers ──────────────────────────────────────────────
// Deliberately NOT toISOString().split("T")[0] — that shifts a day for users west
// of UTC when evaluated with a server-side Date. Due-day tracking is pure
// calendar-day logic, so every date here is built/read from local y/m/d parts.

export function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromDateOnly(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

// Clamps a target day-of-month into a real date (due_day=31 lands on the last real
// day of a shorter month) instead of that occurrence silently not existing.
function occurrenceInMonth(day: number, year: number, month1to12: number): Date {
  const clamped = Math.min(day, daysInMonth(year, month1to12));
  return new Date(year, month1to12 - 1, clamped);
}

type OccurrenceItem = Pick<CashFlowItem, "frequency" | "due_day" | "due_day_2">;

// due_day_2 only ever applies to semimonthly items.
function dueDaysOf(item: OccurrenceItem): number[] {
  const days: number[] = [];
  if (item.due_day != null) days.push(item.due_day);
  if (item.frequency === "semimonthly" && item.due_day_2 != null) days.push(item.due_day_2);
  return days;
}

// Weekly/biweekly/quarterly/annual due-days don't map cleanly onto a day-of-month
// occurrence model — out of scope for owed-tracking (still fine for the calendar).
function inScope(item: OccurrenceItem): boolean {
  return item.frequency === "monthly" || item.frequency === "semimonthly";
}

// Next real occurrence on or after referenceDate. An occurrence is always found
// by checking this month and next month.
export function nextOccurrenceOnOrAfter(item: OccurrenceItem, referenceDate: Date): Date | null {
  if (!inScope(item)) return null;
  const days = dueDaysOf(item);
  if (days.length === 0) return null;

  const ref = stripTime(referenceDate);
  const candidates: Date[] = [];
  for (const monthOffset of [0, 1]) {
    const first = new Date(ref.getFullYear(), ref.getMonth() + monthOffset, 1);
    for (const day of days) candidates.push(occurrenceInMonth(day, first.getFullYear(), first.getMonth() + 1));
  }
  const onOrAfter = candidates
    .filter((c) => c.getTime() >= ref.getTime())
    .sort((a, b) => a.getTime() - b.getTime());
  return onOrAfter[0] ?? null;
}

// Occurrence closest (by day distance) to clickDate — lets "Mark Paid" work whether
// clicked a few days early, exactly on the due date, or a few days late.
export function closestOccurrenceTo(item: OccurrenceItem, clickDate: Date): Date | null {
  if (!inScope(item)) return null;
  const days = dueDaysOf(item);
  if (days.length === 0) return null;

  const click = stripTime(clickDate);
  const candidates: Date[] = [];
  for (const monthOffset of [-1, 0, 1]) {
    const first = new Date(click.getFullYear(), click.getMonth() + monthOffset, 1);
    for (const day of days) candidates.push(occurrenceInMonth(day, first.getFullYear(), first.getMonth() + 1));
  }
  candidates.sort((a, b) => Math.abs(a.getTime() - click.getTime()) - Math.abs(b.getTime() - click.getTime()));
  return candidates[0] ?? null;
}

// true unless last_paid_for_date matches the current/next occurrence exactly.
// Only expense items with a due date in scope can ever be "owed" — income items
// are never subtracted (once liquidAssets is updated after a paycheck lands, that
// money is already reflected, so there's nothing to forecast for income).
export function isItemOwed(item: CashFlowItem, today: Date): boolean {
  if (item.type !== "expense") return false;
  if (!inScope(item)) return false;
  if (item.due_day == null && item.due_day_2 == null) return false;

  const nextDue = nextOccurrenceOnOrAfter(item, today);
  if (!nextDue) return false;
  if (!item.last_paid_for_date) return true;
  return toDateOnly(nextDue) !== item.last_paid_for_date;
}

export type OwedItem = { item: CashFlowItem; dueDate: Date };

export type AvailableToInvestOptions = {
  // Caller precomputes emergencyFundMonths * expenseBasis — keeps this module free
  // of profile-shape knowledge. Omitted/0 = no emergency-fund awareness at all.
  emergencyFundTarget?: number;
  // 0-100: while the emergency fund is below target, this % of free cash counts as
  // available to invest right now; the rest is earmarked toward the fund. Once the
  // fund is fully funded, 100% of the surplus above the target is available
  // regardless of this setting. Default 100 preserves the pre-EF-aware behavior.
  surplusToInvestPct?: number;
};

export function computeAvailableToInvest(
  items: CashFlowItem[],
  liquidAssets: number,
  today: Date = new Date(),
  options: AvailableToInvestOptions = {}
): {
  availableToInvest: number;
  owedItems: OwedItem[];
  owedTotal: number;
  freeCash: number;
  emergencyFundTarget: number;
  emergencyFundFunded: boolean;
  reservedForEmergencyFund: number;
} {
  const owedItems: OwedItem[] = [];
  for (const item of items) {
    if (!isItemOwed(item, today)) continue;
    const dueDate = nextOccurrenceOnOrAfter(item, today);
    if (!dueDate) continue;
    // Subtract the raw per-occurrence amount — NOT toMonthly(item.amount, item.frequency).
    // toMonthly doubles semimonthly amounts to represent a full month of totals;
    // using that here would overstate what a single occurrence actually owes by 2x.
    owedItems.push({ item, dueDate });
  }
  const owedTotal = owedItems.reduce((sum, o) => sum + o.item.amount, 0);
  const freeCash = liquidAssets - owedTotal;

  const emergencyFundTarget = Math.max(0, options.emergencyFundTarget ?? 0);
  const surplusToInvestPct = Math.min(100, Math.max(0, options.surplusToInvestPct ?? 100));
  const emergencyFundFunded = emergencyFundTarget <= 0 ? true : freeCash >= emergencyFundTarget;

  let availableToInvest: number;
  let reservedForEmergencyFund: number;
  if (freeCash <= 0) {
    // No surplus to split at all — don't manufacture a confusing negative
    // "reserved" figure alongside an already-negative available-to-invest.
    availableToInvest = freeCash;
    reservedForEmergencyFund = 0;
  } else if (emergencyFundTarget <= 0 || emergencyFundFunded) {
    availableToInvest = freeCash - emergencyFundTarget;
    reservedForEmergencyFund = Math.min(freeCash, emergencyFundTarget);
  } else {
    availableToInvest = freeCash * (surplusToInvestPct / 100);
    reservedForEmergencyFund = freeCash - availableToInvest;
  }

  return {
    availableToInvest, owedItems, owedTotal, freeCash,
    emergencyFundTarget, emergencyFundFunded, reservedForEmergencyFund,
  };
}
