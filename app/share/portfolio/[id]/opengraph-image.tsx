import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const alt = "BuyTune Portfolio Performance";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function fmtPct(n: number | null): string {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Use direct anon client — public_portfolios has a public RLS SELECT policy for is_public=true rows.
  // Avoids the cookies() dependency which can fail when called by unauthenticated scrapers.
  let pub: {
    public_name: string;
    return_pct_alltime: number | null;
    benchmark_symbol: string | null;
    benchmark_return_pct: number | null;
  } | null = null;

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } }
    );
    const { data } = await supabase
      .from("public_portfolios")
      .select("public_name, return_pct_alltime, benchmark_symbol, benchmark_return_pct")
      .eq("id", id)
      .eq("is_public", true)
      .maybeSingle();
    pub = data;
  } catch {
    // Render generic image on any failure
  }

  const name = pub?.public_name ?? "Portfolio";
  const ret = pub?.return_pct_alltime ?? null;
  const bench = pub?.benchmark_return_pct ?? null;
  const benchSym = pub?.benchmark_symbol ?? "SPY";
  const excess = ret != null && bench != null ? ret - bench : null;
  const retColor = ret == null ? "#475569" : ret >= 0 ? "#4ade80" : "#f87171";
  const excessColor = excess == null ? "#475569" : excess >= 0 ? "#4ade80" : "#f87171";

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: "linear-gradient(135deg, #050d1e 0%, #0a1628 60%, #0d1a35 100%)",
          display: "flex",
          flexDirection: "column",
          padding: "64px 72px",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
        }}
      >
        {/* Subtle glow */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          background: "radial-gradient(ellipse 60% 50% at 30% 40%, rgba(37,99,235,0.08), transparent 70%)",
        }} />

        {/* BuyTune badge */}
        <div style={{
          display: "flex", alignItems: "center", gap: "10px", marginBottom: "48px",
        }}>
          <div style={{
            width: "32px", height: "32px",
            background: "linear-gradient(135deg, #2563eb, #7c3aed)",
            borderRadius: "8px",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M4 16c2.5-3 4.5-4 7-4 2 0 3.5 1 5 3 1.5-4 3-7 4-8" />
            </svg>
          </div>
          <span style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#3b82f6" }}>
            BuyTune
          </span>
        </div>

        {/* Portfolio name */}
        <div style={{ fontSize: "16px", color: "#475569", fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "12px" }}>
          Portfolio performance
        </div>
        <div style={{ fontSize: "56px", fontWeight: 800, color: "#f0f4ff", letterSpacing: "-1.5px", lineHeight: 1.1, marginBottom: "48px", maxWidth: "800px" }}>
          {name}
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: "32px", alignItems: "center" }}>
          <div style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "16px", padding: "24px 32px",
          }}>
            <div style={{ fontSize: "14px", color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>
              All-time return
            </div>
            <div style={{ fontSize: "48px", fontWeight: 700, color: retColor, letterSpacing: "-1px", fontVariantNumeric: "tabular-nums" }}>
              {fmtPct(ret)}
            </div>
          </div>

          {bench != null && (
            <div style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "16px", padding: "24px 32px",
            }}>
              <div style={{ fontSize: "14px", color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>
                {benchSym}
              </div>
              <div style={{ fontSize: "48px", fontWeight: 700, color: "#475569", letterSpacing: "-1px", fontVariantNumeric: "tabular-nums" }}>
                {fmtPct(bench)}
              </div>
            </div>
          )}

          {excess != null && (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ fontSize: "14px", color: "#334155", fontWeight: 500 }}>vs market</div>
              <div style={{ fontSize: "40px", fontWeight: 700, color: excessColor, letterSpacing: "-0.8px" }}>
                {fmtPct(excess)}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          position: "absolute", bottom: "48px", right: "72px",
          fontSize: "16px", color: "#1e3a5f", fontWeight: 500,
        }}>
          buytune.io
        </div>
      </div>
    ),
    { ...size }
  );
}
