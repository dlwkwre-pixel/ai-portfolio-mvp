import { merchantKey, type CashFlowTransaction } from "./transactions";
import { getCategoryForExpense } from "./expense-categories";

// Charges worth a second look, from the last 30 days of spending:
//  - duplicate: same merchant and same amount within 3 days (double-billed, or charged twice)
//  - spike:     far above what this merchant usually charges you
//  - new_big:   a large first-ever charge from a merchant
// Pure and deterministic; the caller filters out alerts the user already marked "looks fine".

export type UnusualKind = "duplicate" | "spike" | "new_big";

export type UnusualCharge = {
  id: string;                  // stable alert id (kind + transaction id) used for dismissal
  kind: UnusualKind;
  txn: CashFlowTransaction;
  detail: string;              // plain-language reason
  usual?: number;              // the merchant's usual charge (spike)
  otherDate?: string;          // the matching charge's date (duplicate)
};

const DAY = 86_400_000;
const median = (xs: number[]) => {
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function findUnusualCharges(txns: CashFlowTransaction[], today: Date): UnusualCharge[] {
  const since = new Date(today.getTime() - 30 * DAY).toISOString().slice(0, 10);
  const spend = txns.filter((t) => t.direction === "out" && t.amount > 0 && merchantKey(t.merchant));
  const byMerchant = new Map<string, CashFlowTransaction[]>();
  for (const t of spend) {
    const k = merchantKey(t.merchant);
    const list = byMerchant.get(k) ?? [];
    list.push(t);
    byMerchant.set(k, list);
  }

  const out: UnusualCharge[] = [];
  const flagged = new Set<string>();
  for (const list of byMerchant.values()) {
    list.sort((a, b) => a.txn_date.localeCompare(b.txn_date));
    const recent = list.filter((t) => t.txn_date >= since);
    // Two $6 coffees on the same day is a habit, not a double charge.
    const dupMin = getCategoryForExpense(list[0].merchant) === "Food & Dining" ? 25 : 5;

    // Duplicates: flag the later of each pair.
    for (let i = 0; i < recent.length; i++) {
      for (let j = i + 1; j < recent.length; j++) {
        const a = recent[i], b = recent[j];
        const gap = (Date.parse(b.txn_date) - Date.parse(a.txn_date)) / DAY;
        if (gap > 3) break;
        if (a.amount >= dupMin && Math.abs(a.amount - b.amount) < 0.005 && !flagged.has(b.id)) {
          flagged.add(b.id);
          out.push({ id: `duplicate:${b.id}`, kind: "duplicate", txn: b, otherDate: a.txn_date,
            detail: gap === 0 ? `Charged ${money(b.amount)} twice on the same day.` : `Same ${money(b.amount)} charge ${gap === 1 ? "a day" : `${gap} days`} after the first.` });
        }
      }
    }

    for (const t of recent) {
      if (flagged.has(t.id)) continue;
      const before = list.filter((p) => p.txn_date < t.txn_date && p.id !== t.id);
      if (before.length === 0) {
        if (t.amount >= 250) {
          flagged.add(t.id);
          out.push({ id: `new_big:${t.id}`, kind: "new_big", txn: t, detail: `First charge ever from this merchant, for ${money(t.amount)}.` });
        }
        continue;
      }
      // Spikes need a real baseline: 3+ earlier charges within the past year.
      const yearAgo = new Date(Date.parse(t.txn_date) - 365 * DAY).toISOString().slice(0, 10);
      const baseline = before.filter((p) => p.txn_date >= yearAgo).map((p) => p.amount);
      if (baseline.length < 3) continue;
      const usual = median(baseline);
      if (t.amount >= 40 && t.amount > usual * 2.5 && t.amount - usual >= 50) {
        flagged.add(t.id);
        out.push({ id: `spike:${t.id}`, kind: "spike", txn: t, usual,
          detail: `${money(t.amount)} is about ${Math.round(t.amount / usual)}× your usual ${money(usual)} here.` });
      }
    }
  }
  const rank: Record<UnusualKind, number> = { duplicate: 0, spike: 1, new_big: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || b.txn.txn_date.localeCompare(a.txn.txn_date));
}
