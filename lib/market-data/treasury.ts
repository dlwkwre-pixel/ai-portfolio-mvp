import { kvGet, kvSet } from "@/lib/kv";

// 13-week (3-month) Treasury bill yield, coupon-equivalent — the benchmark for "what safe
// cash can earn right now" (high-yield savings and money-market rates track it closely).
// Source: Treasury's free daily bill-rate CSV, no key. Cached 12h; null if unavailable.

export type CashBenchmark = { ratePct: number; asOf: string };

const CACHE_KEY = "treasury:tbill13w";

export async function getCashBenchmark(): Promise<CashBenchmark | null> {
  const cached = await kvGet<CashBenchmark & { fetchedAt: number }>(CACHE_KEY);
  if (cached && Date.now() - cached.fetchedAt < 12 * 3_600_000) return { ratePct: cached.ratePct, asOf: cached.asOf };

  for (const year of [new Date().getUTCFullYear(), new Date().getUTCFullYear() - 1]) {
    try {
      const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_bill_rates&field_tdr_date_value=${year}&page&_format=csv`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
      if (!res.ok) continue;
      const lines = (await res.text()).trim().split(/\r?\n/);
      if (lines.length < 2) continue;
      const header = lines[0].split(",").map((h) => h.replace(/"/g, "").trim().toUpperCase());
      const col = header.indexOf("13 WEEKS COUPON EQUIVALENT");
      if (col < 0) continue;
      const row = lines[1].split(","); // newest first
      const rate = Number(row[col]);
      if (!Number.isFinite(rate) || rate <= 0) continue;
      const [m, d, y] = row[0].split("/");
      const result = { ratePct: rate, asOf: `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` };
      await kvSet(CACHE_KEY, { ...result, fetchedAt: Date.now() }, 7 * 86_400_000);
      return result;
    } catch {
      // try the previous year (early January), then give up
    }
  }
  return cached ? { ratePct: cached.ratePct, asOf: cached.asOf } : null;
}
