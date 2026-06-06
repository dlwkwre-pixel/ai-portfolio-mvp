// Aggregates news from multiple free sources:
//   1. Finnhub general news       — always active (FINNHUB_API_KEY)
//   2. Alpha Vantage NEWS_SENTIMENT — active if ALPHA_VANTAGE_API_KEY set
//   3. NewsAPI.org top headlines  — active if NEWS_API_KEY set (free at newsapi.org)
//
// Returns deduped headline strings ready to paste into an LLM prompt.

import { getAlphaVantageNews } from "./alpha-vantage";

type HeadlineItem = { title: string; source?: string };

async function fetchFinnhubGeneral(limit = 40): Promise<HeadlineItem[]> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/news?category=general&minId=0&token=${key}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return [];
    const items = await res.json() as { headline: string; source?: string; datetime: number }[];
    return items
      .sort((a, b) => b.datetime - a.datetime)
      .slice(0, limit)
      .map((n) => ({ title: n.headline, source: n.source }));
  } catch {
    return [];
  }
}

async function fetchAlphaVantageHeadlines(limit = 50): Promise<HeadlineItem[]> {
  const items = await getAlphaVantageNews(limit);
  return items.map((n) => ({ title: n.title, source: n.source }));
}

async function fetchNewsApi(limit = 40): Promise<HeadlineItem[]> {
  const key = process.env.NEWS_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(
      `https://newsapi.org/v2/top-headlines?category=business&language=en&pageSize=${limit}&apiKey=${key}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return [];
    const data = await res.json() as { articles?: { title: string; source?: { name: string } }[] };
    return (data.articles ?? []).map((a) => ({ title: a.title, source: a.source?.name }));
  } catch {
    return [];
  }
}

function dedupe(items: HeadlineItem[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.title.toLowerCase().slice(0, 60);
    if (!seen.has(key) && item.title.length > 10) {
      seen.add(key);
      const label = item.source ? `[${item.source}] ${item.title}` : item.title;
      out.push(label);
    }
  }
  return out;
}

export async function fetchAggregatedHeadlines(maxPerSource = 40): Promise<string[]> {
  const [finnhub, alphaVantage, newsApi] = await Promise.allSettled([
    fetchFinnhubGeneral(maxPerSource),
    fetchAlphaVantageHeadlines(50),
    fetchNewsApi(maxPerSource),
  ]);

  const all: HeadlineItem[] = [
    ...(finnhub.status    === "fulfilled" ? finnhub.value    : []),
    ...(alphaVantage.status === "fulfilled" ? alphaVantage.value : []),
    ...(newsApi.status    === "fulfilled" ? newsApi.value    : []),
  ];

  return dedupe(all);
}
