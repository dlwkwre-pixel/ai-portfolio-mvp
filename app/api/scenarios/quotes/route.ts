import { NextRequest, NextResponse } from "next/server";
import { getFinnhubQuote } from "@/lib/market-data/finnhub";

export type ScenarioQuote = {
  ticker: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
};

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("tickers") ?? "";
  const tickers = raw
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 20);

  if (!tickers.length) return NextResponse.json([]);

  const results: ScenarioQuote[] = [];

  for (let i = 0; i < tickers.length; i += 3) {
    const batch = tickers.slice(i, i + 3);
    const batchResults = await Promise.all(
      batch.map(async (ticker) => {
        const q = await getFinnhubQuote(ticker);
        return {
          ticker,
          price: q?.c ?? null,
          change: q?.d ?? null,
          changePct: q?.dp ?? null,
        };
      })
    );
    results.push(...batchResults);
    if (i + 3 < tickers.length) await sleep(1200);
  }

  return NextResponse.json(results, {
    headers: { "Cache-Control": "no-store" },
  });
}
