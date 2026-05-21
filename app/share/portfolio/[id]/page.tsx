import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import ShareCardClient from "./share-card-client";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://buytune.io";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;

  // Use anon client for metadata — scrapers (iMessage, WhatsApp) send no cookies
  let data: { public_name: string; return_pct_alltime: number | null } | null = null;
  try {
    const supabase = createAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } }
    );
    const res = await supabase
      .from("public_portfolios")
      .select("public_name, return_pct_alltime")
      .eq("id", id)
      .eq("is_public", true)
      .maybeSingle();
    data = res.data;
  } catch { /* fall through to defaults */ }

  const name = data?.public_name ?? "Portfolio";
  const ret = data?.return_pct_alltime != null
    ? `${data.return_pct_alltime >= 0 ? "+" : ""}${data.return_pct_alltime.toFixed(1)}% all-time`
    : "Performance card";

  const imageUrl = `${SITE_URL}/share/portfolio/${id}/opengraph-image`;
  const title = `${name} · ${ret} — BuyTune`;
  const description = `See ${name} on BuyTune — AI-powered portfolio analytics, free.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: "BuyTune",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: `${name} portfolio performance` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
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

  const { data: holdings } = await supabase
    .from("public_portfolio_holdings")
    .select("ticker, company_name, allocation_pct, is_cash, display_order")
    .eq("public_portfolio_id", pub.id)
    .order("display_order")
    .limit(5);

  return <ShareCardClient pub={pub} holdings={holdings ?? []} />;
}
