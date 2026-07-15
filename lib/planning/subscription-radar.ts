// Subscription Radar: find recurring charges in the rolling bank-transaction store.
// Pure pattern-matching — same merchant, similar amount, regular cadence — over the
// ~120 days of history the Plaid sync maintains. No AI, no extra API calls.

export type RadarTxn = {
  date: string;              // YYYY-MM-DD
  name: string;
  merchant: string | null;
  amount: number;            // positive = money out (Plaid convention)
  category: string | null;
  pending: boolean;
};

export type DetectedSubscription = {
  merchant: string;          // display name
  cadence: "weekly" | "biweekly" | "monthly" | "quarterly";
  avgAmount: number;         // per charge
  monthlyEquivalent: number; // normalized to $/month
  count: number;             // charges observed in the window
  lastDate: string;
  lastAmount: number;
  priceIncreased: boolean;   // latest charge ≥5% above the earliest in the window
};

const SKIP_CATEGORIES = new Set(["TRANSFER_IN", "TRANSFER_OUT", "INCOME"]);

function normalizeMerchant(t: RadarTxn): string {
  const base = (t.merchant || t.name || "").toLowerCase();
  return base
    .replace(/\d{3,}/g, "")          // strip long digit runs (store numbers, refs)
    .replace(/[#*]+\S*/g, "")        // strip #REF / *codes
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
}

function classifyCadence(medianGapDays: number): DetectedSubscription["cadence"] | null {
  if (medianGapDays >= 5 && medianGapDays <= 9) return "weekly";
  if (medianGapDays >= 12 && medianGapDays <= 18) return "biweekly";
  if (medianGapDays >= 25 && medianGapDays <= 35) return "monthly";
  if (medianGapDays >= 80 && medianGapDays <= 100) return "quarterly";
  return null;
}

const MONTHLY_FACTOR: Record<DetectedSubscription["cadence"], number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
  quarterly: 1 / 3,
};

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function detectSubscriptions(txns: RadarTxn[]): DetectedSubscription[] {
  // Candidate charges: settled outflows that aren't transfers/income.
  const charges = txns.filter((t) => t.amount > 0 && !t.pending && !SKIP_CATEGORIES.has(t.category ?? ""));

  const groups = new Map<string, RadarTxn[]>();
  for (const t of charges) {
    const key = normalizeMerchant(t);
    if (key.length < 3) continue;
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }

  const out: DetectedSubscription[] = [];
  for (const [, list] of groups) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));

    // Amount consistency: keep charges within 30% of the median amount. Variable spend
    // at the same merchant (groceries, gas) fails this; true subscriptions pass.
    const med = median(sorted.map((t) => t.amount));
    const consistent = sorted.filter((t) => Math.abs(t.amount - med) <= med * 0.3);
    if (consistent.length < 2) continue;

    const gaps: number[] = [];
    for (let i = 1; i < consistent.length; i++) {
      const d = (new Date(consistent[i].date).getTime() - new Date(consistent[i - 1].date).getTime()) / 86_400_000;
      if (d > 0) gaps.push(d);
    }
    if (gaps.length === 0) continue;
    const cadence = classifyCadence(median(gaps));
    if (!cadence) continue;
    // Monthly/quarterly need at least 2 charges; faster cadences need 3 to avoid noise.
    if ((cadence === "weekly" || cadence === "biweekly") && consistent.length < 3) continue;

    const avg = consistent.reduce((s, t) => s + t.amount, 0) / consistent.length;
    const last = consistent[consistent.length - 1];
    const first = consistent[0];
    // Prefer the raw merchant casing for display.
    const display = (last.merchant || last.name).slice(0, 48);

    out.push({
      merchant: display,
      cadence,
      avgAmount: Math.round(avg * 100) / 100,
      monthlyEquivalent: Math.round(avg * MONTHLY_FACTOR[cadence] * 100) / 100,
      count: consistent.length,
      lastDate: last.date,
      lastAmount: last.amount,
      priceIncreased: last.amount >= first.amount * 1.05,
    });
  }

  return out.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent).slice(0, 20);
}
