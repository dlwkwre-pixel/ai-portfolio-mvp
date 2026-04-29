import { NextResponse } from "next/server";

const RIBBON_TICKERS = [
  "NVDA", "AAPL", "MSFT", "TSLA", "SPY",
  "AMZN", "GOOGL", "META", "NFLX", "AMD",
  "QQQ", "AVGO",
];

type QuoteResult = {
  ticker: string;
  price: number;
  change: number;
  changePct: number;
  isUp: boolean;
};

async function fetchQuote(ticker: string, apiKey: string): Promise<QuoteResult | null> {
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`;
    const res = await fetch(url, {
      next: { revalidate: 60 }, // server-side cache 60s
    });
    if (!res.ok) return null;

    const data = await res.json();
    const price = data.c ?? data.pc;
    if (!price || price <= 0) return null;

    const change = data.d ?? 0;
    const changePct = data.dp ?? 0;

    return {
      ticker,
      price: Number(price.toFixed(2)),
      change: Number(change.toFixed(2)),
      changePct: Number(changePct.toFixed(2)),
      isUp: change >= 0,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 500 });
  }

  // Fetch in batches of 4 with 1s between to stay under rate limit
  const results: QuoteResult[] = [];
  const BATCH_SIZE = 4;

  for (let i = 0; i < RIBBON_TICKERS.length; i += BATCH_SIZE) {
    const batch = RIBBON_TICKERS.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((ticker) => fetchQuote(ticker, apiKey))
    );
    results.push(...batchResults.filter((r): r is QuoteResult => r !== null));

    if (i + BATCH_SIZE < RIBBON_TICKERS.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return NextResponse.json(
    { quotes: results, updatedAt: new Date().toISOString() },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
      },
    }
  );
}
