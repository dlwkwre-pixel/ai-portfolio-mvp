import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFinnhubNews, getFinnhubQuote } from "@/lib/market-data/finnhub";
import { callGemini, extractJsonObject } from "@/lib/ai/gemini";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Passive re-evaluation of AI Radar items between paid Grok runs. NEVER calls paid
// Grok on a schedule and NEVER creates a buy/sell recommendation itself — it only
// flips radar_status (active → ready/invalidated) and nudges the user toward running
// a real analysis. Mechanical price/date checks are free; only catalyst/combo
// triggers (or a stale mechanical trigger past the recheck window) spend a free-tier
// Gemini/Groq call.

const BATCH_SIZE = 3;
const BATCH_DELAY_MS = 2000;
const AI_RECHECK_DAYS = 5;

type RadarCondition = {
  trigger: "price_below" | "price_above" | "date_after" | "catalyst" | "combo";
  price: number | null;
  date: string | null;
  catalyst_description: string | null;
  original_note: string | null;
};

type RadarItem = {
  id: string;
  portfolio_id: string;
  ticker: string;
  radar_type: string;
  radar_condition: RadarCondition | null;
  last_evaluated_at: string | null;
  eval_count: number | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The mechanical (free) half of a condition — price/date only. "combo" requires
// this AND a catalyst check; the price component of combo uses "at or below"
// semantics since re-entry watches are predominantly waiting on a pullback.
function mechanicalGateMet(condition: RadarCondition, currentPrice: number | null): boolean {
  const today = new Date().toISOString().slice(0, 10);
  switch (condition.trigger) {
    case "price_below":
      return condition.price != null && currentPrice != null && currentPrice <= condition.price;
    case "price_above":
      return condition.price != null && currentPrice != null && currentPrice >= condition.price;
    case "date_after":
      return condition.date != null && today >= condition.date;
    case "combo": {
      const priceOk = condition.price == null || (currentPrice != null && currentPrice <= condition.price);
      const dateOk = condition.date == null || today >= condition.date;
      return priceOk && dateOk;
    }
    default:
      return false;
  }
}

async function checkCatalystWithAI(
  item: RadarItem,
  currentPrice: number | null,
): Promise<{ condition_likely_met: boolean; thesis_intact: boolean; note: string } | null> {
  const news = await getFinnhubNews(item.ticker, 10).catch(() => []);
  const headlines = (news ?? []).slice(0, 10).map((n) => `- ${n.headline}`).join("\n");
  const condition = item.radar_condition;
  const conditionDesc = condition?.catalyst_description || condition?.original_note || "the tracked condition";

  const prompt = `You are checking whether a specific, pre-defined watch condition has been met for a stock on an AI-managed radar list — you are judging a fact, not giving new investment advice.

${item.ticker}${currentPrice != null ? ` — current price $${currentPrice.toFixed(2)}` : ""}
Radar type: ${item.radar_type === "re_entry" ? "re-entry watch on a position recently trimmed/sold for timing reasons" : "new candidate being watched before a first buy"}
Condition being watched for: "${conditionDesc}"
Original note when this was set: "${condition?.original_note ?? "n/a"}"

Recent headlines (last 10 days):
${headlines || "No notable headlines."}

Respond ONLY with strict JSON:
{
  "condition_likely_met": true|false,
  "thesis_intact": true|false,
  "note": "one sentence explaining the verdict"
}
"thesis_intact" = false only if something has fundamentally broken the reason this ticker was worth watching (not merely "condition not yet met"). JSON only, no markdown.`;

  const raw = await callGemini(prompt, { groqFirst: true, maxOutputTokens: 400, usageTag: "cron-radar-monitor" });
  return extractJsonObject<{ condition_likely_met: boolean; thesis_intact: boolean; note: string }>(raw);
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured." }, { status: 500 });
  }

  const { data: radarItems, error } = await supabase
    .from("recommendation_items")
    .select("id, portfolio_id, ticker, radar_type, radar_condition, last_evaluated_at, eval_count")
    .eq("radar_status", "active")
    .not("radar_type", "is", null)
    .then((r) => r, () => ({ data: null, error: { message: "radar columns missing — apply recommendation-radar-setup.sql" } }));

  if (error) return NextResponse.json({ error: error.message }, { status: 200 });
  if (!radarItems || radarItems.length === 0) {
    return NextResponse.json({ message: "No active radar items to check." });
  }

  // Global price pass — batched through Finnhub (getFmpQuotes' /v3/quote endpoint is
  // currently returning 403 "Legacy Endpoint" — FMP deprecated it; Finnhub is the
  // quote source proven working everywhere else in this app). Same batch/delay shape
  // as getTickerMarketContext.
  const tickers = [...new Set(radarItems.map((r) => (r.ticker as string).toUpperCase()))];
  const priceByTicker = new Map<string, number>();
  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const chunk = tickers.slice(i, i + BATCH_SIZE);
    await Promise.all(chunk.map(async (t) => {
      try {
        const q = await getFinnhubQuote(t);
        if (q && q.c > 0) priceByTicker.set(t, q.c);
      } catch { /* leave unset */ }
    }));
    if (i + BATCH_SIZE < tickers.length) await sleep(BATCH_DELAY_MS);
  }

  // Group by portfolio for the outer loop — never Promise.all across portfolios.
  const byPortfolio = new Map<string, RadarItem[]>();
  for (const row of radarItems as unknown as RadarItem[]) {
    const arr = byPortfolio.get(row.portfolio_id) ?? [];
    arr.push(row);
    byPortfolio.set(row.portfolio_id, arr);
  }

  const now = Date.now();
  let portfoliosChecked = 0;
  let radarItemsChecked = 0;
  let readyCount = 0;
  let invalidatedCount = 0;
  let aiCallsUsed = 0;
  const errors: string[] = [];

  for (const [portfolioId, items] of byPortfolio) {
    portfoliosChecked++;
    try {
      // Look up the portfolio owner once per portfolio for notifications.
      const { data: portfolio } = await supabase
        .from("portfolios")
        .select("user_id")
        .eq("id", portfolioId)
        .maybeSingle();
      const userId = portfolio?.user_id as string | undefined;

      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (item) => {
          radarItemsChecked++;
          try {
            const condition = item.radar_condition;
            if (!condition) return;
            const currentPrice = priceByTicker.get(item.ticker.toUpperCase()) ?? null;

            const mechanicalMet = mechanicalGateMet(condition, currentPrice);
            const isPureMechanical = condition.trigger === "price_below" || condition.trigger === "price_above" || condition.trigger === "date_after";

            // Pure mechanical trigger met → ready, zero AI cost, done.
            if (isPureMechanical && mechanicalMet) {
              await supabase.from("recommendation_items").update({
                radar_status: "ready",
                last_evaluated_at: new Date().toISOString(),
                eval_count: (item.eval_count ?? 0) + 1,
              }).eq("id", item.id);
              readyCount++;
              if (userId) {
                await supabase.from("app_notifications").insert({
                  title: `${item.ticker} radar condition met 🎯`,
                  body: `The condition BuyTune was watching for on ${item.ticker} has been met. Run AI Analysis to turn it into a real recommendation.`,
                  target_user_id: userId,
                });
              }
              return;
            }

            // Pure mechanical trigger not yet met → nothing to do, stays active
            // (no AI spend — there's no catalyst component to evaluate).
            if (isPureMechanical && !mechanicalMet) return;

            // combo: mechanical gate hasn't opened yet — skip the catalyst check,
            // no point paying for an AI call before the price/date condition exists.
            if (condition.trigger === "combo" && !mechanicalMet) return;

            // catalyst, or combo with its mechanical gate open — only worth an AI
            // call if this hasn't been checked recently (bounds free-tier usage).
            const lastEval = item.last_evaluated_at ? new Date(item.last_evaluated_at).getTime() : 0;
            const dueForRecheck = !lastEval || (now - lastEval) > AI_RECHECK_DAYS * 86400_000;
            if (!dueForRecheck) return;

            const verdict = await checkCatalystWithAI(item, currentPrice);
            aiCallsUsed++;

            if (!verdict) {
              // AI unavailable this cycle — just bump last_evaluated_at so we don't
              // hammer a down provider every run; try again next cycle.
              await supabase.from("recommendation_items").update({
                last_evaluated_at: new Date().toISOString(),
                eval_count: (item.eval_count ?? 0) + 1,
              }).eq("id", item.id);
              return;
            }

            if (verdict.thesis_intact === false) {
              await supabase.from("recommendation_items").update({
                radar_status: "invalidated",
                decision_notes: verdict.note ? `AI Radar: ${verdict.note}` : "Thesis no longer intact.",
                last_evaluated_at: new Date().toISOString(),
                eval_count: (item.eval_count ?? 0) + 1,
              }).eq("id", item.id);
              invalidatedCount++;
              return;
            }

            if (verdict.condition_likely_met) {
              await supabase.from("recommendation_items").update({
                radar_status: "ready",
                decision_notes: verdict.note ? `AI Radar: ${verdict.note}` : null,
                last_evaluated_at: new Date().toISOString(),
                eval_count: (item.eval_count ?? 0) + 1,
              }).eq("id", item.id);
              readyCount++;
              if (userId) {
                await supabase.from("app_notifications").insert({
                  title: `${item.ticker} radar condition met 🎯`,
                  body: `${verdict.note || `The condition BuyTune was watching for on ${item.ticker} has been met.`} Run AI Analysis to turn it into a real recommendation.`,
                  target_user_id: userId,
                });
              }
              return;
            }

            // Still watching — just record that we checked.
            await supabase.from("recommendation_items").update({
              last_evaluated_at: new Date().toISOString(),
              eval_count: (item.eval_count ?? 0) + 1,
            }).eq("id", item.id);
          } catch (itemErr) {
            errors.push(`${item.ticker} (${item.id}): ${itemErr instanceof Error ? itemErr.message : "unknown error"}`);
          }
        }));

        if (i + BATCH_SIZE < items.length) await sleep(BATCH_DELAY_MS);
      }
    } catch (portfolioErr) {
      errors.push(`portfolio ${portfolioId}: ${portfolioErr instanceof Error ? portfolioErr.message : "unknown error"}`);
    }
  }

  return NextResponse.json({
    portfoliosChecked,
    radarItemsChecked,
    readyCount,
    invalidatedCount,
    aiCallsUsed,
    errors,
  });
}
