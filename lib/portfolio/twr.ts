// Time-weighted return (TWR) — deposit-neutral, the same "net return" the
// charts show. Cash deposits/withdrawals are removed so adding money never
// looks like a gain. Mirrors the logic in app/portfolios/[id]/actions.ts.

export type TwrSnapshot = { snapshot_date: string; total_value: number };
export type TwrCashFlow = { effective_at: string; direction: string | null; amount: number | string };

const toDateKey = (d: string) => new Date(d).toISOString().slice(0, 10);

/**
 * TWR across the given (chronologically ascending) snapshots, netting out
 * cash flows that land between each pair. Returns a percentage, or null if
 * fewer than 2 snapshots.
 */
export function calculateTwr(snapshots: TwrSnapshot[], cashFlows: TwrCashFlow[]): number | null {
  if (snapshots.length < 2) return null;
  const flowByDate = new Map<string, number>();
  for (const cf of cashFlows) {
    const date = toDateKey(cf.effective_at);
    const signed = ((cf.direction || "").toUpperCase() === "OUT" ? -1 : 1) * Number(cf.amount ?? 0);
    flowByDate.set(date, (flowByDate.get(date) ?? 0) + signed);
  }
  let twr = 1;
  for (let i = 1; i < snapshots.length; i++) {
    const prevDate = toDateKey(snapshots[i - 1].snapshot_date);
    const currDate = toDateKey(snapshots[i].snapshot_date);
    let cf = 0;
    for (const [d, v] of flowByDate) { if (d > prevDate && d <= currDate) cf += v; }
    const denom = snapshots[i - 1].total_value + cf * 0.5;
    if (denom <= 0) continue;
    twr *= 1 + (snapshots[i].total_value - snapshots[i - 1].total_value - cf) / denom;
  }
  return (twr - 1) * 100;
}
