import { NextResponse } from "next/server";

// FRED MORTGAGE30US — Freddie Mac Primary Mortgage Market Survey, weekly average 30yr fixed
async function fetchMortgageRate(): Promise<number | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;

  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("series_id", "MORTGAGE30US");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", "4");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url.toString(), { next: { revalidate: 86400 }, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    const valid = (data.observations ?? []).filter(
      (o: { value: string }) => o.value !== "." && o.value !== ""
    );
    if (!valid.length) return null;
    const v = parseFloat(valid[0].value);
    return isNaN(v) ? null : v;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

export async function GET() {
  const rate = await fetchMortgageRate();
  return NextResponse.json({ rate });
}
