"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { TaxPageData, RealizedLot, TLHOpportunity, WashSaleWarning, AssetBucket } from "./page";
import { saveLotAcqYears, saveLotCostBasis, saveLotProceeds } from "./tax-actions";
import { estimateTax, federalBracketHeadroom, FILING_STATUS_LABELS, INCOME_TYPE_LABELS, US_STATES } from "@/lib/tax/estimator";
import { contributionLimits } from "@/lib/tax/contribution-limits";
import type { FilingStatus, IncomeType, BracketHeadroom } from "@/lib/tax/estimator";
import PageTutorial from "@/app/components/page-tutorial";
import InfoTooltip from "@/app/components/info-tooltip";

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(v: number) {
  return `$${Math.abs(Math.round(v)).toLocaleString()}`;
}
function fmtFull(v: number) {
  return `$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(v: number | null) {
  if (v === null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function glColor(v: number) {
  if (v > 0) return "var(--green)";
  if (v < 0) return "var(--red)";
  return "var(--text-secondary)";
}

// Standard deductions 2025
const STD_DEDUCTION: Record<string, number> = {
  single: 15_000,
  married_filing_jointly: 30_000,
  head_of_household: 22_500,
  married_filing_separately: 15_000,
};

const STCG_BRACKETS = [
  { label: "10%", rate: 0.10 }, { label: "12%", rate: 0.12 }, { label: "22%", rate: 0.22 },
  { label: "24%", rate: 0.24 }, { label: "32%", rate: 0.32 }, { label: "35%", rate: 0.35 },
  { label: "37%", rate: 0.37 },
];
const LTCG_RATES = [
  { bracket: "Up to $47,025 (single) / $94,050 (MFJ)", rate: 0, label: "0%" },
  { bracket: "$47,026–$518,900 (single) / $94,051–$583,750 (MFJ)", rate: 0.15, label: "15%" },
  { bracket: "Over $518,900 (single) / Over $583,750 (MFJ)", rate: 0.20, label: "20%" },
];

// ─── count-up hook ────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 1000) {
  const [val, setVal] = useState(0);
  const ranRef = useRef(false);
  useEffect(() => {
    if (ranRef.current || target === 0) { setVal(target); return; }
    ranRef.current = true;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(target * eased));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return val;
}

// ─── tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "picture", label: "Your Tax Picture" },
  { id: "trades", label: "My Trades" },
  { id: "reference", label: "Tax Rates" },
] as const;
type TabId = typeof TABS[number]["id"];

// ─── learn panel ─────────────────────────────────────────────────────────────

function LearnPanel({ title, label, children }: { title: string; label?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "10px", fontWeight: 600, color: "oklch(0.62 0.15 260)", background: "rgba(63,174,74,0.08)", border: "1px solid rgba(63,174,74,0.18)", borderRadius: "10px", padding: "2px 8px", cursor: "pointer", fontFamily: "var(--font-body)", marginTop: "4px" }}
      >
        {open ? "✕ Hide" : (label ?? "? What is this")}
      </button>
      <div style={{ maxHeight: open ? "400px" : "0", overflow: "hidden", transition: "max-height 0.3s ease" }}>
        <div style={{ padding: "10px 14px", marginTop: "8px", background: "rgba(63,174,74,0.05)", border: "1px solid rgba(63,174,74,0.12)", borderRadius: "var(--radius-md)", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.65 }}>
          <p style={{ margin: "0 0 4px", fontWeight: 600, color: "var(--text-primary)", fontSize: "11px" }}>{title}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── action item ─────────────────────────────────────────────────────────────

function ActionItem({ type, text, detail, cta, onCta }: {
  type: "save" | "warn" | "info";
  text: string;
  detail?: string;
  cta?: string;
  onCta?: () => void;
}) {
  const styles = {
    save: { dot: "var(--green)", bg: "rgba(0,211,149,0.04)", border: "rgba(0,211,149,0.15)" },
    warn: { dot: "#f59e0b", bg: "rgba(245,158,11,0.04)", border: "rgba(245,158,11,0.18)" },
    info: { dot: "oklch(0.62 0.15 260)", bg: "rgba(63,174,74,0.04)", border: "rgba(63,174,74,0.15)" },
  };
  const s = styles[type];
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "11px 14px", background: s.bg, border: `1px solid ${s.border}`, borderRadius: "var(--radius-md)" }}>
      <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: s.dot, flexShrink: 0, marginTop: "5px" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 2px", fontFamily: "var(--font-body)" }}>{text}</p>
        {detail && <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>{detail}</p>}
      </div>
      {cta && onCta && (
        <button type="button" onClick={onCta} style={{ fontSize: "10px", fontWeight: 600, color: s.dot, background: "none", border: `1px solid ${s.border}`, borderRadius: "var(--radius-full)", padding: "3px 10px", cursor: "pointer", flexShrink: 0, fontFamily: "var(--font-body)" }}>
          {cta}
        </button>
      )}
    </div>
  );
}

// ─── section card ─────────────────────────────────────────────────────────────

function SectionCard({ icon, color, label, amount, sub, children, defaultOpen = false }: {
  icon: string; color: string; label: string; amount: number | null;
  sub?: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="tax-card" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: "12px", padding: "14px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "left" as const }}
      >
        <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: `${color}14`, border: `1px solid ${color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "17px", flexShrink: 0 }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", margin: 0, fontFamily: "var(--font-body)" }}>{label}</p>
          {sub && <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "1px 0 0", fontFamily: "var(--font-body)" }}>{sub}</p>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          {amount !== null && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color: amount > 0 ? "var(--text-primary)" : "var(--text-muted)" }}>
              {amount > 0 ? fmt(amount) : "—"}
            </span>
          )}
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>
            <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>
      <div style={{ maxHeight: open ? "1200px" : "0", overflow: "hidden", transition: "max-height 0.35s ease" }}>
        <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "14px 18px 16px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── bracket headroom tool ──────────────────────────────────────────────────────
// Shows where taxable income sits in the federal brackets and what the room before the next
// bracket is worth: extra pre-tax contributions, a Roth conversion, or harvesting gains/income.

function BracketHeadroomCard({ h }: { h: BracketHeadroom }) {
  const ratePct = Math.round(h.currentRate * 100);
  const nextPct = h.nextRate != null ? Math.round(h.nextRate * 100) : null;
  const atTop = h.roomToNext === Infinity || h.nextRate == null;
  const room = atTop ? null : Math.round(h.roomToNext);
  // Position of income within the active bracket (for the marker), guarded for the top bracket.
  const span = h.currentCeiling === Infinity ? 0 : h.currentCeiling - h.currentFloor;
  const posInBracket = span > 0 ? Math.min(1, Math.max(0, (h.taxableIncome - h.currentFloor) / span)) : 1;
  // 0% long-term capital-gains bracket sits in the 10–12% ordinary brackets.
  const likely0Ltcg = h.currentRate <= 0.12;

  return (
    <div className="tax-card" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 18px 12px" }}>
        <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(63,174,74,0.08)", border: "1px solid rgba(63,174,74,0.22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "17px", flexShrink: 0 }}>🪜</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Bracket headroom</p>
          <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "1px 0 0" }}>
            You&apos;re in the {ratePct}% bracket{atTop ? " (top bracket)" : ` · ${fmt(room ?? 0)} of taxable income until ${nextPct}%`}
          </p>
        </div>
      </div>

      <div style={{ padding: "4px 18px 16px" }}>
        {/* Bracket ladder */}
        <div style={{ display: "flex", height: "30px", borderRadius: "8px", overflow: "hidden", border: "1px solid var(--border-subtle)" }}>
          {h.segments.map((s) => {
            const active = s.rate === h.currentRate;
            return (
              <div key={s.rate} style={{
                flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
                background: active ? "var(--brand-gradient)" : "var(--bg-elevated, rgba(255,255,255,0.03))",
                borderRight: s.rate === 0.37 ? "none" : "1px solid var(--border-subtle)",
              }}>
                <span style={{ fontSize: "10px", fontWeight: 700, fontFamily: "var(--font-mono)", color: active ? "#fff" : "var(--text-tertiary)" }}>{Math.round(s.rate * 100)}</span>
                {active && span > 0 && (
                  <div style={{ position: "absolute", top: 0, bottom: 0, left: `${posInBracket * 100}%`, width: "2px", background: "#fff", boxShadow: "0 0 4px rgba(255,255,255,0.8)" }} />
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "5px" }}>
          <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>Taxable income {fmt(Math.round(h.taxableIncome))}</span>
          {!atTop && <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>Next bracket at {fmt(h.currentCeiling)}</span>}
        </div>

        {/* What the room is worth */}
        {!atTop && room != null && room > 0 && (
          <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text-tertiary)", margin: 0 }}>
              {fmt(room)} of headroom — you could
            </p>
            {[
              { t: `Contribute up to ${fmt(room)} more pre-tax`, d: `Lowers taxable income, saving about ${fmt(Math.round(room * h.currentRate))} now (at your ${ratePct}% rate).` },
              { t: `Convert up to ${fmt(room)} to a Roth`, d: `Move Traditional IRA/401(k) money into a Roth taxed at just ${ratePct}% — locking in today's rate before the ${nextPct}% bracket.` },
              likely0Ltcg
                ? { t: "Harvest long-term gains tax-free", d: `In the ${ratePct}% bracket you're likely in the 0% long-term capital-gains bracket — realizing long-term gains up to ${fmt(room)} could owe $0 federal.` }
                : { t: `Realize up to ${fmt(room)} of income at ${ratePct}%`, d: `Pull income forward (bonus, gains, IRA withdrawal) while staying in the ${ratePct}% bracket.` },
            ].map((opt, i) => (
              <div key={i} style={{ display: "flex", gap: "9px", alignItems: "flex-start", padding: "9px 11px", background: "var(--bg-elevated, rgba(255,255,255,0.02))", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
                <span style={{ color: "var(--accent, #5fbf9a)", fontWeight: 700, fontSize: "12px", lineHeight: 1.4, flexShrink: 0 }}>{i + 1}</span>
                <div>
                  <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>{opt.t}</p>
                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: "2px 0 0", lineHeight: 1.5 }}>{opt.d}</p>
                </div>
              </div>
            ))}
            <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "2px 0 0", lineHeight: 1.5 }}>
              Estimates on {new Date().getFullYear()} federal brackets for planning only — not tax advice. Roth conversions and harvested income are themselves taxable; confirm with a tax professional.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Small branded "?" trigger that opens the in-app InfoTooltip popover (not a native title).
function Hint({ text, width = 230 }: { text: string; width?: number }) {
  return (
    <InfoTooltip text={text} width={width} align="start">
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: "15px", height: "15px", borderRadius: "50%", marginLeft: "5px", cursor: "help",
        background: "rgba(63,174,74,0.12)", border: "1px solid rgba(63,174,74,0.3)",
        color: "var(--accent, #5fbf9a)", fontSize: "10px", fontWeight: 700, lineHeight: 1,
      }}>?</span>
    </InfoTooltip>
  );
}

// ─── asset location / tax diversification ────────────────────────────────────────
const ASSET_LABELS: Record<string, string> = { stock: "Stocks", equity: "Stocks", etf: "ETFs", crypto: "Crypto", manual: "Funds", cash: "Cash", other: "Other" };
const BUCKET_META: Record<"taxable" | "deferred" | "free", { label: string; color: string; tip: string }> = {
  taxable:  { label: "Taxable",      color: "#38bdf8", tip: "Brokerage / individual accounts. You owe tax on dividends and realized gains each year. Best home for tax-efficient holdings you may want to sell flexibly." },
  deferred: { label: "Tax-deferred", color: "#6fd08a", tip: "Traditional 401(k) / IRA / HSA. Contributions are pre-tax and grow untaxed; withdrawals in retirement are taxed as ordinary income. Best home for income-heavy or tax-inefficient assets (bonds, REITs)." },
  free:     { label: "Tax-free",     color: "var(--green)", tip: "Roth IRA / Roth 401(k). Funded with after-tax dollars; qualified growth and withdrawals are 100% tax-free. Best home for your highest-growth assets." },
};

function AssetLocationCard({ buckets }: { buckets: { taxable: AssetBucket; deferred: AssetBucket; free: AssetBucket } }) {
  const order = ["taxable", "deferred", "free"] as const;
  const total = order.reduce((s, k) => s + buckets[k].value, 0);
  const animatedTotal = useCountUp(Math.round(total));
  if (total <= 0) return null;

  const freePct = buckets.free.value / total;
  const nonEmpty = order.filter((k) => buckets[k].value > 0).length;
  const guidance = freePct < 0.1
    ? "Most of your money is taxable or tax-deferred. Building a Roth (tax-free) bucket gives you tax-free growth and the flexibility to pull money in retirement without raising your taxable income."
    : nonEmpty === 1
      ? "You're concentrated in one tax treatment. Spreading across taxable, tax-deferred, and Roth gives you levers to manage taxes in any future year."
      : "Good tax diversification — you hold money across multiple tax treatments, which gives flexibility to control your tax bill in retirement.";

  return (
    <div className="tax-card" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 18px" }}>
      <style>{`@keyframes bt-al-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } } .bt-al-seg { transform-origin: left; animation: bt-al-grow .7s cubic-bezier(0.16,1,0.3,1) both; }`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
        <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(63,174,74,0.08)", border: "1px solid rgba(63,174,74,0.22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "17px", flexShrink: 0 }}>📍</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", margin: 0, display: "flex", alignItems: "center" }}>
            Asset location <Hint text="Asset location is about WHICH account type holds each investment. Placing the right assets in taxable, tax-deferred, and tax-free accounts can cut lifetime taxes without changing what you own." width={250} />
          </p>
          <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "1px 0 0" }}>Across {fmt(animatedTotal)} in invested accounts</p>
        </div>
      </div>

      {/* Stacked bar */}
      <div style={{ display: "flex", height: "16px", borderRadius: "8px", overflow: "hidden", marginBottom: "14px", background: "rgba(148,163,184,0.12)" }}>
        {order.map((k, i) => buckets[k].value > 0 && (
          <div key={k} className="bt-al-seg" style={{ width: `${(buckets[k].value / total) * 100}%`, background: BUCKET_META[k].color, animationDelay: `${i * 90}ms` }} />
        ))}
      </div>

      {/* Bucket rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {order.map((k) => {
          const b = buckets[k];
          const pct = total > 0 ? Math.round((b.value / total) * 100) : 0;
          const chips = Object.entries(b.byAsset).sort((a, c) => c[1] - a[1]).slice(0, 4);
          return (
            <div key={k} style={{ opacity: b.value > 0 ? 1 : 0.5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span style={{ width: "9px", height: "9px", borderRadius: "3px", background: BUCKET_META[k].color, flexShrink: 0 }} />
                <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)", display: "inline-flex", alignItems: "center" }}>
                  {BUCKET_META[k].label}<Hint text={BUCKET_META[k].tip} />
                </span>
                <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "12.5px", fontWeight: 700, color: "var(--text-primary)" }}>{fmt(Math.round(b.value))}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-tertiary)", width: "34px", textAlign: "right" }}>{pct}%</span>
              </div>
              {chips.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", paddingLeft: "17px" }}>
                  {chips.map(([at, v]) => (
                    <span key={at} style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", background: "var(--bg-elevated, rgba(255,255,255,0.03))", border: "1px solid var(--border-subtle)", borderRadius: "999px", padding: "1px 8px" }}>
                      {ASSET_LABELS[at] ?? at} {fmt(Math.round(v))}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Guidance */}
      <div style={{ marginTop: "14px", padding: "10px 13px", background: "rgba(63,174,74,0.05)", border: "1px solid rgba(63,174,74,0.18)", borderRadius: "var(--radius-md)" }}>
        <p style={{ fontSize: "11.5px", color: "var(--text-secondary)", lineHeight: 1.55, margin: 0 }}>{guidance}</p>
        <p style={{ fontSize: "10.5px", color: "var(--text-muted)", lineHeight: 1.5, margin: "6px 0 0" }}>
          Rule of thumb: highest-growth assets → Roth, income / tax-inefficient (bonds, REITs) → tax-deferred, tax-efficient index funds → taxable.
        </p>
      </div>
    </div>
  );
}

// ─── Roth conversion modeler ──────────────────────────────────────────────────────
// Marginal tax of converting `amount` of pre-tax money, stacking on top of current taxable income.
function conversionTaxFor(amount: number, h: BracketHeadroom): number {
  let remaining = amount, cost = 0, pos = h.taxableIncome;
  for (const seg of h.segments) {
    if (pos >= seg.ceiling) continue;
    const room = seg.ceiling - Math.max(pos, seg.floor);
    const taxed = Math.min(remaining, room);
    if (taxed > 0) { cost += taxed * seg.rate; remaining -= taxed; pos += taxed; }
    if (remaining <= 0) break;
  }
  return cost;
}

function RothConversionModeler({ traditionalEstimate, h }: { traditionalEstimate: number; h: BracketHeadroom }) {
  const roomDefault = h.roomToNext === Infinity ? 50_000 : Math.max(5_000, Math.round(h.roomToNext / 1000) * 1000);
  const [balance, setBalance] = useState(Math.max(0, Math.round(traditionalEstimate)));
  const [annual, setAnnual] = useState(Math.min(roomDefault, Math.max(5_000, Math.round((traditionalEstimate || 100_000) / 1000) * 1000)));
  const [years, setYears] = useState(3);

  const perYearTax = conversionTaxFor(annual, h);
  const effRate = annual > 0 ? perYearTax / annual : 0;
  const totalConverted = Math.min(annual * years, balance);
  const fullYears = annual > 0 ? Math.min(years, Math.ceil(balance / annual)) : 0;
  const totalTax = Math.round(perYearTax * Math.min(years, fullYears || years));
  const remaining = Math.max(0, balance - totalConverted);
  const spillsBracket = h.roomToNext !== Infinity && annual > h.roomToNext;
  const ratePct = Math.round(h.currentRate * 100);
  const nextPct = h.nextRate != null ? Math.round(h.nextRate * 100) : null;

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", background: "var(--bg-elevated, rgba(255,255,255,0.03))",
    border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "8px 10px",
    fontSize: "13px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", outline: "none",
  };

  return (
    <div className="tax-card" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
        <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "17px", flexShrink: 0 }}>🔁</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", margin: 0, display: "flex", alignItems: "center" }}>
            Roth conversion modeler <Hint width={260} text="A Roth conversion moves money from a Traditional (pre-tax) IRA/401(k) into a Roth. You pay ordinary income tax on the converted amount now, but it then grows and is withdrawn 100% tax-free. Best in lower-income years and to fill up a low tax bracket." />
          </p>
          <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "1px 0 0" }}>Convert pre-tax → tax-free, taxed at today&apos;s rate</p>
        </div>
      </div>

      {/* Inputs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
        <div>
          <label style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "var(--text-tertiary)", display: "flex", alignItems: "center", marginBottom: "4px" }}>
            Traditional balance <Hint text="Your estimated pre-tax (Traditional 401k/IRA) balance available to convert. We pre-filled it from your accounts — adjust if needed." />
          </label>
          <input type="number" value={balance} min={0} step={1000} onChange={(e) => setBalance(Math.max(0, Number(e.target.value)))} style={inputStyle} />
        </div>
        <div>
          <label style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "var(--text-tertiary)", display: "flex", alignItems: "center", marginBottom: "4px" }}>
            Convert per year
          </label>
          <input type="number" value={annual} min={0} step={1000} onChange={(e) => setAnnual(Math.max(0, Number(e.target.value)))} style={inputStyle} />
        </div>
      </div>
      <div style={{ marginBottom: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "var(--text-tertiary)" }}>Over {years} year{years > 1 ? "s" : ""}</span>
          {h.roomToNext !== Infinity && (
            <button type="button" onClick={() => setAnnual(Math.max(1000, Math.round(h.roomToNext / 1000) * 1000))}
              style={{ fontSize: "10px", color: "var(--accent, #5fbf9a)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", padding: 0 }}>
              Fill {ratePct}% bracket ({fmt(Math.round(h.roomToNext))})
            </button>
          )}
        </div>
        <input type="range" min={1} max={10} value={years} onChange={(e) => setYears(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--green)" }} />
      </div>

      {/* Results */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
        {[
          { label: "Tax per year", value: fmt(Math.round(perYearTax)), sub: `${Math.round(effRate * 100)}% effective`, color: "var(--text-primary)" },
          { label: `Total tax (${years}y)`, value: fmt(totalTax), sub: `on ${fmt(Math.round(totalConverted))} converted`, color: "var(--text-primary)" },
          { label: "Left in Traditional", value: fmt(Math.round(remaining)), sub: remaining > 0 ? "still pre-tax" : "fully converted", color: remaining > 0 ? "var(--text-secondary)" : "var(--green)" },
        ].map((s) => (
          <div key={s.label} style={{ padding: "10px 12px", background: "var(--bg-elevated, rgba(255,255,255,0.03))", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
            <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "var(--text-muted)", margin: "0 0 4px" }}>{s.label}</p>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 700, color: s.color, margin: 0, transition: "color .2s" }}>{s.value}</p>
            <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "2px 0 0" }}>{s.sub}</p>
          </div>
        ))}
      </div>

      <div style={{ marginTop: "12px", padding: "10px 13px", background: spillsBracket ? "rgba(245,158,11,0.06)" : "rgba(52,211,153,0.05)", border: `1px solid ${spillsBracket ? "rgba(245,158,11,0.2)" : "rgba(52,211,153,0.18)"}`, borderRadius: "var(--radius-md)" }}>
        <p style={{ fontSize: "11.5px", color: "var(--text-secondary)", lineHeight: 1.55, margin: 0 }}>
          {spillsBracket
            ? `Converting ${fmt(annual)} pushes past your ${ratePct}% bracket — the portion above ${fmt(Math.round(h.roomToNext))} is taxed at ${nextPct}%. To stay at ${ratePct}%, convert about ${fmt(Math.round(h.roomToNext))}/year.`
            : `At ${fmt(annual)}/year you'd pay tax at roughly ${Math.round(effRate * 100)}% now, then that money grows and comes out tax-free. Converting in lower-income years (early retirement, a sabbatical, a down year) is when this pays off most.`}
        </p>
      </div>
      <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "8px 0 0", lineHeight: 1.5 }}>
        Estimate on {new Date().getFullYear()} federal brackets, ignoring state tax and any IRMAA / ACA-subsidy effects. Not tax advice — confirm with a professional before converting.
      </p>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function TaxClient({ data }: { data: TaxPageData }) {
  const [tab, setTab] = useState<TabId>("picture");
  const [stcgRate, setStcgRate] = useState(0.22);
  const [ltcgRate, setLtcgRate] = useState(0.15);
  const [niitApplies, setNiitApplies] = useState(false);
  const [finnOutput, setFinnOutput] = useState<string | null>(null);
  const [finnLoading, setFinnLoading] = useState(false);
  const [finnError, setFinnError] = useState<string | null>(null);
  const [realizedFilter, setRealizedFilter] = useState<"all" | "gains" | "losses">("all");
  const [barMounted, setBarMounted] = useState(false);
  const [lotAcqYears, setLotAcqYears] = useState<Record<string, number>>(data.lotAcqYears ?? {});
  const [lotCostBasis, setLotCostBasis] = useState<Record<string, number>>(data.lotCostBasis ?? {});
  const [lotProceeds, setLotProceeds] = useState<Record<string, number>>(data.lotProceeds ?? {});
  const [tradesSaved, setTradesSaved] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialMount = useRef(true);
  const saveCbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialCbMount = useRef(true);
  const saveProcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialProcMount = useRef(true);
  const savedFadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bulkAcqYear, setBulkAcqYear] = useState<number>(0);
  const [finnPanelOpen, setFinnPanelOpen] = useState(false);
  const [quickAnnualIncome, setQuickAnnualIncome] = useState<number | null>(null);
  const [quickFilingStatus, setQuickFilingStatus] = useState<FilingStatus>("single");
  const [pretax401k, setPretax401k] = useState<number>(0);
  const [pretaxHSA, setPretaxHSA] = useState<number>(0);

  useEffect(() => {
    const t = setTimeout(() => setBarMounted(true), 150);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await saveLotAcqYears(lotAcqYears);
      setTradesSaved(true);
      if (savedFadeRef.current) clearTimeout(savedFadeRef.current);
      savedFadeRef.current = setTimeout(() => setTradesSaved(false), 2000);
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [lotAcqYears]);

  useEffect(() => {
    if (isInitialCbMount.current) {
      isInitialCbMount.current = false;
      return;
    }
    if (saveCbTimerRef.current) clearTimeout(saveCbTimerRef.current);
    saveCbTimerRef.current = setTimeout(async () => {
      await saveLotCostBasis(lotCostBasis);
      setTradesSaved(true);
      if (savedFadeRef.current) clearTimeout(savedFadeRef.current);
      savedFadeRef.current = setTimeout(() => setTradesSaved(false), 2000);
    }, 800);
    return () => {
      if (saveCbTimerRef.current) clearTimeout(saveCbTimerRef.current);
    };
  }, [lotCostBasis]);

  useEffect(() => {
    if (isInitialProcMount.current) {
      isInitialProcMount.current = false;
      return;
    }
    if (saveProcTimerRef.current) clearTimeout(saveProcTimerRef.current);
    saveProcTimerRef.current = setTimeout(async () => {
      await saveLotProceeds(lotProceeds);
      setTradesSaved(true);
      if (savedFadeRef.current) clearTimeout(savedFadeRef.current);
      savedFadeRef.current = setTimeout(() => setTradesSaved(false), 2000);
    }, 800);
    return () => {
      if (saveProcTimerRef.current) clearTimeout(saveProcTimerRef.current);
    };
  }, [lotProceeds]);

  const { realizedLots, dividendIncome, tlhOpportunities, washSaleWarnings, selectedYear, taxProfile } = data;

  // Atlas localStorage persistence
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`finn-tax-${selectedYear}`);
      setFinnOutput(stored ?? null);
    } catch {
      setFinnOutput(null);
    }
  }, [selectedYear]);

  useEffect(() => {
    if (!finnOutput) return;
    try {
      localStorage.setItem(`finn-tax-${selectedYear}`, finnOutput);
    } catch {}
  }, [finnOutput, selectedYear]);

  // Income tax estimate
  const incomeTaxEstimate = taxProfile?.grossMonthly
    ? estimateTax(
        taxProfile.grossMonthly,
        (taxProfile.filingStatus as FilingStatus) ?? "single",
        (taxProfile.incomeType as IncomeType) ?? "w2",
        taxProfile.stateCode ?? "",
        taxProfile.preTaxDeductionsAnnual ?? 0,
      )
    : null;

  // Cap gains rates derived from income
  const derivedStcgRate = incomeTaxEstimate?.federalMarginalRate ?? 0.22;
  const mfjThresh = taxProfile?.filingStatus === "married_filing_jointly";
  const derivedLtcgRate = incomeTaxEstimate
    ? incomeTaxEstimate.grossAnnual > (mfjThresh ? 583_750 : 518_900) ? 0.20
      : incomeTaxEstimate.grossAnnual > (mfjThresh ? 94_050 : 47_025) ? 0.15 : 0.00
    : 0.15;
  const cgNiit = incomeTaxEstimate
    ? incomeTaxEstimate.grossAnnual > (mfjThresh ? 250_000 : 200_000)
    : niitApplies;

  const cgStcgRate = incomeTaxEstimate ? derivedStcgRate : stcgRate;
  const cgLtcgRate = incomeTaxEstimate ? derivedLtcgRate : ltcgRate;

  // Quick bracket estimate (when no saved profile, user enters income directly in the bracket finder)
  const quickTaxEstimate = !incomeTaxEstimate && quickAnnualIncome && quickAnnualIncome > 0
    ? estimateTax(quickAnnualIncome / 12, quickFilingStatus, "w2", "", 0)
    : null;
  // Active estimate: prefer profile-based, fall back to quick entry
  const activeEstimate = incomeTaxEstimate ?? quickTaxEstimate;
  const activeFiling: FilingStatus = incomeTaxEstimate
    ? ((taxProfile?.filingStatus as FilingStatus) ?? "single")
    : quickFilingStatus;
  const headroom = activeEstimate ? federalBracketHeadroom(activeEstimate.taxableIncome, activeFiling) : null;
  const cgStcgRateResolved = activeEstimate ? activeEstimate.federalMarginalRate : stcgRate;
  const cgLtcgRateResolved = activeEstimate
    ? (activeEstimate.grossAnnual > (mfjThresh ? 583_750 : 518_900) ? 0.20 : activeEstimate.grossAnnual > (mfjThresh ? 94_050 : 47_025) ? 0.15 : 0.00)
    : ltcgRate;

  // Apply user-supplied cost basis overrides and/or acquisition years
  const effectiveLots = realizedLots.map(lot => {
    const overriddenCostBasis = lotCostBasis[lot.id] !== undefined ? lotCostBasis[lot.id] : lot.costBasis;
    const overriddenProceeds = lotProceeds[lot.id] !== undefined ? lotProceeds[lot.id] : lot.proceeds;
    const gainLoss = overriddenProceeds - overriddenCostBasis;
    let result = { ...lot, costBasis: overriddenCostBasis, proceeds: overriddenProceeds, gainLoss };
    if (!lot.acquiredAt && lotAcqYears[lot.id]) {
      const acqYear = lotAcqYears[lot.id];
      const sellYear = new Date(lot.soldAt).getFullYear();
      const term: "short" | "long" = acqYear >= sellYear ? "short" : "long";
      result = { ...result, termType: term };
    }
    return result;
  });

  // Realized gains breakdown
  const stcgLots = effectiveLots.filter(l => l.termType === "short");
  const ltcgLots = effectiveLots.filter(l => l.termType === "long");
  const unknownLots = effectiveLots.filter(l => l.termType === "unknown");
  const stcgNet = stcgLots.reduce((s, l) => s + l.gainLoss, 0);
  const ltcgNet = ltcgLots.reduce((s, l) => s + l.gainLoss, 0);
  const totalRealizedGain = stcgNet + ltcgNet + unknownLots.reduce((s, l) => s + l.gainLoss, 0);
  const totalTLHAvailable = tlhOpportunities.reduce((s, o) => s + (o.unrealizedLoss ?? 0), 0);

  const estimatedCapGainsTax = Math.max(0, stcgNet) * cgStcgRate
    + Math.max(0, ltcgNet) * (cgLtcgRate + (cgNiit ? 0.038 : 0))
    + dividendIncome * cgLtcgRate;


  // Property tax estimate (homeowner)
  const annualPropertyTax = taxProfile?.isHomeowner && taxProfile.ownerHomeValue
    ? Math.round(taxProfile.ownerHomeValue * 0.011)
    : 0;
  const annualMortgageInterest = taxProfile?.isHomeowner && taxProfile.ownerMortgageBalance && taxProfile.ownerInterestRate
    ? Math.round(taxProfile.ownerMortgageBalance * (taxProfile.ownerInterestRate / 100))
    : 0;

  // Deductions analysis
  const stdDeduction = STD_DEDUCTION[taxProfile?.filingStatus ?? "single"] ?? 15_000;
  const saltCapped = incomeTaxEstimate
    ? Math.min(Math.round(incomeTaxEstimate.stateTax) + annualPropertyTax, 10_000)
    : 0;
  const estimatedItemized = annualMortgageInterest + saltCapped;
  const itemizingSaves = estimatedItemized > stdDeduction
    ? Math.round((estimatedItemized - stdDeduction) * (incomeTaxEstimate?.federalMarginalRate ?? 0))
    : 0;

  // Grand total
  const incomeTaxTotal = activeEstimate ? Math.round(activeEstimate.totalTax) : 0;
  const propertyTaxTotal = annualPropertyTax;
  const investTaxTotal = Math.round(estimatedCapGainsTax);
  const grandTotal = incomeTaxTotal + propertyTaxTotal + investTaxTotal;
  const displayTotal = useCountUp(grandTotal);

  const grossAnnual = activeEstimate?.grossAnnual ?? 0;
  const effectiveRate = grossAnnual > 0 ? ((grandTotal / grossAnnual) * 100).toFixed(1) : null;

  // Segment widths for progress bar
  const incomeBarPct = grandTotal > 0 ? (incomeTaxTotal / grandTotal) * 100 : 0;
  const propBarPct = grandTotal > 0 ? (propertyTaxTotal / grandTotal) * 100 : 0;
  const investBarPct = grandTotal > 0 ? (investTaxTotal / grandTotal) * 100 : 0;

  // Filtered trades
  const filteredLots = effectiveLots.filter(l =>
    realizedFilter === "all" ? true : realizedFilter === "gains" ? l.gainLoss >= 0 : l.gainLoss < 0
  );
  const potentialSavings = Math.abs(totalTLHAvailable) * cgStcgRateResolved;

  async function runFinnAnalysis() {
    setFinnLoading(true); setFinnError(null);
    try {
      const body = {
        year: selectedYear, stcgNet, ltcgNet, dividendIncome,
        tlhTotal: totalTLHAvailable, washSaleCount: washSaleWarnings.length,
        lots: realizedLots.slice(0, 20).map(l => ({ ticker: l.ticker, gainLoss: l.gainLoss, termType: l.termType, soldAt: l.soldAt })),
        opportunities: tlhOpportunities.slice(0, 10).map(o => ({ ticker: o.ticker, unrealizedLoss: o.unrealizedLoss, shares: o.shares })),
      };
      const res = await fetch("/api/tax/ai-strategy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setFinnOutput(json.analysis);
    } catch (e) {
      setFinnError(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setFinnLoading(false);
    }
  }

  const disclaimer = (
    <p style={{ fontSize: "10px", color: "var(--text-muted)", lineHeight: 1.5, margin: 0 }}>
      <strong style={{ color: "#f59e0b" }}>Not tax advice.</strong> Educational estimates based on your data. Consult a CPA before filing. Property tax uses a 1.1% national average — your actual rate may differ. Mortgage interest is approximated.
    </p>
  );

  return (
    <>
      <PageTutorial tutorialId="tax" />
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .tax-card { animation: fadeInUp 0.35s ease-out both; }
        .tax-card:nth-child(1) { animation-delay: 0.05s; }
        .tax-card:nth-child(2) { animation-delay: 0.1s; }
        .tax-card:nth-child(3) { animation-delay: 0.15s; }
        .tax-card:nth-child(4) { animation-delay: 0.2s; }
        .tax-card:nth-child(5) { animation-delay: 0.25s; }
        .tax-card:nth-child(6) { animation-delay: 0.3s; }
        .tax-card:nth-child(7) { animation-delay: 0.35s; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .finn-panel { animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) both; }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>

        {/* ── HERO BAND ── */}
        <div style={{ position: "relative", padding: "4px 0 22px", marginBottom: "2px", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% -10%, rgba(14,165,160,0.2) 0%, transparent 68%)", pointerEvents: "none" }} />
          <div style={{ position: "relative", zIndex: 1 }}>

            {/* Year chips */}
            <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" as const, marginBottom: "18px" }}>
              {data.years.map(y => (
                <Link key={y} href={`/tax?year=${y}`} style={{ padding: "3px 11px", borderRadius: "var(--radius-full)", fontSize: "11px", fontWeight: y === selectedYear ? 700 : 400, textDecoration: "none", background: y === selectedYear ? "rgba(14,165,160,0.18)" : "transparent", color: y === selectedYear ? "oklch(0.75 0.18 265)" : "var(--text-muted)", border: `1px solid ${y === selectedYear ? "rgba(14,165,160,0.45)" : "rgba(255,255,255,0.07)"}`, transition: "all 0.12s" }}>
                  {y}
                </Link>
              ))}
            </div>

            {/* Label */}
            <p style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "oklch(0.54 0.07 265)", margin: "0 0 5px", fontFamily: "var(--font-body)" }}>
              Estimated {selectedYear} Tax Bill
            </p>

            {/* Main number */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: "12px", flexWrap: "wrap" as const, marginBottom: grandTotal > 0 ? "10px" : "14px" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(38px, 10vw, 52px)", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1, letterSpacing: "-2px" }}>
                ${displayTotal.toLocaleString()}
              </span>
              {effectiveRate && (
                <span style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "5px" }}>{effectiveRate}% of income</span>
              )}
            </div>

            {/* Segmented bar */}
            {grandTotal > 0 && (
              <div style={{ marginBottom: "14px" }}>
                <div style={{ display: "flex", height: "4px", borderRadius: "4px", overflow: "hidden", background: "var(--surface-006)", gap: "2px" }}>
                  {incomeTaxTotal > 0 && <div style={{ width: barMounted ? `${incomeBarPct}%` : "0%", background: "linear-gradient(90deg,#0ea5a0,#3fc9c3)", borderRadius: "4px 0 0 4px", transition: "width 1s ease-out", flexShrink: 0 }} />}
                  {propertyTaxTotal > 0 && <div style={{ width: barMounted ? `${propBarPct}%` : "0%", background: "#f59e0b", transition: "width 1s ease-out 0.1s", flexShrink: 0 }} />}
                  {investTaxTotal > 0 && <div style={{ width: barMounted ? `${investBarPct}%` : "0%", background: "linear-gradient(90deg,#8b5cf6,#6d28d9)", borderRadius: "0 4px 4px 0", transition: "width 1s ease-out 0.2s", flexShrink: 0 }} />}
                </div>
                <div style={{ display: "flex", gap: "12px", marginTop: "7px", flexWrap: "wrap" as const }}>
                  {incomeTaxTotal > 0 && <div style={{ display: "flex", alignItems: "center", gap: "5px" }}><div style={{ width: "7px", height: "7px", borderRadius: "2px", background: "#0ea5a0", flexShrink: 0 }} /><span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Income {fmt(incomeTaxTotal)}</span></div>}
                  {propertyTaxTotal > 0 && <div style={{ display: "flex", alignItems: "center", gap: "5px" }}><div style={{ width: "7px", height: "7px", borderRadius: "2px", background: "#f59e0b", flexShrink: 0 }} /><span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Property {fmt(propertyTaxTotal)}</span></div>}
                  {investTaxTotal > 0 && <div style={{ display: "flex", alignItems: "center", gap: "5px" }}><div style={{ width: "7px", height: "7px", borderRadius: "2px", background: "#8b5cf6", flexShrink: 0 }} /><span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Investing {fmt(investTaxTotal)}</span></div>}
                </div>
              </div>
            )}

            {/* Secondary stat row — wraps on mobile */}
            <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" as const }}>
              {(stcgNet !== 0 || ltcgNet !== 0 || realizedLots.length > 0) && (
                <div>
                  <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "oklch(0.52 0.06 265)", margin: "0 0 2px" }}>Short-Term</p>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: stcgNet > 0 ? "var(--red)" : stcgNet < 0 ? "var(--green)" : "var(--text-muted)", margin: 0 }}>{stcgNet !== 0 ? (stcgNet > 0 ? "+" : "") + fmt(stcgNet) : "—"}</p>
                </div>
              )}
              {(stcgNet !== 0 || ltcgNet !== 0 || realizedLots.length > 0) && (
                <div>
                  <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "oklch(0.52 0.06 265)", margin: "0 0 2px" }}>Long-Term</p>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: ltcgNet > 0 ? "var(--red)" : ltcgNet < 0 ? "var(--green)" : "var(--text-muted)", margin: 0 }}>{ltcgNet !== 0 ? (ltcgNet > 0 ? "+" : "") + fmt(ltcgNet) : "—"}</p>
                </div>
              )}
              {washSaleWarnings.length > 0 && (
                <div>
                  <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "oklch(0.52 0.06 265)", margin: "0 0 2px" }}>Wash Sales</p>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: "#f59e0b", margin: 0 }}>{washSaleWarnings.length}</p>
                </div>
              )}
              {totalTLHAvailable < 0 && (
                <div>
                  <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "oklch(0.52 0.06 265)", margin: "0 0 2px" }}>TLH Available</p>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: "var(--green)", margin: 0 }}>{fmt(Math.abs(totalTLHAvailable))}</p>
                </div>
              )}
              {dividendIncome > 0 && (
                <div>
                  <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "oklch(0.52 0.06 265)", margin: "0 0 2px" }}>Dividends</p>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: "var(--text-secondary)", margin: 0 }}>{fmt(Math.round(dividendIncome))}</p>
                </div>
              )}
            </div>

            {/* Pre-tax deductions note */}
            {(taxProfile?.preTaxDeductionsAnnual ?? 0) > 0 && (
              <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "10px 0 0", lineHeight: 1.5 }}>
                {fmt(taxProfile!.preTaxDeductionsAnnual)} in pre-tax contributions already reduce your taxable income
                {(taxProfile?.k401TraditionalAnnual ?? 0) > 0
                  ? `, including ${fmt(taxProfile!.k401TraditionalAnnual)} from your Traditional 401(k). Tune it on the Planning page.`
                  : "."}
              </p>
            )}
          </div>
        </div>

        {/* Pill tab switcher */}
        <div style={{ display: "flex", padding: "3px", background: "var(--bg-elevated)", borderRadius: "var(--radius-full)", marginBottom: "20px", border: "1px solid var(--border-subtle)", gap: "2px" }}>
          {TABS.map(t => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} style={{ flex: 1, padding: "6px 10px", fontSize: "11px", fontWeight: tab === t.id ? 700 : 500, background: tab === t.id ? "var(--brand-gradient)" : "transparent", border: "none", borderRadius: "var(--radius-full)", cursor: "pointer", color: tab === t.id ? "#fff" : "var(--text-tertiary)", transition: "all 0.15s ease", whiteSpace: "nowrap" as const, position: "relative" as const }}>
              {t.label}
              {t.id === "trades" && washSaleWarnings.length > 0 && (
                <span style={{ marginLeft: "4px", fontSize: "10px", padding: "0 5px", borderRadius: "var(--radius-full)", background: tab === t.id ? "rgba(255,255,255,0.25)" : "rgba(239,68,68,0.15)", color: tab === t.id ? "#fff" : "var(--red)" }}>{washSaleWarnings.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── YOUR TAX PICTURE ────────────────────────────────────────────────────── */}
        {tab === "picture" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

            {/* Setup prompt */}
            {!taxProfile && !quickAnnualIncome && (
              <div className="tax-card" style={{ padding: "14px 16px", background: "oklch(0.55 0.15 265 / 0.07)", border: "1px solid oklch(0.55 0.15 265 / 0.22)", borderRadius: "var(--radius-lg)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: "180px" }}>
                  <p style={{ fontSize: "12px", fontWeight: 600, color: "oklch(0.72 0.18 265)", margin: "0 0 3px" }}>Add your income for a full tax picture</p>
                  <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0 }}>Go to Planning → scroll to <strong style={{ color: "var(--text-secondary)" }}>Profile Settings</strong> → enter your <strong style={{ color: "var(--text-secondary)" }}>Gross Monthly Income</strong>, filing status, and state. Or use the bracket finder below.</p>
                </div>
                <Link href="/planning#profile-settings" style={{ fontSize: "11px", fontWeight: 600, color: "oklch(0.72 0.18 265)", textDecoration: "none", whiteSpace: "nowrap", padding: "6px 12px", borderRadius: "var(--radius-full)", border: "1px solid oklch(0.55 0.15 265 / 0.3)", background: "oklch(0.55 0.15 265 / 0.08)", alignSelf: "flex-start", minHeight: "32px", display: "flex", alignItems: "center" }}>
                  Go to Profile Settings →
                </Link>
              </div>
            )}
            {taxProfile && !taxProfile.grossMonthly && (
              <div className="tax-card" style={{ padding: "14px 16px", background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "var(--radius-lg)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: "180px" }}>
                  <p style={{ fontSize: "12px", fontWeight: 600, color: "#f59e0b", margin: "0 0 3px" }}>Add your gross salary to unlock income tax estimates</p>
                  <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0 }}>In Planning → <strong style={{ color: "var(--text-secondary)" }}>Profile Settings</strong>, enter your <strong style={{ color: "var(--text-secondary)" }}>Gross Monthly Income</strong> (pre-tax, before deductions). Your net override is for cash flow only.</p>
                </div>
                <Link href="/planning#profile-settings" style={{ fontSize: "11px", fontWeight: 600, color: "#f59e0b", textDecoration: "none", whiteSpace: "nowrap", padding: "6px 12px", borderRadius: "var(--radius-full)", border: "1px solid rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.08)", alignSelf: "flex-start", minHeight: "32px", display: "flex", alignItems: "center" }}>
                  Go to Profile Settings →
                </Link>
              </div>
            )}

            {/* ── INCOME TAX ── */}
            <SectionCard
              icon="💼"
              color="#0ea5a0"
              label="Income Tax"
              amount={incomeTaxTotal}
              sub={activeEstimate
                ? `${fmt(Math.round(grossAnnual))} salary · ${FILING_STATUS_LABELS[(taxProfile?.filingStatus ?? quickFilingStatus) as FilingStatus]}${taxProfile?.stateCode ? ` · ${taxProfile.stateCode}` : ""}${quickTaxEstimate ? " · quick estimate" : ""}`
                : "Add your income in Planning to see this"}
              defaultOpen={!!activeEstimate}
            >
              {!activeEstimate ? (
                <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>
                  Your income tax estimate requires your salary, filing status, and state. <Link href="/planning" style={{ color: "var(--brand-blue)", textDecoration: "none", fontWeight: 600 }}>Add it in Planning →</Link>
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {quickTaxEstimate && (
                    <div style={{ padding: "9px 12px", background: "rgba(14,165,160,0.06)", border: "1px solid rgba(14,165,160,0.18)", borderRadius: "var(--radius-md)" }}>
                      <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
                        Federal-only estimate based on your income entry below. No state tax included. <Link href="/planning" style={{ color: "var(--brand-blue)", textDecoration: "none", fontWeight: 600 }}>Save your profile in Planning →</Link> for a full estimate with state tax, deductions, and income type.
                      </p>
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "8px" }}>
                    {[
                      { label: "Federal income tax", value: activeEstimate.federalIncomeTax, sub: `${(activeEstimate.federalEffectiveRate * 100).toFixed(1)}% effective · ${Math.round(activeEstimate.federalMarginalRate * 100)}% marginal` },
                      { label: (taxProfile?.incomeType ?? "w2") === "w2" ? "FICA (payroll)" : "Self-employment tax", value: (taxProfile?.incomeType ?? "w2") === "w2" ? activeEstimate.ficaTax : activeEstimate.seTax, sub: (taxProfile?.incomeType ?? "w2") === "w2" ? "Social Security 6.2% + Medicare 1.45%" : "15.3% on net SE income" },
                      { label: `State tax${taxProfile?.stateCode ? ` (${taxProfile.stateCode})` : ""}`, value: activeEstimate.stateTax, sub: quickTaxEstimate ? "Not included in quick estimate" : `${(activeEstimate.stateEffectiveRate * 100).toFixed(1)}% effective` },
                    ].map(({ label, value, sub }) => (
                      <div key={label} style={{ padding: "10px 12px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
                        <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text-muted)", margin: "0 0 4px" }}>{label}</p>
                        <p style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 2px" }}>{fmt(Math.round(value))}</p>
                        <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: 0 }}>{sub}</p>
                      </div>
                    ))}
                  </div>

                  {(taxProfile?.incomeType ?? "w2") === "w2" ? (
                    <div style={{ padding: "10px 14px", background: "rgba(0,211,149,0.04)", border: "1px solid rgba(0,211,149,0.15)", borderRadius: "var(--radius-md)" }}>
                      <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.55 }}>
                        <strong style={{ color: "var(--green)" }}>Already handled.</strong> Your employer automatically withholds all of this from your paychecks and sends it to the IRS on your behalf. You don&apos;t need to make any additional payments for this portion.
                      </p>
                    </div>
                  ) : (
                    <div style={{ padding: "12px 14px", background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.18)", borderRadius: "var(--radius-md)" }}>
                      <p style={{ fontSize: "11px", fontWeight: 600, color: "#f59e0b", margin: "0 0 6px" }}>Quarterly estimated payments required</p>
                      <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" as const }}>
                        <div>
                          <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "0 0 2px" }}>Each quarter</p>
                          <p style={{ fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 700, color: "#f59e0b", margin: 0 }}>{fmt(Math.round(activeEstimate.totalTax / 4))}</p>
                        </div>
                        <div>
                          <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "0 0 2px" }}>Payment due dates</p>
                          <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0 }}>Apr 15 · Jun 16 · Sep 15 · Jan 15</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <LearnPanel title="What is FICA?" label="? What is FICA?">
                      <p style={{ margin: 0 }}>FICA stands for Federal Insurance Contributions Act. It&apos;s two separate taxes combined: Social Security (6.2% on wages up to $176,100) and Medicare (1.45% on all wages, plus an extra 0.9% above $200k). Your employer pays a matching 6.2% + 1.45% on top of what you pay — so it costs your employer more than your paycheck shows. For self-employed people, you pay both halves (15.3%) as the &quot;self-employment tax.&quot;</p>
                    </LearnPanel>
                    <LearnPanel title="What is the federal marginal rate?" label="? Marginal rate">
                      <p style={{ margin: 0 }}>The US uses a &quot;progressive&quot; tax system — different portions of your income are taxed at different rates. Your &quot;marginal rate&quot; (currently {Math.round((activeEstimate.federalMarginalRate ?? 0) * 100)}%) is the rate that applies to your last dollar earned. Your &quot;effective rate&quot; ({(activeEstimate.federalEffectiveRate * 100).toFixed(1)}%) is the overall average. The marginal rate matters most for decisions like whether to contribute more to a 401k — because each dollar you put in reduces taxes at your marginal rate.</p>
                    </LearnPanel>
                    {(taxProfile?.preTaxDeductionsAnnual ?? 0) > 0 && (
                      <LearnPanel title="How do pre-tax contributions help?" label="? Pre-tax contributions">
                        <p style={{ margin: 0 }}>Every dollar you put into a traditional 401k, 403b, or HSA comes directly off your taxable income before the IRS sees it. At your {Math.round((activeEstimate.federalMarginalRate ?? 0) * 100)}% federal rate, each $1,000 you contribute saves you roughly ${Math.round((activeEstimate.federalMarginalRate ?? 0) * 1000)} in taxes. Your current {fmt(taxProfile!.preTaxDeductionsAnnual)} in contributions is already reducing your taxable income — this estimate already accounts for it.</p>
                      </LearnPanel>
                    )}
                  </div>
                </div>
              )}
            </SectionCard>

            {/* ── BRACKET HEADROOM (Roth conversion / pre-tax / gain-harvest room) ── */}
            {headroom && <BracketHeadroomCard h={headroom} />}

            {/* ── ASSET LOCATION (tax-bucket diversification + guidance) ── */}
            {(data.accountBuckets.taxable.value + data.accountBuckets.deferred.value + data.accountBuckets.free.value) > 0 && (
              <AssetLocationCard buckets={data.accountBuckets} />
            )}

            {/* ── ROTH CONVERSION MODELER ── */}
            {headroom && <RothConversionModeler traditionalEstimate={data.traditionalEstimate} h={headroom} />}

            {/* ── PROPERTY TAX (homeowner only) ── */}
            {taxProfile?.isHomeowner && (
              <SectionCard
                icon="🏠"
                color="#f59e0b"
                label="Property Tax"
                amount={annualPropertyTax}
                sub={taxProfile.ownerHomeValue ? `${fmt(taxProfile.ownerHomeValue)} home · 1.1% national avg estimate` : "Home ownership detected"}
                defaultOpen={true}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <div style={{ padding: "10px 12px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
                      <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text-muted)", margin: "0 0 4px" }}>Annual property tax (est.)</p>
                      <p style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 2px" }}>{fmt(annualPropertyTax)}</p>
                      <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: 0 }}>{fmt(Math.round(annualPropertyTax / 12))}/mo · 1.1% of home value</p>
                    </div>
                    {annualMortgageInterest > 0 && (
                      <div style={{ padding: "10px 12px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
                        <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text-muted)", margin: "0 0 4px" }}>Mortgage interest (est.)</p>
                        <p style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 2px" }}>{fmt(annualMortgageInterest)}</p>
                        <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: 0 }}>{taxProfile.ownerInterestRate}% on {fmt(Math.round(taxProfile.ownerMortgageBalance ?? 0))} balance</p>
                      </div>
                    )}
                  </div>

                  <div style={{ padding: "10px 14px", background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: "var(--radius-md)" }}>
                    <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.55 }}>
                      <strong style={{ color: "#f59e0b" }}>Not withheld.</strong> Property taxes are billed separately by your county — usually twice a year or through your mortgage escrow account. If you have an escrow account, your lender already collects this monthly.
                    </p>
                  </div>

                  {estimatedItemized > stdDeduction && (
                    <div style={{ padding: "10px 14px", background: "rgba(0,211,149,0.04)", border: "1px solid rgba(0,211,149,0.15)", borderRadius: "var(--radius-md)" }}>
                      <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.55 }}>
                        <strong style={{ color: "var(--green)" }}>Potential deduction.</strong> Your mortgage interest and property taxes may let you &quot;itemize&quot; deductions on your federal return, which could save you {fmt(itemizingSaves)} compared to taking the standard deduction. See the Deductions section below.
                      </p>
                    </div>
                  )}

                  <LearnPanel title="How does the property tax deduction work?" label="? Property tax deduction">
                    <p style={{ margin: 0 }}>When you file your federal tax return, you choose between taking the &quot;standard deduction&quot; (a fixed dollar amount the IRS gives everyone) or listing your actual deductions (&quot;itemizing&quot;). As a homeowner, you can potentially deduct your mortgage interest AND property taxes. The catch: state + local taxes (including property tax) are capped at $10,000/year total — this is called the SALT limit. Many homeowners in high-cost areas find that itemizing still beats the standard deduction because the mortgage interest alone can exceed the standard amount.</p>
                  </LearnPanel>
                </div>
              </SectionCard>
            )}

            {/* ── INVESTMENT TAX ── */}
            <SectionCard
              icon="📈"
              color="#8b5cf6"
              label="Investment Taxes"
              amount={investTaxTotal}
              sub={realizedLots.length > 0 ? `${realizedLots.length} trade${realizedLots.length !== 1 ? "s" : ""} in ${selectedYear}${dividendIncome > 0 ? ` · ${fmt(Math.round(dividendIncome))} dividends` : ""}` : `No recorded trades in ${selectedYear}`}
              defaultOpen={realizedLots.length > 0 || dividendIncome > 0}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {realizedLots.length === 0 && dividendIncome === 0 ? (
                  <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>No recorded sales or dividends in {selectedYear}. Record transactions in your portfolio and they&apos;ll appear here.</p>
                ) : (
                  <>
                    {stcgNet !== 0 && (
                      <div style={{ padding: "10px 14px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                            <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Short-term profits</p>
                            <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "var(--radius-full)", background: "rgba(239,68,68,0.1)", color: "var(--red)", fontWeight: 600 }}>held &lt; 1 year</span>
                          </div>
                          <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: 0 }}>{stcgLots.length} sales · net {stcgNet >= 0 ? "+" : ""}{fmt(stcgNet)} · taxed at your ordinary income rate ({Math.round(cgStcgRate * 100)}%)</p>
                        </div>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 700, color: stcgNet > 0 ? "var(--red)" : "var(--green)", flexShrink: 0 }}>
                          {stcgNet > 0 ? fmt(Math.round(stcgNet * cgStcgRate)) : "—"}
                        </span>
                      </div>
                    )}
                    {ltcgNet !== 0 && (
                      <div style={{ padding: "10px 14px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                            <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Long-term profits</p>
                            <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "var(--radius-full)", background: "rgba(0,211,149,0.1)", color: "var(--green)", fontWeight: 600 }}>held &gt; 1 year</span>
                          </div>
                          <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: 0 }}>{ltcgLots.length} sales · net {ltcgNet >= 0 ? "+" : ""}{fmt(ltcgNet)} · lower {Math.round(cgLtcgRate * 100)}% rate{cgNiit ? " + 3.8% NIIT" : ""}</p>
                        </div>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 700, color: ltcgNet > 0 ? "var(--red)" : "var(--green)", flexShrink: 0 }}>
                          {ltcgNet > 0 ? fmt(Math.round(ltcgNet * (cgLtcgRate + (cgNiit ? 0.038 : 0)))) : "—"}
                        </span>
                      </div>
                    )}
                    {dividendIncome > 0 && (
                      <div style={{ padding: "10px 14px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                        <div>
                          <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 2px" }}>Dividend income</p>
                          <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: 0 }}>{fmt(Math.round(dividendIncome))} received · taxed at {Math.round(cgLtcgRate * 100)}% if qualified</p>
                        </div>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 700, color: "var(--red)", flexShrink: 0 }}>
                          {fmt(Math.round(dividendIncome * cgLtcgRate))}
                        </span>
                      </div>
                    )}
                    {unknownLots.length > 0 && (
                      <p style={{ fontSize: "11px", color: "#f59e0b", margin: 0 }}>
                        ⚠ {unknownLots.length} sale{unknownLots.length !== 1 ? "s" : ""}{" "}have no purchase date — they can&apos;t be classified. Pick purchase years in the My Trades tab to estimate the term.
                      </p>
                    )}
                    {taxProfile?.incomeType === "w2" && investTaxTotal > 1000 && (
                      <div style={{ padding: "10px 14px", background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.18)", borderRadius: "var(--radius-md)" }}>
                        <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.55 }}>
                          <strong style={{ color: "#f59e0b" }}>Action may be needed.</strong> This investment tax won&apos;t be automatically withheld from your W-2 paycheck. If this exceeds $1,000, the IRS may charge an underpayment penalty unless you make an estimated payment or adjust your W-4 withholding.
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* Bracket finder — only shown when no income profile */}
                {!incomeTaxEstimate && (
                  <div style={{ padding: "12px 14px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
                    <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 8px" }}>What&apos;s my tax bracket?</p>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" as const, marginBottom: "10px" }}>
                      <div style={{ flex: "1 1 160px" }}>
                        <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text-tertiary)", margin: "0 0 4px" }}>Annual income (gross)</p>
                        <input
                          type="number" min="0" step="1000"
                          value={quickAnnualIncome ?? ""}
                          onChange={e => setQuickAnnualIncome(Number(e.target.value) || null)}
                          placeholder="e.g. 85000"
                          style={{ width: "100%", padding: "6px 10px", background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: "12px", fontFamily: "var(--font-mono)", boxSizing: "border-box" as const }}
                        />
                      </div>
                      <div style={{ flex: "1 1 140px" }}>
                        <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text-tertiary)", margin: "0 0 4px" }}>Filing status</p>
                        <select
                          value={quickFilingStatus}
                          onChange={e => setQuickFilingStatus(e.target.value as FilingStatus)}
                          style={{ width: "100%", padding: "6px 10px", background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: "12px", boxSizing: "border-box" as const }}
                        >
                          <option value="single">Single</option>
                          <option value="married_filing_jointly">Married filing jointly</option>
                          <option value="head_of_household">Head of household</option>
                          <option value="married_filing_separately">Married filing separately</option>
                        </select>
                      </div>
                    </div>
                    {quickTaxEstimate && (
                      <div style={{ padding: "10px 12px", background: "oklch(0.55 0.15 265 / 0.08)", border: "1px solid oklch(0.55 0.15 265 / 0.2)", borderRadius: "var(--radius-sm)", marginBottom: "10px" }}>
                        <p style={{ fontSize: "12px", fontWeight: 600, color: "oklch(0.72 0.18 265)", margin: "0 0 4px" }}>
                          You&apos;re in the {Math.round(quickTaxEstimate.federalMarginalRate * 100)}% federal bracket
                        </p>
                        <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0 }}>
                          {Math.round(quickTaxEstimate.federalEffectiveRate * 100)}% effective rate · long-term gains taxed at {Math.round(cgLtcgRateResolved * 100)}%
                        </p>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" as const }}>
                      <div>
                        <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text-tertiary)", margin: "0 0 5px" }}>Short-term rate (ordinary income)</p>
                        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" as const }}>
                          {STCG_BRACKETS.map(b => {
                            const autoSelected = quickTaxEstimate && Math.round(quickTaxEstimate.federalMarginalRate * 100) === Math.round(b.rate * 100);
                            const manualSelected = !quickTaxEstimate && stcgRate === b.rate;
                            return (
                              <button key={b.label} type="button" onClick={() => { setStcgRate(b.rate); setQuickAnnualIncome(null); }} style={{ padding: "3px 9px", borderRadius: "var(--radius-full)", fontSize: "11px", cursor: "pointer", border: "1px solid", background: (autoSelected || manualSelected) ? "var(--brand-blue)" : "var(--bg-elevated)", borderColor: (autoSelected || manualSelected) ? "var(--brand-blue)" : "var(--border)", color: (autoSelected || manualSelected) ? "#fff" : "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{b.label}</button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text-tertiary)", margin: "0 0 5px" }}>Long-term rate</p>
                        <div style={{ display: "flex", gap: "4px" }}>
                          {LTCG_RATES.map(b => {
                            const autoSelected = quickTaxEstimate && Math.abs(cgLtcgRateResolved - b.rate) < 0.001;
                            const manualSelected = !quickTaxEstimate && ltcgRate === b.rate;
                            return (
                              <button key={b.label} type="button" onClick={() => { setLtcgRate(b.rate); setQuickAnnualIncome(null); }} style={{ padding: "3px 9px", borderRadius: "var(--radius-full)", fontSize: "11px", cursor: "pointer", border: "1px solid", background: (autoSelected || manualSelected) ? "var(--brand-blue)" : "var(--bg-elevated)", borderColor: (autoSelected || manualSelected) ? "var(--brand-blue)" : "var(--border)", color: (autoSelected || manualSelected) ? "#fff" : "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{b.label}</button>
                            );
                          })}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-end" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "7px", cursor: "pointer", fontSize: "11px", color: "var(--text-secondary)" }}>
                          <div style={{ width: "14px", height: "14px", borderRadius: "3px", border: `2px solid ${niitApplies ? "var(--brand-blue)" : "var(--border-strong)"}`, background: niitApplies ? "var(--brand-blue)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }} onClick={() => setNiitApplies(v => !v)}>
                            {niitApplies && <svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                          </div>
                          3.8% NIIT (income &gt; $200k)
                        </label>
                      </div>
                    </div>
                    <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "8px 0 0" }}>
                      Or <Link href="/planning" style={{ color: "var(--brand-blue)", textDecoration: "none" }}>set up your full income profile in Planning</Link> to auto-calculate everything.
                    </p>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <LearnPanel title="Why does it matter how long you hold a stock?" label="? Holding period">
                    <p style={{ margin: 0 }}>The IRS rewards patience. If you sell a stock after holding it for more than one year, you pay the &quot;long-term&quot; rate — 0%, 15%, or 20% depending on your income. If you sell before one year, the profit is treated like ordinary income and taxed at your regular bracket (up to 37%). That difference can be massive: a $20,000 gain at 22% costs $4,400; the same gain at 15% costs $3,000. Simply waiting can save you over $1,000 on a single trade.</p>
                  </LearnPanel>
                  <LearnPanel title="What are dividends and why are they taxed?" label="? Dividends">
                    <p style={{ margin: 0 }}>When a company makes profit, it sometimes shares that money with shareholders as a &quot;dividend.&quot; The IRS taxes this as income. &quot;Qualified dividends&quot; (from US companies you&apos;ve held for more than 60 days) get the lower long-term capital gains rate. &quot;Ordinary dividends&quot; get taxed at your regular income rate. Most dividends from ETFs and major US stocks are qualified.</p>
                  </LearnPanel>
                </div>
              </div>
            </SectionCard>

            {/* ── RETIREMENT CONTRIBUTIONS ── */}
            {data.retirementContributions.length > 0 && (
              <SectionCard
                icon="🏦"
                color="#8b5cf6"
                label={`Retirement Contributions — ${data.selectedYear}`}
                amount={data.retirementContributions.reduce((s, r) => s + r.contributed, 0)}
                sub="Cash you added to tax-advantaged accounts — not part of your capital-gains bill"
                defaultOpen={false}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {data.retirementContributions.map((r) => {
                    const pct = r.annualLimit ? Math.min(100, (r.contributed / r.annualLimit) * 100) : null;
                    const over = r.annualLimit != null && r.contributed > r.annualLimit;
                    return (
                      <div key={r.portfolioId} style={{ padding: "12px 14px", background: "var(--bg-elevated)", border: `1px solid ${over ? "rgba(239,68,68,0.3)" : "var(--border-subtle)"}`, borderRadius: "var(--radius-md)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px", marginBottom: "6px" }}>
                          <div>
                            <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 1px" }}>{r.portfolioName}</p>
                            <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: 0 }}>{r.accountLabel}{r.deductible ? " · contributions may be tax-deductible" : " · after-tax contributions"}</p>
                          </div>
                          <p style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 700, color: over ? "var(--red)" : "var(--text-primary)", margin: 0, whiteSpace: "nowrap" }}>{fmt(r.contributed)}</p>
                        </div>
                        {r.annualLimit != null && (
                          <>
                            <div style={{ height: "5px", borderRadius: "3px", background: "var(--bg-base)", overflow: "hidden", marginBottom: "4px" }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: over ? "var(--red)" : "#8b5cf6", borderRadius: "3px" }} />
                            </div>
                            <p style={{ fontSize: "10px", color: over ? "var(--red)" : "var(--text-muted)", margin: 0 }}>
                              {over
                                ? `Over the ${fmt(r.annualLimit)} annual limit — you may owe an excess-contribution penalty. Confirm with the IRS limits for your age/income.`
                                : `${fmt(r.contributed)} of ${fmt(r.annualLimit)} limit · ${fmt(Math.max(0, r.annualLimit - r.contributed))} room left`}
                            </p>
                          </>
                        )}
                      </div>
                    );
                  })}
                  <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "2px 0 0", lineHeight: 1.5 }}>
                    Tracked from cash deposits into your tax-advantaged portfolios. Limits shown are the standard under-50 figures — your actual limit depends on age and income. Roth contributions are after-tax (no deduction); Traditional IRA / 401(k) contributions may reduce taxable income.
                  </p>
                </div>
              </SectionCard>
            )}

            {/* ── DEDUCTIONS ── */}
            {incomeTaxEstimate && (
              <SectionCard
                icon="✂️"
                color="#10b981"
                label="Deductions — Are You Getting the Best Deal?"
                amount={null}
                sub={estimatedItemized > stdDeduction ? `Itemizing could save you ~${fmt(itemizingSaves)} vs standard deduction` : `Standard deduction of ${fmt(stdDeduction)} is likely your best option`}
                defaultOpen={itemizingSaves > 500}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <div style={{ padding: "12px 14px", background: estimatedItemized <= stdDeduction ? "rgba(0,211,149,0.06)" : "var(--bg-elevated)", border: `1px solid ${estimatedItemized <= stdDeduction ? "rgba(0,211,149,0.2)" : "var(--border-subtle)"}`, borderRadius: "var(--radius-md)" }}>
                      <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text-muted)", margin: "0 0 4px" }}>Standard deduction</p>
                      <p style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 3px" }}>{fmt(stdDeduction)}</p>
                      <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: 0 }}>Automatic — everyone gets this</p>
                      {estimatedItemized <= stdDeduction && <p style={{ fontSize: "10px", color: "var(--green)", margin: "4px 0 0", fontWeight: 600 }}>✓ Best for you</p>}
                    </div>
                    <div style={{ padding: "12px 14px", background: estimatedItemized > stdDeduction ? "rgba(0,211,149,0.06)" : "var(--bg-elevated)", border: `1px solid ${estimatedItemized > stdDeduction ? "rgba(0,211,149,0.2)" : "var(--border-subtle)"}`, borderRadius: "var(--radius-md)" }}>
                      <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text-muted)", margin: "0 0 4px" }}>Estimated itemized</p>
                      <p style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 3px" }}>{fmt(estimatedItemized)}</p>
                      <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: 0 }}>Mortgage interest + SALT cap</p>
                      {estimatedItemized > stdDeduction && <p style={{ fontSize: "10px", color: "var(--green)", margin: "4px 0 0", fontWeight: 600 }}>✓ Better for you</p>}
                    </div>
                  </div>

                  {estimatedItemized > 0 && (
                    <div style={{ padding: "10px 14px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", display: "flex", flexDirection: "column", gap: "6px" }}>
                      <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Your estimated itemized deductions:</p>
                      {annualMortgageInterest > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Mortgage interest</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-primary)" }}>{fmt(annualMortgageInterest)}</span>
                        </div>
                      )}
                      {saltCapped > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>SALT (state tax + property tax, capped at $10k)</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-primary)" }}>{fmt(saltCapped)}</span>
                        </div>
                      )}
                      <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "5px", display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-primary)" }}>Total</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, color: "var(--text-primary)" }}>{fmt(estimatedItemized)}</span>
                      </div>
                    </div>
                  )}

                  {itemizingSaves > 0 && (
                    <div style={{ padding: "10px 14px", background: "rgba(0,211,149,0.04)", border: "1px solid rgba(0,211,149,0.15)", borderRadius: "var(--radius-md)" }}>
                      <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.55 }}>
                        Based on your numbers, itemizing could reduce your federal taxes by approximately <strong style={{ color: "var(--green)" }}>{fmt(itemizingSaves)}</strong>. Talk to a CPA or use tax software — they can confirm with your actual numbers and find additional deductions we can&apos;t see (charitable donations, medical expenses, etc.).
                      </p>
                    </div>
                  )}

                  <LearnPanel title="What does 'itemizing deductions' mean?" label="? Itemizing deductions">
                    <p style={{ margin: 0 }}>When you file your taxes, you can reduce your taxable income in two ways. Option A: take the &quot;standard deduction&quot; — the IRS lets everyone deduct a fixed amount ($15,000 single / $30,000 married) from their income, no questions asked. Option B: &quot;itemize&quot; — list your actual qualifying expenses (mortgage interest, property taxes, charitable donations, certain medical expenses) and deduct the total instead. You can only pick one. If your itemized total is higher than the standard deduction, itemizing saves you money.</p>
                  </LearnPanel>
                  <LearnPanel title="What is the SALT cap?" label="? SALT cap">
                    <p style={{ margin: 0 }}>SALT stands for State And Local Taxes. The IRS lets you deduct what you pay in state income taxes and local property taxes — but only up to $10,000 total per year (for 2025). This cap has a big impact on people in high-tax states like California, New York, and New Jersey, where state income taxes alone can exceed $10,000. Before this cap was introduced in 2017, there was no limit on SALT deductions.</p>
                  </LearnPanel>
                </div>
              </SectionCard>
            )}

            {/* ── SMART MOVES ── */}
            {(tlhOpportunities.length > 0 || washSaleWarnings.length > 0 || (taxProfile?.incomeType === "w2" && investTaxTotal > 1000) || (taxProfile?.incomeType !== "w2" && incomeTaxEstimate)) && (
              <div className="tax-card" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 18px" }}>
                <p style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px", fontFamily: "var(--font-body)" }}>Your Action Plan</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                  {tlhOpportunities.length > 0 && (
                    <ActionItem
                      type="save"
                      text={`Harvest ${tlhOpportunities.length} losing position${tlhOpportunities.length !== 1 ? "s" : ""} before year-end`}
                      detail={`You could save approximately ${fmt(Math.round(potentialSavings))} in taxes by selling positions with total unrealized losses of ${fmt(totalTLHAvailable)}.`}
                      cta="View"
                      onCta={() => setTab("trades")}
                    />
                  )}
                  {washSaleWarnings.length > 0 && (
                    <ActionItem
                      type="warn"
                      text={`Review ${washSaleWarnings.length} potential wash sale violation${washSaleWarnings.length !== 1 ? "s" : ""}`}
                      detail="You may have bought back a stock too soon after selling it at a loss — the IRS could disallow those loss deductions."
                    />
                  )}
                  {taxProfile?.incomeType === "w2" && investTaxTotal > 1000 && (
                    <ActionItem
                      type="warn"
                      text="Adjust your W-4 withholding"
                      detail={`Your ${fmt(investTaxTotal)} investment tax bill won't be withheld automatically. File a new W-4 with your employer to increase withholding, or make a one-time estimated payment.`}
                    />
                  )}
                  {taxProfile?.incomeType !== "w2" && incomeTaxEstimate && (
                    <ActionItem
                      type="warn"
                      text="Make your next quarterly payment"
                      detail={`${fmt(Math.round(incomeTaxEstimate.totalTax / 4))} due each quarter. Missing payments triggers an IRS underpayment penalty. Dates: Apr 15 · Jun 16 · Sep 15 · Jan 15`}
                    />
                  )}
                  {(taxProfile?.preTaxDeductionsAnnual ?? 0) === 0 && activeEstimate && (() => {
                    const yearLimits = contributionLimits(selectedYear);
                    const limit401k = yearLimits.k401;
                    const limitHSA = yearLimits.hsaSelf;
                    const remaining401k = Math.max(0, limit401k - pretax401k);
                    const remainingHSA = Math.max(0, limitHSA - pretaxHSA);
                    const totalRemaining = remaining401k + remainingHSA;
                    const potentialSaving = Math.round(totalRemaining * activeEstimate.federalMarginalRate);
                    const mRate = Math.round(activeEstimate.federalMarginalRate * 100);
                    return (
                      <div style={{ padding: "12px 14px", background: "rgba(63,174,74,0.04)", border: "1px solid rgba(63,174,74,0.15)", borderRadius: "var(--radius-md)" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                          <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "oklch(0.62 0.15 260)", flexShrink: 0, marginTop: "5px" }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 2px", fontFamily: "var(--font-body)" }}>Consider maxing out pre-tax accounts</p>
                            <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: "0 0 10px", lineHeight: 1.5 }}>
                              At your {mRate}% marginal rate, each $1,000 contributed to a 401k or HSA reduces your tax bill by {fmt(mRate * 10)}. How much have you contributed so far this year?
                            </p>
                            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" as const, marginBottom: totalRemaining > 0 ? "10px" : "0" }}>
                              <div style={{ minWidth: "120px" }}>
                                <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" as const, color: "var(--text-muted)", marginBottom: "4px" }}>401k so far</div>
                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>$</span>
                                  <input
                                    type="number" min="0" max={limit401k} step="100"
                                    value={pretax401k || ""}
                                    placeholder="0"
                                    onChange={(e) => setPretax401k(Math.min(limit401k, Number(e.target.value) || 0))}
                                    style={{ width: "80px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "6px", padding: "4px 6px", fontSize: "12px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", outline: "none" }}
                                  />
                                  <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>/ {fmt(limit401k)}</span>
                                </div>
                              </div>
                              <div style={{ minWidth: "120px" }}>
                                <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" as const, color: "var(--text-muted)", marginBottom: "4px" }}>HSA so far</div>
                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>$</span>
                                  <input
                                    type="number" min="0" max={limitHSA} step="100"
                                    value={pretaxHSA || ""}
                                    placeholder="0"
                                    onChange={(e) => setPretaxHSA(Math.min(limitHSA, Number(e.target.value) || 0))}
                                    style={{ width: "80px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "6px", padding: "4px 6px", fontSize: "12px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", outline: "none" }}
                                  />
                                  <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>/ {fmt(limitHSA)}</span>
                                </div>
                              </div>
                            </div>
                            {totalRemaining > 0 && (
                              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" as const }}>
                                <div style={{ padding: "7px 10px", background: "rgba(63,174,74,0.08)", borderRadius: "var(--radius-md)", flex: 1, minWidth: "120px" }}>
                                  <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: "2px" }}>Remaining room</div>
                                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 700, color: "oklch(0.72 0.18 265)" }}>{fmt(totalRemaining)}</div>
                                  <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "1px" }}>
                                    {remaining401k > 0 && `401k ${fmt(remaining401k)}`}{remaining401k > 0 && remainingHSA > 0 && " · "}{remainingHSA > 0 && `HSA ${fmt(remainingHSA)}`}
                                  </div>
                                </div>
                                <div style={{ padding: "7px 10px", background: "rgba(0,211,149,0.06)", borderRadius: "var(--radius-md)", flex: 1, minWidth: "120px" }}>
                                  <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: "2px" }}>Potential tax savings</div>
                                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 700, color: "var(--green)" }}>{fmt(potentialSaving)}</div>
                                  <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "1px" }}>if you max out remaining</div>
                                </div>
                              </div>
                            )}
                            {totalRemaining === 0 && (
                              <p style={{ fontSize: "11px", color: "var(--green)", fontWeight: 600, margin: 0 }}>You&apos;ve maxed out both accounts. Great work.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  {itemizingSaves > 500 && (
                    <ActionItem
                      type="save"
                      text={`Consider itemizing deductions — potential ${fmt(itemizingSaves)} savings`}
                      detail="Your estimated mortgage interest + SALT deductions may exceed the standard deduction. Confirm with a CPA or tax software."
                    />
                  )}
                </div>
              </div>
            )}

            {disclaimer}
          </div>
        )}

        {/* ── MY TRADES ───────────────────────────────────────────────────────────── */}
        {tab === "trades" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

            {/* TLH section */}
            {tlhOpportunities.length > 0 && (
              <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
                <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-subtle)" }}>
                  <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 3px" }}>Positions You Could Sell to Save on Taxes</p>
                  <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0 }}>These holdings are below cost basis. Selling them &quot;harvests&quot; the loss to offset your gains. Wait 31+ days before buying back the same stock.</p>
                </div>
                <div style={{ padding: "10px 18px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {tlhOpportunities.map((opp) => (
                    <div key={`${opp.portfolioId}-${opp.ticker}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "10px 14px", background: "rgba(0,211,149,0.04)", border: "1px solid rgba(0,211,149,0.12)", borderRadius: "var(--radius-md)" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-primary)", fontSize: "13px" }}>{opp.ticker}</span>
                          {opp.companyName && <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{opp.companyName}</span>}
                        </div>
                        <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "2px 0 0" }}>{opp.shares.toLocaleString(undefined, { maximumFractionDigits: 2 })} shares · cost {fmt(opp.costBasis)}{opp.currentValue !== null ? ` · now ${fmt(opp.currentValue)}` : ""}</p>
                      </div>
                      <div style={{ textAlign: "right" as const }}>
                        <p style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color: "var(--red)", margin: 0 }}>{opp.unrealizedLoss !== null ? fmt(opp.unrealizedLoss) : "—"}</p>
                        <p style={{ fontSize: "10px", color: "var(--green)", margin: "2px 0 0" }}>saves ~{opp.unrealizedLoss !== null ? fmt(Math.abs(opp.unrealizedLoss) * cgStcgRate) : "—"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Wash sales */}
            {washSaleWarnings.length > 0 && (
              <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
                <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(239,68,68,0.2)" }}>
                  <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--red)", margin: "0 0 3px" }}>Wash Sale Warnings</p>
                  <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0 }}>You sold a stock at a loss and bought the same one back within 30 days. The IRS disallows those loss deductions under the &quot;wash sale&quot; rule.</p>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                    <thead>
                      <tr style={{ background: "rgba(239,68,68,0.04)" }}>
                        {["Stock", "Sold", "Bought Back", "Days Between", "Disallowed Loss"].map(h => (
                          <th key={h} style={{ padding: "8px 14px", textAlign: "left" as const, fontWeight: 600, color: "var(--text-tertiary)", fontSize: "10px", textTransform: "uppercase" as const, letterSpacing: "0.06em", borderBottom: "1px solid rgba(239,68,68,0.12)", whiteSpace: "nowrap" as const }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {washSaleWarnings.map((w, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <td style={{ padding: "8px 14px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--red)" }}>{w.ticker}</td>
                          <td style={{ padding: "8px 14px", color: "var(--text-secondary)", whiteSpace: "nowrap" as const }}>{fmtDate(w.sellDate)}</td>
                          <td style={{ padding: "8px 14px", color: "var(--text-secondary)", whiteSpace: "nowrap" as const }}>{fmtDate(w.rebuyDate)}</td>
                          <td style={{ padding: "8px 14px", fontFamily: "var(--font-mono)", color: w.daysBetween <= 7 ? "var(--red)" : "#f59e0b" }}>{w.daysBetween}d</td>
                          <td style={{ padding: "8px 14px", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--red)" }}>{w.disallowedLoss !== null ? fmt(w.disallowedLoss) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {unknownLots.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "10px 14px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "var(--radius-sm)" }}>
                <p style={{ fontSize: "11px", color: "#f59e0b", margin: 0 }}>
                  ⚠ {unknownLots.length} sale{unknownLots.length !== 1 ? "s are" : " is"} missing an acquisition date — use the &quot;yr?&quot; dropdown per row, or set them all at once below.
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Set all {unknownLots.length} to:</span>
                  <select
                    value={bulkAcqYear}
                    onChange={e => setBulkAcqYear(Number(e.target.value))}
                    style={{ padding: "3px 8px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: bulkAcqYear ? "var(--text-primary)" : "var(--text-muted)", fontSize: "11px", cursor: "pointer" }}
                  >
                    <option value={0}>pick year...</option>
                    {Array.from({ length: 12 }, (_, i) => selectedYear - i).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      if (!bulkAcqYear) return;
                      setLotAcqYears(prev => ({
                        ...prev,
                        ...Object.fromEntries(unknownLots.map(l => [l.id, bulkAcqYear])),
                      }));
                    }}
                    disabled={!bulkAcqYear}
                    style={{ padding: "3px 12px", fontSize: "11px", fontWeight: 600, background: bulkAcqYear ? "var(--brand-blue)" : "var(--bg-elevated)", color: bulkAcqYear ? "#fff" : "var(--text-muted)", border: "none", borderRadius: "var(--radius-sm)", cursor: bulkAcqYear ? "pointer" : "not-allowed", opacity: bulkAcqYear ? 1 : 0.5 }}
                  >
                    Set all
                  </button>
                </div>
              </div>
            )}

            {/* Realized G/L table */}
            <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" as const }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
                  <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Recorded Trades in {selectedYear}</p>
                  {tradesSaved && (
                    <span style={{ fontSize: "10px", color: "var(--green)", fontWeight: 600, opacity: 1, transition: "opacity 0.3s" }}>✓ Saved</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: "4px" }}>
                  {(["all", "gains", "losses"] as const).map(f => (
                    <button key={f} type="button" onClick={() => setRealizedFilter(f)} style={{ padding: "3px 10px", borderRadius: "var(--radius-full)", fontSize: "11px", cursor: "pointer", border: "1px solid", background: realizedFilter === f ? "var(--brand-blue)" : "var(--bg-elevated)", borderColor: realizedFilter === f ? "var(--brand-blue)" : "var(--border)", color: realizedFilter === f ? "#fff" : "var(--text-secondary)" }}>
                      {f === "all" ? "All" : f === "gains" ? "Gains" : "Losses"}
                    </button>
                  ))}
                </div>
              </div>
              {filteredLots.length === 0 ? (
                <div style={{ padding: "28px", textAlign: "center" as const }}>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "0 0 4px" }}>No {realizedFilter === "all" ? "trades" : realizedFilter} recorded in {selectedYear}</p>
                  <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0 }}>Add sell transactions in your portfolio to track your tax lots.</p>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                    <thead>
                      <tr style={{ background: "var(--bg-surface)" }}>
                        {["Stock", "Portfolio", "Sold", "Acquired", "Held", "Term", "Shares", "Cost Basis", "Proceeds", "Gain / Loss"].map(h => (
                          <th key={h} style={{ padding: "8px 12px", textAlign: "left" as const, fontWeight: 600, color: "var(--text-tertiary)", fontSize: "10px", textTransform: "uppercase" as const, letterSpacing: "0.06em", borderBottom: "1px solid var(--border-subtle)", whiteSpace: "nowrap" as const }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLots.map((lot, i) => (
                        <tr key={lot.id} style={{ borderBottom: "1px solid var(--border-subtle)", background: i % 2 === 0 ? "transparent" : "var(--bg-elevated)" }}>
                          <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-primary)" }}>{lot.ticker}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{lot.portfolioName}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-secondary)", whiteSpace: "nowrap" as const }}>{fmtDate(lot.soldAt)}</td>
                          <td style={{ padding: "8px 12px", color: "var(--text-secondary)", whiteSpace: "nowrap" as const }}>
                            {lot.acquiredAt ? fmtDate(lot.acquiredAt) : (
                              <select
                                value={lotAcqYears[lot.id] ?? ""}
                                onChange={e => {
                                  const y = Number(e.target.value);
                                  setLotAcqYears(prev => y ? { ...prev, [lot.id]: y } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== lot.id)));
                                }}
                                style={{ padding: "2px 6px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: lotAcqYears[lot.id] ? "var(--text-primary)" : "var(--text-muted)", fontSize: "11px", cursor: "pointer" }}
                              >
                                <option value="">yr?</option>
                                {Array.from({ length: 12 }, (_, i) => selectedYear - i).map(y => (
                                  <option key={y} value={y}>{y}</option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{lot.holdingDays !== null ? `${lot.holdingDays}d` : lotAcqYears[lot.id] ? `~${(selectedYear - lotAcqYears[lot.id]) * 365}d` : "—"}</td>
                          <td style={{ padding: "8px 12px" }}><TermBadge term={(effectiveLots.find(e => e.id === lot.id)?.termType ?? lot.termType)} /></td>
                          <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{lot.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                          <td style={{ padding: "6px 12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>$</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder={lot.costBasis > 0 ? lot.costBasis.toFixed(2) : "0.00"}
                                value={lotCostBasis[lot.id] !== undefined ? lotCostBasis[lot.id] : (lot.costBasis > 0 ? lot.costBasis.toFixed(2) : "")}
                                onChange={e => {
                                  const v = e.target.value;
                                  setLotCostBasis(prev => v === "" ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== lot.id)) : { ...prev, [lot.id]: Number(v) });
                                }}
                                style={{ width: "80px", padding: "2px 4px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: "11px" }}
                              />
                            </div>
                          </td>
                          <td style={{ padding: "6px 12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>$</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={lotProceeds[lot.id] !== undefined ? lotProceeds[lot.id] : lot.proceeds.toFixed(2)}
                                onChange={e => {
                                  const v = e.target.value;
                                  setLotProceeds(prev => v === "" ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== lot.id)) : { ...prev, [lot.id]: Number(v) });
                                }}
                                style={{ width: "80px", padding: "2px 4px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: "11px" }}
                              />
                            </div>
                          </td>
                          <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontWeight: 600, color: glColor(lot.gainLoss), whiteSpace: "nowrap" as const }}>{lot.gainLoss >= 0 ? "+" : ""}{fmt(lot.gainLoss)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: "var(--bg-surface)", borderTop: "2px solid var(--border)" }}>
                        <td colSpan={8} style={{ padding: "8px 12px", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text-tertiary)" }}>Total</td>
                        <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-primary)" }}>{fmtFull(filteredLots.reduce((s, l) => s + l.proceeds, 0))}</td>
                        <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: glColor(filteredLots.reduce((s, l) => s + l.gainLoss, 0)) }}>
                          {filteredLots.reduce((s, l) => s + l.gainLoss, 0) >= 0 ? "+" : ""}{fmt(filteredLots.reduce((s, l) => s + l.gainLoss, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {disclaimer}
          </div>
        )}

        {/* ── TAX RATES ────────────────────────────────────────────────────────────── */}
        {tab === "reference" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div className="bt-card" style={{ padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "6px" }}>
                <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Long-Term Capital Gains Rates</h2>
                <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>2025 reference — verify at IRS.gov for current year</span>
              </div>
              <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", minWidth: "440px" }}>
                <thead>
                  <tr style={{ background: "var(--bg-surface)" }}>
                    {["Rate", "Single Filers", "Married Filing Jointly", "Head of Household"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left" as const, fontWeight: 600, color: "var(--text-tertiary)", fontSize: "10px", textTransform: "uppercase" as const, letterSpacing: "0.06em", borderBottom: "1px solid var(--border-subtle)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[["0%","$0–$47,025","$0–$94,050","$0–$63,000"],["15%","$47,026–$518,900","$94,051–$583,750","$63,001–$551,350"],["20%","Over $518,900","Over $583,750","Over $551,350"],["+ 3.8% NIIT","Over $200,000","Over $250,000","Over $200,000"]].map(([r,s,m,h],i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: r.includes("NIIT") ? "#f59e0b" : "var(--brand-blue)" }}>{r}</td>
                      <td style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>{s}</td>
                      <td style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>{m}</td>
                      <td style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>{h}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
            <div className="bt-card" style={{ padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "6px" }}>
                <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Ordinary Income Rates (Short-Term Gains)</h2>
                <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>2025 reference</span>
              </div>
              <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", minWidth: "340px" }}>
                <thead>
                  <tr style={{ background: "var(--bg-surface)" }}>
                    {["Rate","Single","Married Filing Jointly"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left" as const, fontWeight: 600, color: "var(--text-tertiary)", fontSize: "10px", textTransform: "uppercase" as const, letterSpacing: "0.06em", borderBottom: "1px solid var(--border-subtle)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[["10%","$0–$11,925","$0–$23,850"],["12%","$11,926–$48,475","$23,851–$96,950"],["22%","$48,476–$103,350","$96,951–$206,700"],["24%","$103,351–$197,300","$206,701–$394,600"],["32%","$197,301–$250,525","$394,601–$501,050"],["35%","$250,526–$626,350","$501,051–$751,600"],["37%","Over $626,350","Over $751,600"]].map(([r,s,m],i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--brand-blue)" }}>{r}</td>
                      <td style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>{s}</td>
                      <td style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>{m}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
            <div className="bt-card" style={{ padding: "18px 20px" }}>
              <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "12px" }}>Key Rules to Know</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {[
                  { title: "Short-term vs long-term", body: "Hold a stock for more than 1 year to get the lower long-term rate (0/15/20%). Sell earlier and you pay your ordinary income rate (up to 37%). The difference is often 5–22 percentage points." },
                  { title: "$3,000 capital loss deduction", body: "If your net losses exceed gains, up to $3,000 can reduce your ordinary taxable income this year. Excess losses carry forward indefinitely with no expiration." },
                  { title: "Wash sale rule", body: "Sell at a loss and buy the same stock within 30 days — the IRS disallows the loss deduction. The loss isn't eliminated; it adds to the new shares' cost basis." },
                  { title: "NIIT — the surtax most people forget", body: "A 3.8% surtax on investment income applies when your total income exceeds $200k (single) or $250k (MFJ). It stacks on top of your capital gains rate." },
                  { title: "Qualified dividends", body: "Dividends from US companies held 60+ days are 'qualified' and get the lower capital gains rate. Unqualified dividends are taxed at your ordinary income rate." },
                  { title: "SALT deduction cap", body: "State income taxes + local property taxes are capped at a combined $10,000 deduction on your federal return. This hurts high-tax states like CA and NY most." },
                  { title: "Tax-advantaged accounts", body: "Gains inside a 401(k), IRA, or Roth IRA grow without triggering capital gains tax. Traditional accounts tax withdrawals as ordinary income; Roth withdrawals in retirement are completely tax-free." },
                ].map(({ title, body }) => (
                  <div key={title} style={{ padding: "11px 14px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)" }}>
                    <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px" }}>{title}</p>
                    <p style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>{body}</p>
                  </div>
                ))}
              </div>
            </div>
            {disclaimer}
          </div>
        )}
      </div>

      {/* ── Atlas FLOATING PANEL ── */}
      {finnPanelOpen && (
        <div style={{ position: "fixed", bottom: "80px", right: "12px", left: "12px", maxWidth: "480px", marginLeft: "auto", zIndex: 60 }}>
          <div className="finn-panel" style={{ background: "var(--card-bg)", border: "1px solid rgba(63,174,74,0.3)", borderRadius: "16px", overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(63,174,74,0.1)" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: "var(--brand-gradient)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="#fff"><path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 3a1 1 0 110 2 1 1 0 010-2zm1 9H9V9h2v5z" /></svg>
                </div>
                <div>
                  <p style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Atlas — Tax Analysis</p>
                  <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: 0 }}>AI-powered {selectedYear} tax strategy</p>
                </div>
              </div>
              <button type="button" onClick={() => setFinnPanelOpen(false)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "4px", display: "flex", alignItems: "center", borderRadius: "6px" }}>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" /></svg>
              </button>
            </div>
            <div style={{ padding: "14px 16px", maxHeight: "360px", overflowY: "auto" }}>
              {!finnOutput && !finnLoading && (
                <div style={{ textAlign: "center" as const, padding: "10px 0" }}>
                  <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "0 0 14px", lineHeight: 1.6 }}>
                    Atlas will analyze your income type, gains, and trading activity to write a personalized tax strategy.
                  </p>
                  <button type="button" onClick={runFinnAnalysis} style={{ fontSize: "12px", fontWeight: 600, color: "#fff", background: "var(--brand-gradient)", border: "none", borderRadius: "10px", padding: "9px 22px", cursor: "pointer", fontFamily: "var(--font-body)" }}>
                    Run analysis
                  </button>
                </div>
              )}
              {finnLoading && !finnOutput && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-muted)", fontSize: "12px", padding: "10px 0" }}>
                  <svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
                  Atlas is analyzing your tax situation…
                </div>
              )}
              {finnError && <p style={{ fontSize: "12px", color: "var(--red)", margin: "0 0 10px" }}>{finnError}</p>}
              {finnOutput && (
                <div>
                  {finnLoading && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", fontSize: "11px", marginBottom: "10px" }}>
                      <svg className="spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
                      Refreshing analysis…
                    </div>
                  )}
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.75, whiteSpace: "pre-wrap" as const, marginBottom: "12px" }}>
                    {finnOutput}
                  </div>
                  {!finnLoading && (
                    <button type="button" onClick={runFinnAnalysis} style={{ fontSize: "11px", fontWeight: 600, color: "oklch(0.65 0.15 260)", background: "rgba(63,174,74,0.08)", border: "1px solid rgba(63,174,74,0.25)", borderRadius: "8px", padding: "5px 14px", cursor: "pointer", fontFamily: "var(--font-body)" }}>
                      Re-run analysis
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Atlas FLOATING BUTTON ── */}
      <button
        type="button"
        onClick={() => setFinnPanelOpen(v => !v)}
        style={{ position: "fixed", bottom: "80px", right: "16px", zIndex: 61, display: "flex", alignItems: "center", gap: "7px", padding: "10px 18px", background: finnPanelOpen ? "oklch(0.22 0.05 265)" : "var(--brand-gradient)", border: finnPanelOpen ? "1px solid rgba(63,174,74,0.35)" : "none", borderRadius: "var(--radius-full)", color: "#fff", fontSize: "13px", fontWeight: 700, cursor: "pointer", boxShadow: finnPanelOpen ? "none" : "0 4px 20px rgba(14,165,160,0.5)", fontFamily: "var(--font-body)", whiteSpace: "nowrap" as const, transition: "all 0.15s ease" }}
      >
        {finnPanelOpen ? (
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 20 20" fill="#fff"><path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 3a1 1 0 110 2 1 1 0 010-2zm1 9H9V9h2v5z" /></svg>
        )}
        {finnPanelOpen ? "Close" : "Ask Atlas"}
        {finnOutput && !finnPanelOpen && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "rgba(255,255,255,0.7)", flexShrink: 0 }} />}
      </button>
    </>
  );
}

function TermBadge({ term }: { term: "short" | "long" | "unknown" }) {
  const s = { short: { bg: "rgba(239,68,68,0.1)", color: "var(--red)", label: "Short" }, long: { bg: "rgba(0,211,149,0.1)", color: "var(--green)", label: "Long" }, unknown: { bg: "var(--bg-elevated)", color: "var(--text-muted)", label: "?" } }[term];
  return <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", padding: "2px 7px", borderRadius: "var(--radius-full)", background: s.bg, color: s.color }}>{s.label}</span>;
}
