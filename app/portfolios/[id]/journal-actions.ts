"use server";

import { createClient } from "@/lib/supabase/server";
import { getFinnhubQuote } from "@/lib/market-data/finnhub";
import { revalidatePath } from "next/cache";
import { awardXp, dailyKey } from "@/lib/gamification/xp";

export type JournalAction = "buy" | "add" | "sell" | "trim" | "hold" | "watch";

export type JournalEntry = {
  id: string;
  portfolio_id: string | null;
  ticker: string;
  action: JournalAction;
  thesis: string;
  conviction: string | null;
  emotion: string | null;
  price_at_decision: number | null;
  created_at: string;
  reviewed_at: string | null;
  outcome_note: string | null;
  source?: string | null; // 'manual' | 'ai'
};

const ACTIONS: JournalAction[] = ["buy", "add", "sell", "trim", "hold", "watch"];
const CONVICTIONS = ["low", "medium", "high"];
const EMOTIONS = ["confident", "cautious", "fearful", "fomo", "neutral"];

// Log a decision. Snapshots the current price so we can score the call's outcome later.
export async function addJournalEntry(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const ticker = String(formData.get("ticker") || "").trim().toUpperCase().slice(0, 12);
  const action = String(formData.get("action") || "").trim().toLowerCase();
  const thesis = String(formData.get("thesis") || "").trim().slice(0, 2000);
  const conviction = String(formData.get("conviction") || "").trim().toLowerCase();
  const emotion = String(formData.get("emotion") || "").trim().toLowerCase();
  const portfolioId = String(formData.get("portfolio_id") || "").trim() || null;

  if (!ticker) return { error: "Ticker is required." };
  if (!ACTIONS.includes(action as JournalAction)) return { error: "Pick a valid action." };
  if (!thesis) return { error: "Add your reasoning — that's the whole point of the journal." };

  // Snapshot the price at decision time (best-effort; non-fatal if the quote is unavailable).
  let priceAtDecision: number | null = null;
  try {
    const q = await getFinnhubQuote(ticker);
    if (q && q.c > 0) priceAtDecision = q.c;
  } catch { /* ignore */ }

  const { error } = await supabase.from("decision_journal").insert({
    user_id: user.id,
    portfolio_id: portfolioId,
    ticker,
    action,
    thesis,
    conviction: CONVICTIONS.includes(conviction) ? conviction : null,
    emotion: EMOTIONS.includes(emotion) ? emotion : null,
    price_at_decision: priceAtDecision,
  });
  if (error) return { error: error.message };

  void awardXp(user.id, "journal_logged", dailyKey("journal_logged"));
  if (portfolioId) revalidatePath(`/portfolios/${portfolioId}`);
  return {};
}

// Record a reflection on how the decision played out.
export async function reviewJournalEntry(id: string, outcomeNote: string, portfolioId?: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase
    .from("decision_journal")
    .update({ reviewed_at: new Date().toISOString(), outcome_note: outcomeNote.trim().slice(0, 2000) || null })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  if (portfolioId) revalidatePath(`/portfolios/${portfolioId}`);
  return {};
}

export async function deleteJournalEntry(id: string, portfolioId?: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.from("decision_journal").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };

  if (portfolioId) revalidatePath(`/portfolios/${portfolioId}`);
  return {};
}

// One-time backfill: log a journal entry for every already-executed AI recommendation
// that doesn't have one yet. New executions auto-log going forward; this catches the
// history. Idempotent — the unique recommendation_item_id index blocks duplicates and
// we skip any rec that already has an entry.
export async function syncAiDecisionsToJournal(portfolioId: string): Promise<{ inserted: number; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { inserted: 0, error: "You must be signed in." };

  const { data: portfolio } = await supabase
    .from("portfolios").select("id").eq("id", portfolioId).eq("user_id", user.id).maybeSingle();
  if (!portfolio) return { inserted: 0, error: "Portfolio not found." };

  const { data: recs } = await supabase
    .from("recommendation_items")
    .select("id, ticker, action_type, thesis, conviction")
    .eq("portfolio_id", portfolioId).eq("recommendation_status", "executed");
  if (!recs || recs.length === 0) return { inserted: 0 };

  const { data: existing } = await supabase
    .from("decision_journal").select("recommendation_item_id")
    .eq("portfolio_id", portfolioId).not("recommendation_item_id", "is", null)
    .then((r) => r, () => ({ data: null }));
  const done = new Set((existing ?? []).map((r) => r.recommendation_item_id));

  const allowed = ["buy", "add", "sell", "trim", "hold", "watch"];
  const rows = recs
    .filter((r) => r.ticker && !done.has(r.id))
    .map((r) => {
      const act = (r.action_type || "").toLowerCase();
      const isSell = act === "sell" || act === "trim";
      const thesisText = (r.thesis ? String(r.thesis) : "")
        .replace(/\[SECURITY\]|\[SIZING\]/g, "").trim() || "Executed from an AI recommendation.";
      return {
        user_id: user.id,
        portfolio_id: portfolioId,
        ticker: String(r.ticker).toUpperCase(),
        action: allowed.includes(act) ? act : isSell ? "sell" : "buy",
        thesis: thesisText.slice(0, 2000),
        conviction: r.conviction ? String(r.conviction).toLowerCase().replace(/\s+/g, "_") : null,
        price_at_decision: null,
        source: "ai",
        recommendation_item_id: r.id,
      };
    });
  if (rows.length === 0) return { inserted: 0 };

  const { error } = await supabase.from("decision_journal").insert(rows);
  if (error) return { inserted: 0, error: "Could not sync — the journal AI columns may be missing." };

  revalidatePath(`/portfolios/${portfolioId}`);
  return { inserted: rows.length };
}
