"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type DigestPrefs = {
  id?: string;
  enabled: boolean;
  frequency: "daily_close" | "weekly_monday" | "weekly_friday" | "monthly_first";
  include_performance: boolean;
  include_holdings: boolean;
  include_earnings: boolean;
  include_ai_score: boolean;
  include_top_movers: boolean;
  include_benchmark: boolean;
  include_ai_recs: boolean;
  include_week_ahead: boolean;
  include_news: boolean;
  include_transactions: boolean;
  include_cash: boolean;
  attach_pdf: boolean;
  email_override: string | null;
  send_hour: number;       // 0–23 in the user's local timezone
  timezone: string;        // IANA timezone string e.g. "America/Chicago"
  last_sent_at: string | null;
};

export async function upsertDigestPrefs(
  portfolioId: string,
  prefs: Omit<DigestPrefs, "id" | "last_sent_at">
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!portfolio) return { error: "Portfolio not found" };

  const { error } = await supabase
    .from("portfolio_digest_preferences")
    .upsert(
      {
        portfolio_id: portfolioId,
        user_id: user.id,
        enabled: prefs.enabled,
        frequency: prefs.frequency,
        include_performance: prefs.include_performance,
        include_holdings: prefs.include_holdings,
        include_earnings: prefs.include_earnings,
        include_ai_score: prefs.include_ai_score,
        include_top_movers: prefs.include_top_movers,
        include_benchmark: prefs.include_benchmark,
        include_ai_recs: prefs.include_ai_recs,
        include_week_ahead: prefs.include_week_ahead,
        include_news: prefs.include_news,
        include_transactions: prefs.include_transactions,
        include_cash: prefs.include_cash,
        attach_pdf: prefs.attach_pdf,
        email_override: prefs.email_override?.trim() || null,
        send_hour: prefs.send_hour,
        timezone: prefs.timezone,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "portfolio_id,user_id" }
    );

  if (error) return { error: error.message };

  revalidatePath(`/portfolios/${portfolioId}`);
  return {};
}

export async function toggleDigestEnabled(portfolioId: string, enabled: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!portfolio) return { error: "Portfolio not found" };

  const { error } = await supabase
    .from("portfolio_digest_preferences")
    .upsert(
      { portfolio_id: portfolioId, user_id: user.id, enabled, updated_at: new Date().toISOString() },
      { onConflict: "portfolio_id,user_id" }
    );

  if (error) return { error: error.message };
  revalidatePath(`/portfolios/${portfolioId}`);
  revalidatePath("/settings/emails");
  return {};
}

export async function getDigestPrefs(portfolioId: string): Promise<DigestPrefs | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("portfolio_digest_preferences")
    .select("*")
    .eq("portfolio_id", portfolioId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    enabled: data.enabled,
    frequency: data.frequency,
    include_performance: data.include_performance,
    include_holdings: data.include_holdings,
    include_earnings: data.include_earnings,
    include_ai_score: data.include_ai_score,
    include_top_movers: data.include_top_movers ?? true,
    include_benchmark: data.include_benchmark ?? false,
    include_ai_recs: data.include_ai_recs ?? false,
    include_week_ahead: data.include_week_ahead ?? false,
    include_news: data.include_news ?? false,
    include_transactions: data.include_transactions ?? false,
    include_cash: data.include_cash ?? false,
    attach_pdf: data.attach_pdf ?? true,
    email_override: data.email_override ?? null,
    send_hour: data.send_hour ?? 16,
    timezone: data.timezone ?? "America/Chicago",
    last_sent_at: data.last_sent_at ?? null,
  };
}
