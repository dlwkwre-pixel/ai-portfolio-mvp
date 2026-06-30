"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getFinnhubQuote, getFinnhubProfile } from "@/lib/market-data/finnhub";

export type WatchlistItem = {
  id: string;
  ticker: string;
  company_name: string | null;
  target_price: number | null;
  alert_direction: "below" | "above";
  note: string | null;
  created_at: string;
};

export async function addWatchlistItem(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const ticker = String(formData.get("ticker") || "").trim().toUpperCase().slice(0, 12);
  const targetRaw = String(formData.get("target_price") || "").trim();
  const direction = String(formData.get("alert_direction") || "below").trim();
  const note = String(formData.get("note") || "").trim().slice(0, 300);
  if (!ticker) return { error: "Enter a ticker." };

  // Validate it's a real, priceable symbol.
  let quote;
  try { quote = await getFinnhubQuote(ticker); } catch { quote = null; }
  if (!quote || !quote.c || quote.c <= 0) return { error: `Couldn't find a live price for ${ticker}.` };

  let companyName: string | null = null;
  try { const p = await getFinnhubProfile(ticker); companyName = p?.name ?? null; } catch { /* optional */ }

  const target = targetRaw ? Number(targetRaw) : null;
  const { error } = await supabase.from("watchlist").insert({
    user_id: user.id,
    ticker,
    company_name: companyName,
    target_price: target && Number.isFinite(target) && target > 0 ? target : null,
    alert_direction: direction === "above" ? "above" : "below",
    note: note || null,
  });
  if (error) {
    if (error.code === "23505") return { error: `${ticker} is already on your watchlist.` };
    return { error: error.message };
  }
  revalidatePath("/research/watchlist");
  return {};
}

export async function updateWatchlistItem(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const id = String(formData.get("id") || "").trim();
  if (!id) return { error: "Missing item." };
  const targetRaw = String(formData.get("target_price") || "").trim();
  const direction = String(formData.get("alert_direction") || "below").trim();
  const note = String(formData.get("note") || "").trim().slice(0, 300);
  const target = targetRaw ? Number(targetRaw) : null;

  const { error } = await supabase.from("watchlist").update({
    target_price: target && Number.isFinite(target) && target > 0 ? target : null,
    alert_direction: direction === "above" ? "above" : "below",
    note: note || null,
    last_alerted_at: null, // reset so a new target can re-alert
  }).eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/research/watchlist");
  return {};
}

export async function removeWatchlistItem(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { error } = await supabase.from("watchlist").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/research/watchlist");
  return {};
}
