import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const ticker = (req.nextUrl.searchParams.get("ticker") ?? "AVGO").toUpperCase();
  const fmpKey = process.env.FMP_API_KEY ?? "(missing)";
  const finnhubKey = process.env.FINNHUB_API_KEY ?? "(missing)";

  const results: Record<string, unknown> = { ticker };

  // FMP stable
  try {
    const url = new URL("https://financialmodelingprep.com/stable/historical-price-eod/dividend-adjusted");
    url.searchParams.set("symbol", ticker);
    url.searchParams.set("apikey", fmpKey);
    const res = await fetch(url.toString(), { cache: "no-store" });
    const body = await res.json();
    const rows = Array.isArray(body) ? body : (body?.historical ?? []);
    results.fmpStable = { status: res.status, rows: rows.length, first: rows[0] ?? null };
  } catch (e) {
    results.fmpStable = { error: String(e) };
  }

  // FMP v3
  try {
    const url = new URL(`https://financialmodelingprep.com/api/v3/historical-price-full/${ticker}`);
    url.searchParams.set("apikey", fmpKey);
    const res = await fetch(url.toString(), { cache: "no-store" });
    const body = await res.json();
    const rows = Array.isArray(body) ? body : (body?.historical ?? []);
    results.fmpV3 = { status: res.status, rows: rows.length, first: rows[0] ?? null };
  } catch (e) {
    results.fmpV3 = { error: String(e) };
  }

  // Finnhub candle
  try {
    const toUnix = Math.floor(Date.now() / 1000);
    const fromUnix = toUnix - 365 * 24 * 60 * 60; // 1 year back
    const url = new URL("https://finnhub.io/api/v1/stock/candle");
    url.searchParams.set("symbol", ticker);
    url.searchParams.set("resolution", "D");
    url.searchParams.set("from", String(fromUnix));
    url.searchParams.set("to", String(toUnix));
    url.searchParams.set("token", finnhubKey);
    const res = await fetch(url.toString(), { cache: "no-store" });
    const body = await res.json();
    results.finnhubCandle = { status: res.status, s: body?.s, count: Array.isArray(body?.c) ? body.c.length : 0, first: body?.c?.[0] ?? null };
  } catch (e) {
    results.finnhubCandle = { error: String(e) };
  }

  return NextResponse.json(results);
}
