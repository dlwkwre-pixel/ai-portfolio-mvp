"use server";

import { createClient } from "@/lib/supabase/server";
import { getFinnhubQuote } from "@/lib/market-data/finnhub";
import { revalidatePath } from "next/cache";

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
