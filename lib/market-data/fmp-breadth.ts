// FMP market breadth — sector-performance breadth proxy (free tier)
// Uses /api/v3/sector-performance: counts sectors with positive daily change as "advancing".
// The /api/v3/market-breadth endpoint is premium-only; sector-performance is free.
// Returns null gracefully if FMP_API_KEY is unset or request fails.

export type MarketBreadthData = {
  advancing: number;
  declining: number;
  unchanged: number;
  ratio: number; // advancing / total sectors, 0-1
};

type FmpSectorRow = {
  sector?: string;
  changesPercentage?: string | number;
};

function getApiKey(): string | null {
  return process.env.FMP_API_KEY ?? null;
}

export async function getFmpMarketBreadth(): Promise<MarketBreadthData | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const url = new URL("https://financialmodelingprep.com/api/v3/sector-performance");
  url.searchParams.set("apikey", apiKey);

  try {
    const res = await fetch(url.toString(), {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const rows: FmpSectorRow[] = Array.isArray(data) ? data : [];
    if (rows.length === 0) return null;

    let advancing = 0;
    let declining = 0;
    let unchanged = 0;

    for (const row of rows) {
      const pct = parseFloat(String(row.changesPercentage ?? "0").replace("%", ""));
      if (isNaN(pct)) continue;
      if (pct > 0) advancing++;
      else if (pct < 0) declining++;
      else unchanged++;
    }

    const total = rows.length;
    if (total === 0) return null;

    return {
      advancing,
      declining,
      unchanged,
      ratio: advancing / total,
    };
  } catch {
    return null;
  }
}
