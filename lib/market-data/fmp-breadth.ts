// FMP market breadth — NYSE + NASDAQ advances/declines
// Used as an equity breadth signal in the Market Regime engine.
// Returns null gracefully if FMP_API_KEY is unset or request fails.

export type MarketBreadthData = {
  advancing: number;
  declining: number;
  unchanged: number;
  ratio: number; // advancing / (advancing + declining), 0-1
};

type FmpBreadthRow = {
  advancing?: number;
  declining?: number;
  unchanged?: number;
  exchange?: string;
};

function getApiKey(): string | null {
  return process.env.FMP_API_KEY ?? null;
}

export async function getFmpMarketBreadth(): Promise<MarketBreadthData | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const url = new URL("https://financialmodelingprep.com/api/v3/market-breadth");
  url.searchParams.set("apikey", apiKey);

  try {
    const res = await fetch(url.toString(), {
      next: { revalidate: 3600 }, // 1-hour cache — breadth changes intraday
    });
    if (!res.ok) return null;

    const data = await res.json();
    const rows: FmpBreadthRow[] = Array.isArray(data) ? data : [];

    // Aggregate NYSE + NASDAQ (ignore AMEX — thin volume)
    let advancing = 0;
    let declining = 0;
    let unchanged = 0;

    for (const row of rows) {
      const ex = (row.exchange ?? "").toUpperCase();
      if (ex === "NYSE" || ex === "NASDAQ") {
        advancing += Number(row.advancing ?? 0);
        declining += Number(row.declining ?? 0);
        unchanged += Number(row.unchanged ?? 0);
      }
    }

    if (advancing + declining === 0) return null;

    return {
      advancing,
      declining,
      unchanged,
      ratio: advancing / (advancing + declining),
    };
  } catch {
    return null;
  }
}
