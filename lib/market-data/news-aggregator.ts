// Aggregates news from multiple free sources:
//   1. Finnhub general news        — always active (FINNHUB_API_KEY)
//   2. Alpha Vantage NEWS_SENTIMENT — active if ALPHA_VANTAGE_API_KEY set
//   3. NewsAPI.org top headlines   — active if NEWS_API_KEY set (free at newsapi.org)

import { getAlphaVantageNews } from "./alpha-vantage";

export type AggregatedNewsItem = {
  headline: string;
  summary:  string;
  source:   string;
  datetime: number; // unix seconds
  url:      string;
};

// ── Per-source fetchers ────────────────────────────────────────────────────────

async function fetchFinnhubItems(limit = 50): Promise<AggregatedNewsItem[]> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/news?category=general&minId=0&token=${key}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return [];
    const items = await res.json() as {
      headline: string; summary?: string; source?: string; datetime: number; url?: string;
    }[];
    return items
      .sort((a, b) => b.datetime - a.datetime)
      .slice(0, limit)
      .map((n) => ({
        headline: n.headline,
        summary:  n.summary  ?? "",
        source:   n.source   ?? "Finnhub",
        datetime: n.datetime,
        url:      n.url      ?? "",
      }));
  } catch {
    return [];
  }
}

async function fetchAlphaVantageItems(limit = 50): Promise<AggregatedNewsItem[]> {
  const items = await getAlphaVantageNews(limit);
  return items.map((n) => {
    // time_published: "20231201T120000" → unix seconds
    const tp = n.time_published ?? "";
    let dt = 0;
    try {
      const iso = `${tp.slice(0,4)}-${tp.slice(4,6)}-${tp.slice(6,8)}T${tp.slice(9,11)}:${tp.slice(11,13)}:00Z`;
      dt = Math.floor(new Date(iso).getTime() / 1000);
    } catch { /* ignore */ }
    return {
      headline: n.title,
      summary:  n.summary ?? "",
      source:   n.source  ?? "Alpha Vantage",
      datetime: dt,
      url:      n.url ?? "",
    };
  });
}

async function fetchNewsApiItems(limit = 40): Promise<AggregatedNewsItem[]> {
  const key = process.env.NEWS_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(
      `https://newsapi.org/v2/top-headlines?category=business&language=en&pageSize=${limit}&apiKey=${key}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return [];
    const data = await res.json() as {
      articles?: {
        title: string;
        description?: string;
        source?: { name: string };
        publishedAt?: string;
        url?: string;
      }[];
    };
    return (data.articles ?? []).map((a) => ({
      headline: a.title,
      summary:  a.description ?? "",
      source:   a.source?.name ?? "NewsAPI",
      datetime: a.publishedAt ? Math.floor(new Date(a.publishedAt).getTime() / 1000) : 0,
      url:      a.url ?? "",
    }));
  } catch {
    return [];
  }
}

// ── Deduplication ─────────────────────────────────────────────────────────────

function dedupeItems(items: AggregatedNewsItem[]): AggregatedNewsItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.headline.toLowerCase().slice(0, 60);
    if (seen.has(key) || item.headline.length < 10) return false;
    seen.add(key);
    return true;
  });
}

// ── Public exports ────────────────────────────────────────────────────────────

/** Full news items with metadata — used by signals route for keyword matching */
export async function fetchAggregatedNewsItems(maxPerSource = 50): Promise<AggregatedNewsItem[]> {
  const [finnhub, av, newsApi] = await Promise.allSettled([
    fetchFinnhubItems(maxPerSource),
    fetchAlphaVantageItems(50),
    fetchNewsApiItems(40),
  ]);

  const all: AggregatedNewsItem[] = [
    ...(finnhub.status  === "fulfilled" ? finnhub.value  : []),
    ...(av.status       === "fulfilled" ? av.value       : []),
    ...(newsApi.status  === "fulfilled" ? newsApi.value  : []),
  ];

  return dedupeItems(all).sort((a, b) => b.datetime - a.datetime);
}

/** Headline strings only — used by the LLM prompt in the scenario cron */
export async function fetchAggregatedHeadlines(maxPerSource = 40): Promise<string[]> {
  const items = await fetchAggregatedNewsItems(maxPerSource);
  return items.map((n) => n.source ? `[${n.source}] ${n.headline}` : n.headline);
}
