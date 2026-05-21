import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import ShareCardClient from "./share-card-client";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("public_portfolios")
    .select("public_name, return_pct_alltime, benchmark_symbol, benchmark_return_pct")
    .eq("id", id)
    .eq("is_public", true)
    .maybeSingle();

  if (!data) return { title: "Portfolio — BuyTune" };
  const ret = data.return_pct_alltime != null
    ? `${data.return_pct_alltime >= 0 ? "+" : ""}${data.return_pct_alltime.toFixed(1)}% all-time`
    : "Performance card";
  return {
    title: `${data.public_name} · ${ret} — BuyTune`,
    description: `Track ${data.public_name} on BuyTune — free AI-powered portfolio analytics.`,
    openGraph: { title: `${data.public_name} · ${ret}`, description: "Track your portfolio on BuyTune", siteName: "BuyTune" },
  };
}

export default async function SharePortfolioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: pub } = await supabase
    .from("public_portfolios")
    .select("id, public_name, public_description, return_pct_alltime, benchmark_symbol, benchmark_return_pct, stats_updated_at, last_synced_at, created_at")
    .eq("id", id)
    .eq("is_public", true)
    .maybeSingle();

  if (!pub) notFound();

  return <ShareCardClient pub={pub} />;
}
