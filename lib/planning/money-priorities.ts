// Rate-aware money decisions shared by the Balance Sheet and Cash Flow tabs:
//  - which accounts take an APY vs an APR
//  - idle cash: how much cash sits above what you need on hand, and what it could earn
//  - where a month's leftover should go first (high-interest debt → emergency fund → invest)
// Pure functions; rates are percentages (4.2 = 4.2%).

export type RateKind = "apy" | "apr";

const DEBT_CATEGORIES = new Set(["credit_card", "personal_loan", "student_loan", "auto_loan", "mortgage", "heloc", "medical_debt", "other_liability"]);

export function rateKindFor(category: string, isLiability: boolean): RateKind | null {
  if (isLiability) return "apr";
  if (category === "cash") return "apy";
  return DEBT_CATEGORIES.has(category) ? "apr" : null;
}

export type RatedAccount = { id: string; label: string; balance: number; rate: number | null; revolving?: boolean };

// Interest a debt costs per month at its APR (simple, balance × APR / 12).
export function monthlyInterest(balance: number, aprPct: number): number {
  return (balance * aprPct) / 100 / 12;
}

// ── Idle cash ───────────────────────────────────────────────────────────────

export type IdleCash = {
  total: number;          // all cash accounts
  keep: number;           // emergency fund + one month of spending
  excess: number;         // total − keep (≥ 0)
  extraPerYear: number;   // what the excess would earn at the benchmark vs where it sits now
  fromAccounts: { label: string; amount: number; rate: number | null }[]; // where the excess sits (lowest rate first)
  unratedCount: number;   // cash accounts with no APY set (assumed ~0%)
  alreadyCompetitive: boolean;
};

export function computeIdleCash(args: {
  cashAccounts: RatedAccount[];
  monthlySpend: number;
  emergencyMonths: number;
  benchmarkPct: number;
}): IdleCash | null {
  const { cashAccounts, monthlySpend, emergencyMonths, benchmarkPct } = args;
  const total = cashAccounts.reduce((s, a) => s + Math.max(0, a.balance), 0);
  if (total <= 0 || monthlySpend <= 0) return null;
  const keep = monthlySpend * (Math.max(0, emergencyMonths) + 1);
  const excess = Math.max(0, total - keep);
  // The excess is assumed to come out of the lowest-earning accounts first.
  const sorted = cashAccounts.filter((a) => a.balance > 0).slice().sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0));
  let left = excess, extraPerYear = 0;
  const fromAccounts: IdleCash["fromAccounts"] = [];
  for (const a of sorted) {
    if (left <= 0) break;
    const take = Math.min(a.balance, left);
    left -= take;
    const gain = take * Math.max(0, benchmarkPct - (a.rate ?? 0)) / 100;
    extraPerYear += gain;
    if (gain > 0) fromAccounts.push({ label: a.label, amount: take, rate: a.rate });
  }
  return {
    total, keep, excess, extraPerYear,
    fromAccounts,
    unratedCount: cashAccounts.filter((a) => a.balance > 0 && a.rate === null).length,
    alreadyCompetitive: excess > 0 && extraPerYear < 25,
  };
}

// ── Where the leftover goes ─────────────────────────────────────────────────

export type LeftoverStep = {
  kind: "debt" | "emergency" | "invest";
  label: string;
  amount: number;
  why: string;
  href: string;
};

export function planLeftover(args: {
  amount: number;
  debts: RatedAccount[];          // liabilities; rate = APR or null
  emergencyGap: number;           // how far cash is below the emergency target (0 if funded)
  highAprPct?: number;            // pay these off before investing (default 8%)
  cardSpendingCounted?: boolean;  // card purchases already count as spending (bank-linked budgets)
}): { steps: LeftoverStep[]; unratedDebts: number; middleDebts: RatedAccount[]; cards: RatedAccount[] } {
  const high = args.highAprPct ?? 8;
  let left = Math.max(0, args.amount);
  const steps: LeftoverStep[] = [];
  const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

  // 1. High-interest debt, highest APR first: a guaranteed return no investment matches.
  // A credit card's balance is mostly this month's purchases, already counted as spending —
  // paying the statement isn't new money out, so cards become a note ("if you carry a
  // balance…") rather than a step that would subtract the same spending twice.
  const isStep = (d: RatedAccount) => !(args.cardSpendingCounted && d.revolving);
  const cards = args.debts.filter((d) => !isStep(d) && d.rate !== null && d.rate >= high && d.balance > 0);
  for (const d of args.debts.filter((d) => isStep(d) && d.rate !== null && d.rate >= high && d.balance > 0).sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))) {
    if (left < 1) break;
    const pay = Math.min(left, d.balance);
    left -= pay;
    steps.push({
      kind: "debt", label: `Pay down ${d.label}`, amount: pay, href: "/planning?tab=balance",
      why: d.revolving
        ? `${d.rate}% APR. If you carry this balance month to month, paying it off is a guaranteed ${d.rate}% return (about ${money(pay * (d.rate ?? 0) / 100)} a year). If you pay it in full every month, skip this step.`
        : `${d.rate}% APR. Paying it is a guaranteed ${d.rate}% return and saves about ${money(pay * (d.rate ?? 0) / 100)} a year in interest.`,
    });
  }
  // 2. Emergency fund gap.
  if (left >= 1 && args.emergencyGap > 0) {
    const add = Math.min(left, args.emergencyGap);
    left -= add;
    steps.push({
      kind: "emergency", label: "Top up your emergency fund", amount: add, href: "/planning?tab=balance",
      why: `You're ${money(args.emergencyGap)} short of your emergency target, so this comes before investing.`,
    });
  }
  // 3. Invest the rest.
  if (left >= 1) {
    steps.push({
      kind: "invest", label: "Invest the rest", amount: left, href: "/portfolios",
      why: steps.length === 0 ? "No high-interest debt and your emergency fund is set, so this can go to your portfolios." : "Everything above is covered, so the remainder can be invested.",
    });
  }
  return {
    steps,
    cards,
    unratedDebts: args.debts.filter((d) => d.rate === null && d.balance > 0).length,
    middleDebts: args.debts.filter((d) => d.rate !== null && d.rate >= 5 && d.rate < high && d.balance > 0),
  };
}
