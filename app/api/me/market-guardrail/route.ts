import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFinnhubQuote } from "@/lib/market-data/finnhub";

export const dynamic = "force-dynamic";

// Threshold for a "rough day" worth a calm pre-action nudge. S&P moves of this
// size happen only a handful of times a year — exactly when people panic-sell.
const TRIGGER_PCT = -2;

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ triggered: false });

  // ?preview=1 forces the nudge regardless of the market — so the feature can be
  // verified on a calm day. Still pulls the user's real theses.
  const preview = new URL(request.url).searchParams.get("preview") === "1";

  // Market move today (SPY day change %). Cached upstream (60s revalidate).
  let dropPct = 0;
  try {
    const q = await getFinnhubQuote("SPY");
    if (q && typeof q.dp === "number") dropPct = q.dp;
  } catch { /* ignore */ }

  if (!preview && dropPct > TRIGGER_PCT) return NextResponse.json({ triggered: false, dropPct });
  if (preview && dropPct > TRIGGER_PCT) dropPct = -2.4; // synthetic for the demo

  // Only nudge people who actually hold something.
  const { data: ports } = await supabase
    .from("portfolios").select("id").eq("user_id", user.id).eq("is_active", true);
  const portIds = (ports ?? []).map((p) => p.id);
  if (!preview && portIds.length === 0) return NextResponse.json({ triggered: false, dropPct });

  const { count: holdingsCount } = await supabase
    .from("holdings").select("id", { count: "exact", head: true })
    .in("portfolio_id", portIds.length ? portIds : ["__none__"]);
  if (!preview && (!holdingsCount || holdingsCount === 0)) return NextResponse.json({ triggered: false, dropPct });

  // The user's own buy/add theses — reflect their reasoning back to them.
  const { data: journalRows } = await supabase
    .from("decision_journal")
    .select("ticker, thesis, action, created_at")
    .eq("user_id", user.id).in("action", ["buy", "add"])
    .order("created_at", { ascending: false }).limit(20)
    .then((r) => r, () => ({ data: null }));

  const seen = new Set<string>();
  const theses: { ticker: string; thesis: string }[] = [];
  for (const row of journalRows ?? []) {
    const t = (row.ticker ?? "").toUpperCase();
    const thesis = String(row.thesis ?? "").trim();
    if (!t || !thesis || seen.has(t)) continue;
    seen.add(t);
    theses.push({ ticker: t, thesis: thesis.length > 220 ? thesis.slice(0, 217) + "…" : thesis });
    if (theses.length >= 3) break;
  }

  return NextResponse.json({
    triggered: true,
    dropPct: Math.round(dropPct * 100) / 100,
    severity: dropPct <= -3 ? "severe" : "notable",
    theses,
    holdingsCount,
  });
}
