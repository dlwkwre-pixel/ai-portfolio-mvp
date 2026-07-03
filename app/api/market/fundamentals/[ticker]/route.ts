import { NextRequest, NextResponse } from "next/server";

const SEC_HEADERS = {
  "User-Agent": "BuyTune/1.0 contact@buytune.io",
  Accept: "application/json",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type FactUnit = {
  val: number;
  start?: string;
  end: string;
  form: string;
  accn: string;
  fy?: number | null;
  fp?: string | null;
};

type FundamentalsResponse = {
  ticker: string;
  companyName: string | null;
  ttmRevenue: number | null;
  ttmNetIncome: number | null;
  ttmEpsDiluted: number | null;
  totalAssets: number | null;
  stockholdersEquity: number | null;
  revenueGrowthYoy: number | null;
  error?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Return the 4 most recent 10-Q entries summed for TTM. */
function ttmFromQuarterly(units: FactUnit[]): number | null {
  const quarterly = units
    .filter((u) => u.form === "10-Q")
    .sort((a, b) => b.end.localeCompare(a.end));

  // De-duplicate by accession number (avoid double-counting amendments)
  const seen = new Set<string>();
  const deduped: FactUnit[] = [];
  for (const u of quarterly) {
    if (!seen.has(u.accn)) {
      seen.add(u.accn);
      deduped.push(u);
    }
  }

  if (deduped.length < 4) return null;
  return deduped.slice(0, 4).reduce((sum, u) => sum + u.val, 0);
}

/** Return the most recent annual 10-K value. */
function latestAnnual(units: FactUnit[]): number | null {
  const annual = units
    .filter((u) => u.form === "10-K")
    .sort((a, b) => b.end.localeCompare(a.end));
  if (annual.length === 0) return null;
  return annual[0].val;
}

/** Return the most recent annual 10-K value from the prior year (for YoY growth). */
function priorAnnual(units: FactUnit[]): number | null {
  const annual = units
    .filter((u) => u.form === "10-K")
    .sort((a, b) => b.end.localeCompare(a.end));
  if (annual.length < 2) return null;
  return annual[1].val;
}

function getConceptUnits(
  facts: Record<string, unknown>,
  namespace: "us-gaap" | "dei",
  concept: string,
  unitKey: string
): FactUnit[] | null {
  try {
    const ns = facts as Record<string, Record<string, { units: Record<string, FactUnit[]> }>>;
    return ns[namespace]?.[concept]?.units?.[unitKey] ?? null;
  } catch {
    return null;
  }
}

// ─── CIK lookup cache (module-level, cleared on cold start) ───────────────────

let tickerMapCache: Record<string, { cik_str: number; ticker: string; title: string }> | null = null;
let tickerMapFetchedAt = 0;
const TICKER_MAP_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function getCik(ticker: string): Promise<{ cik: number; title: string } | null> {
  const now = Date.now();
  if (!tickerMapCache || now - tickerMapFetchedAt > TICKER_MAP_TTL_MS) {
    const res = await fetch(
      "https://www.sec.gov/files/company_tickers.json",
      { headers: SEC_HEADERS, next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const raw = (await res.json()) as Record<
      string,
      { cik_str: number; ticker: string; title: string }
    >;
    tickerMapCache = raw;
    tickerMapFetchedAt = now;
  }

  const upper = ticker.toUpperCase();
  const entry = Object.values(tickerMapCache).find(
    (e) => e.ticker.toUpperCase() === upper
  );
  if (!entry) return null;
  return { cik: entry.cik_str, title: entry.title };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const sym = ticker.toUpperCase().replace(/[^A-Z0-9.]/g, "");
  if (!sym) {
    return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  }

  const empty: FundamentalsResponse = {
    ticker: sym,
    companyName: null,
    ttmRevenue: null,
    ttmNetIncome: null,
    ttmEpsDiluted: null,
    totalAssets: null,
    stockholdersEquity: null,
    revenueGrowthYoy: null,
  };

  try {
    // 1. Resolve CIK
    const cikData = await getCik(sym);
    if (!cikData) {
      return NextResponse.json(
        { ...empty, error: "Ticker not found in SEC EDGAR" },
        { status: 404 }
      );
    }
    const paddedCik = String(cikData.cik).padStart(10, "0");

    // 2. Fetch company facts
    const factsRes = await fetch(
      `https://data.sec.gov/api/xbrl/companyfacts/CIK${paddedCik}.json`,
      { headers: SEC_HEADERS, next: { revalidate: 21600 } } // 6 hours
    );
    if (!factsRes.ok) {
      return NextResponse.json(
        { ...empty, companyName: cikData.title, error: "Company facts unavailable" },
        { status: 502 }
      );
    }

    const facts = (await factsRes.json()) as {
      cik: number;
      entityName: string;
      facts: Record<string, Record<string, { units: Record<string, FactUnit[]> }>>;
    };

    const f = facts.facts;
    const companyName = facts.entityName ?? cikData.title;

    // 3. Revenue — try three fallback concepts
    let revenueUnits: FactUnit[] | null =
      getConceptUnits(f, "us-gaap", "RevenueFromContractWithCustomerExcludingAssessedTax", "USD") ??
      getConceptUnits(f, "us-gaap", "Revenues", "USD") ??
      getConceptUnits(f, "us-gaap", "SalesRevenueNet", "USD");

    const ttmRevenue = revenueUnits ? ttmFromQuarterly(revenueUnits) : null;

    // Revenue YoY growth (annual)
    let revenueGrowthYoy: number | null = null;
    if (revenueUnits) {
      const curr = latestAnnual(revenueUnits);
      const prev = priorAnnual(revenueUnits);
      if (curr != null && prev != null && prev !== 0) {
        revenueGrowthYoy = ((curr - prev) / Math.abs(prev)) * 100;
      }
    }

    // 4. Net Income
    const netIncomeUnits = getConceptUnits(f, "us-gaap", "NetIncomeLoss", "USD");
    const ttmNetIncome = netIncomeUnits ? ttmFromQuarterly(netIncomeUnits) : null;

    // 5. EPS Diluted — use most recent annual 10-K (EPS should not be summed across quarters without context)
    const epsUnits = getConceptUnits(f, "us-gaap", "EarningsPerShareDiluted", "USD/shares");
    let ttmEpsDiluted: number | null = null;
    if (epsUnits) {
      // Prefer the most recent annual value; fall back to summing 4 quarters
      const annualEps = latestAnnual(epsUnits);
      if (annualEps != null) {
        ttmEpsDiluted = annualEps;
      } else {
        ttmEpsDiluted = ttmFromQuarterly(epsUnits);
      }
    }

    // 6. Total Assets — latest annual
    const assetsUnits = getConceptUnits(f, "us-gaap", "Assets", "USD");
    const totalAssets = assetsUnits ? latestAnnual(assetsUnits) : null;

    // 7. Stockholders Equity — latest annual
    const equityUnits =
      getConceptUnits(f, "us-gaap", "StockholdersEquity", "USD") ??
      getConceptUnits(f, "us-gaap", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", "USD");
    const stockholdersEquity = equityUnits ? latestAnnual(equityUnits) : null;

    const result: FundamentalsResponse = {
      ticker: sym,
      companyName,
      ttmRevenue,
      ttmNetIncome,
      ttmEpsDiluted,
      totalAssets,
      stockholdersEquity,
      revenueGrowthYoy,
    };

    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=21600, stale-while-revalidate=3600" },
    });
  } catch (err) {
    console.error("[fundamentals] error:", err);
    return NextResponse.json(
      { ...empty, error: "Failed to fetch fundamentals" },
      { status: 500 }
    );
  }
}
