"use client";

import { useMemo } from "react";
import type { BalanceSheetItem, NetWorthSnapshot } from "./planning-actions";
import { addBalanceSheetItem, deleteBalanceSheetItem } from "./planning-actions";
import {
  fmt, fmtFull,
  computeAssetBuckets, computeTaxBuckets, accountTypeTaxBucket, taxDiversificationInsight,
  computeBalanceFinnInsight, TAX_BUCKET_META,
  InfoTooltip, LineItemRow, AddItemRow,
  type PortfolioAccount,
} from "./planning-shared";

const LIAB_CAT_COLORS: Record<string, string> = {
  mortgage:        "oklch(0.65 0.18 195)",
  auto_loan:       "oklch(0.62 0.20 306)",
  student_loan:    "oklch(0.72 0.17 97)",
  credit_card:     "oklch(0.65 0.18 25)",
  personal_loan:   "oklch(0.60 0.18 55)",
  other_liability: "oklch(0.58 0.06 260)",
};
const LIAB_CAT_LABELS: Record<string, string> = {
  mortgage: "Mortgage", auto_loan: "Auto Loan", student_loan: "Student Loans",
  credit_card: "Credit Cards", personal_loan: "Personal Loan", other_liability: "Other",
};

export default function BalanceSheetOS({
  balanceItems, portfolioTotalValue, portfolioAccounts = [], effectiveExpenses, netWorthHistory, historicalValues = {}, isPrivate,
}: {
  balanceItems: BalanceSheetItem[];
  portfolioTotalValue: number;
  portfolioAccounts?: PortfolioAccount[];
  effectiveExpenses: number;
  netWorthHistory: NetWorthSnapshot[];
  historicalValues?: Record<string, number>; // item/portfolio id -> value ~1 month ago
  isPrivate: boolean;
}) {
  const ph = (v: string) => isPrivate ? "••••" : v;

  const assets      = balanceItems.filter(i => !i.is_liability);
  const liabilities = balanceItems.filter(i => i.is_liability);
  const manualAssets    = assets.reduce((s, i) => s + i.value, 0);
  const totalLiabilities = liabilities.reduce((s, i) => s + i.value, 0);
  const totalAssets = manualAssets + portfolioTotalValue;
  const netWorth    = totalAssets - totalLiabilities;
  const liquidAssets = assets.filter(i => i.category === "cash").reduce((s, i) => s + i.value, 0);
  const debtRatio   = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;
  const emergencyMonths = effectiveExpenses > 0 ? liquidAssets / effectiveExpenses : 0;

  const assetBuckets = useMemo(() => computeAssetBuckets(assets, portfolioTotalValue),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [manualAssets, portfolioTotalValue]);

  const taxBuckets = useMemo(() => computeTaxBuckets(assets, portfolioAccounts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [manualAssets, portfolioTotalValue, assets, portfolioAccounts]);

  const finnInsight = useMemo(() => computeBalanceFinnInsight({
    liquidAssets, totalAssets, totalLiabilities, netWorth, portfolioTotalValue, effectiveExpenses, assets, portfolioAccounts,
  }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liquidAssets, totalAssets, totalLiabilities, netWorth, portfolioTotalValue, effectiveExpenses, portfolioAccounts]);

  const liabBuckets = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of liabilities) map.set(l.category, (map.get(l.category) ?? 0) + l.value);
    return [...map.entries()].map(([cat, val]) => ({
      cat, val,
      label: LIAB_CAT_LABELS[cat] ?? "Other",
      color: LIAB_CAT_COLORS[cat] ?? "oklch(0.58 0.06 260)",
    })).sort((a, b) => b.val - a.val);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalLiabilities]);

  const efPct   = Math.min(100, (emergencyMonths / 6) * 100);
  const efColor = emergencyMonths >= 3 ? "oklch(0.72 0.19 145)" : emergencyMonths >= 1 ? "oklch(0.75 0.18 70)" : "oklch(0.65 0.18 25)";
  const drPct   = Math.min(100, (debtRatio / 60) * 100);
  const drColor = debtRatio < 20 ? "oklch(0.72 0.19 145)" : debtRatio < 40 ? "oklch(0.75 0.18 70)" : "oklch(0.65 0.18 25)";
  const nwColor = netWorth >= 0 ? "oklch(0.72 0.19 145)" : "oklch(0.65 0.18 25)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
      <style>{`
        @keyframes bso-in  { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bso-bar { from { transform: scaleX(0); } }
        .bso-z { animation: bso-in 0.4s cubic-bezier(0.16,1,0.3,1) both; }
        .bso-b { animation: bso-bar 0.85s cubic-bezier(0.22,1,0.36,1) both; transform-origin: left; }
        @media (max-width: 640px) { .bso-kpis { grid-template-columns: repeat(2,1fr) !important; } }
      `}</style>

      {/* Zone 1 — KPI Strip */}
      <div className="bso-z" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px 20px 16px", marginBottom: "10px", animationDelay: "0ms" }}>
        <div className="bso-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "16px 20px", marginBottom: totalAssets > 0 ? "16px" : 0 }}>
          {([
            { label: "Net Worth",    val: ph(fmt(netWorth)),         color: nwColor },
            { label: "Total Assets", val: ph(fmt(totalAssets)),      color: "oklch(0.72 0.19 145)" },
            { label: "Liabilities",  val: ph(fmt(totalLiabilities)), color: totalLiabilities > 0 ? "oklch(0.65 0.18 25)" : "var(--text-muted)" },
            { label: "Debt Ratio",   val: totalAssets > 0 ? `${debtRatio.toFixed(0)}%` : "—", color: drColor },
          ] as { label: string; val: string; color: string }[]).map(({ label, val, color }) => (
            <div key={label}>
              <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "5px" }}>{label}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 700, color, lineHeight: 1 }}>{val}</div>
            </div>
          ))}
        </div>
        {totalAssets > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {effectiveExpenses > 0 && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-tertiary)", fontFamily: "var(--font-body)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Emergency Fund</span>
                  <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>{isPrivate ? "••" : emergencyMonths.toFixed(1)}mo{emergencyMonths >= 3 ? " — on track" : " — target 3m"}</span>
                </div>
                <div style={{ position: "relative", height: "6px", borderRadius: "3px", background: "var(--surface-008)", overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: `${(1/6)*100}%`, top: 0, bottom: 0, width: "1px", background: "var(--surface-010)" }} />
                  <div style={{ position: "absolute", left: `${(3/6)*100}%`, top: 0, bottom: 0, width: "1px", background: "var(--surface-010)" }} />
                  <div className="bso-b" style={{ height: "100%", borderRadius: "3px", background: `linear-gradient(90deg, oklch(0.55 0.18 195), ${efColor})`, width: `${efPct}%` }} />
                </div>
              </div>
            )}
            {totalLiabilities > 0 && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-tertiary)", fontFamily: "var(--font-body)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Debt-to-Asset Ratio</span>
                  <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>Target: below 20%</span>
                </div>
                <div style={{ position: "relative", height: "6px", borderRadius: "3px", background: "var(--surface-008)", overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: `${(20/60)*100}%`, top: 0, bottom: 0, width: "1px", background: "var(--surface-010)" }} />
                  <div style={{ position: "absolute", left: `${(40/60)*100}%`, top: 0, bottom: 0, width: "1px", background: "var(--surface-010)" }} />
                  <div className="bso-b" style={{ height: "100%", borderRadius: "3px", background: `linear-gradient(90deg, ${drColor}, ${drColor})`, width: `${drPct}%`, animationDelay: "80ms" }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Atlas strip */}
      <div className="bso-z" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "11px 15px", marginBottom: "10px", animationDelay: "60ms", display: "flex", gap: "11px", alignItems: "flex-start" }}>
        <div style={{ flexShrink: 0, width: "24px", height: "24px", borderRadius: "50%", background: "rgba(63,174,74,0.12)", border: "1px solid rgba(63,174,74,0.25)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "1px" }}>
          <svg width="10" height="10" viewBox="0 0 20 20" fill="none"><path d="M10 2a7 7 0 014.83 12.01L14 17H6l-.83-2.99A7 7 0 0110 2z" fill="rgba(14,165,160,0.2)" stroke="oklch(0.65 0.18 195)" strokeWidth="1.5"/><path d="M8 17h4" stroke="oklch(0.65 0.18 195)" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "10px", fontWeight: 700, color: "oklch(0.65 0.18 195)", letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: "3px" }}>Atlas</div>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.6, margin: 0 }}>{finnInsight}</p>
        </div>
      </div>

      {/* Zone 2 — Asset Allocation + Liability Breakdown */}
      {(assetBuckets.length > 0 || liabBuckets.length > 0) && (
        <div className="bso-z" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "20px", marginBottom: "10px", animationDelay: "110ms" }}>
          {assetBuckets.length > 0 && (
            <div style={{ marginBottom: liabBuckets.length > 0 ? "20px" : 0 }}>
              <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "10px" }}>Asset Allocation</div>
              {(() => {
                const total = assetBuckets.reduce((s, b) => s + b.value, 0);
                return (
                  <>
                    <div style={{ height: "14px", borderRadius: "7px", overflow: "hidden", display: "flex", marginBottom: "12px" }}>
                      {assetBuckets.map(b => (
                        <div key={b.label} className="bso-b" style={{ flex: `0 0 ${(b.value / total) * 100}%`, background: b.color }} title={`${b.label}: ${fmt(b.value)}`} />
                      ))}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "5px 14px" }}>
                      {assetBuckets.map(b => (
                        <div key={b.label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: b.color, flexShrink: 0 }} />
                          <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>{b.label}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-tertiary)" }}>{ph(fmt(b.value))}</span>
                          <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>({total > 0 ? ((b.value / total) * 100).toFixed(0) : 0}%)</span>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
          {liabBuckets.length > 0 && (
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "10px" }}>Liability Breakdown</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                {liabBuckets.map((b, i) => {
                  const w = totalLiabilities > 0 ? (b.val / totalLiabilities) * 100 : 0;
                  return (
                    <div key={b.cat}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                        <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: b.color, flexShrink: 0 }} />
                        <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", flex: 1 }}>{b.label}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: b.color }}>{ph(fmt(b.val))}</span>
                        <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{w.toFixed(0)}%</span>
                      </div>
                      <div style={{ height: "4px", borderRadius: "2px", background: "var(--surface-006)" }}>
                        <div className="bso-b" style={{ height: "100%", borderRadius: "2px", background: b.color + "88", width: `${w}%`, animationDelay: `${110 + i * 40}ms` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Zone 2.5 — Tax Diversification (foundation for tax-aware retirement) */}
      {taxBuckets.total > 0 && (
        <div className="bso-z" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "20px", marginBottom: "10px", animationDelay: "130ms" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
            <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>Tax Diversification</span>
            <InfoTooltip text="Where your money sits across the three tax buckets. Having balances in each gives you levers to control how much income is taxable in retirement — and which accounts to draw from first. Tag accounts in the list below (or we infer it from the account type)." />
          </div>
          {(() => {
            const segs = ([
              ["taxable", taxBuckets.taxable] as const,
              ["tax_deferred", taxBuckets.tax_deferred] as const,
              ["tax_free", taxBuckets.tax_free] as const,
            ]).filter(([, v]) => v > 0);
            return (
              <>
                <div style={{ height: "14px", borderRadius: "7px", overflow: "hidden", display: "flex", marginBottom: "12px" }}>
                  {segs.map(([k, v]) => (
                    <div key={k} className="bso-b" style={{ flex: `0 0 ${(v / taxBuckets.total) * 100}%`, background: TAX_BUCKET_META[k].color }} title={`${TAX_BUCKET_META[k].label}: ${fmt(v)}`} />
                  ))}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px", marginBottom: "12px" }}>
                  {segs.map(([k, v]) => (
                    <div key={k} title={TAX_BUCKET_META[k].note} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: TAX_BUCKET_META[k].color, flexShrink: 0 }} />
                      <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>{TAX_BUCKET_META[k].label}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-tertiary)" }}>{ph(fmt(v))}</span>
                      <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>({((v / taxBuckets.total) * 100).toFixed(0)}%)</span>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.55, fontFamily: "var(--font-body)" }}>
                  {taxDiversificationInsight(taxBuckets)}
                </p>
              </>
            );
          })()}
        </div>
      )}

      {/* Portfolio auto-include notice */}
      {portfolioTotalValue > 0 && (
        <div className="bso-z" style={{ padding: "9px 14px", borderRadius: "var(--radius-md)", background: "var(--card-bg)", border: "1px solid var(--card-border)", fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", marginBottom: "10px", animationDelay: "140ms" }}>
          <strong style={{ color: "oklch(0.72 0.19 145)" }}>BuyTune portfolios sync automatically</strong> — each is listed in Assets below and classified by its account type (a Roth IRA counts as tax-free).
        </div>
      )}

      {/* Zone 3 — Lists + Net Worth */}
      <div className="bso-z" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "20px", animationDelay: "160ms" }}>
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>Assets</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "oklch(0.72 0.19 145)", fontWeight: 600 }}>{ph(fmt(totalAssets))}</span>
          </div>
          {/* Linked BuyTune portfolios — read-only, auto-valued, classified by account type */}
          {portfolioAccounts.filter((pa) => pa.value > 0).map((pa) => {
            const bucket = accountTypeTaxBucket(pa.account_type);
            const meta = TAX_BUCKET_META[bucket];
            const histVal = historicalValues[pa.id];
            // Portfolios are never liabilities — up is always good here, unlike LineItemRow's
            // is_liability-aware version of this same badge.
            const delta = histVal != null && histVal !== pa.value ? pa.value - histVal : null;
            const badge = delta === null ? null : {
              good: delta > 0,
              text: histVal! > 0 ? `${delta > 0 ? "▲" : "▼"} ${Math.abs((delta / histVal!) * 100).toFixed(0)}%` : `${delta > 0 ? "▲" : "▼"} ${fmt(Math.abs(delta))}`,
              title: `${fmtFull(histVal!)} 1 month ago → ${fmtFull(pa.value)} now`,
            };
            return (
              <div key={pa.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--green)", flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: "13px", color: "var(--text-primary)", fontFamily: "var(--font-body)", display: "flex", alignItems: "center", gap: "7px", minWidth: 0 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pa.name}</span>
                  <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--brand-blue)", background: "rgba(14,165,160,0.1)", border: "1px solid rgba(14,165,160,0.25)", padding: "1px 6px", borderRadius: "999px", flexShrink: 0, whiteSpace: "nowrap" }}>BuyTune{pa.account_type ? ` · ${pa.account_type}` : ""}</span>
                  <span title={meta.note} style={{ fontSize: "10px", fontWeight: 600, color: meta.color, background: `color-mix(in oklch, ${meta.color} 14%, transparent)`, border: `1px solid color-mix(in oklch, ${meta.color} 35%, transparent)`, padding: "1px 6px", borderRadius: "999px", flexShrink: 0, whiteSpace: "nowrap" }}>{meta.label}</span>
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--green)", fontWeight: 500 }}>{ph(fmtFull(pa.value))}</span>
                {badge && !isPrivate && (
                  <span title={badge.title} style={{ fontSize: "10px", fontFamily: "var(--font-mono)", fontWeight: 600, color: badge.good ? "var(--green)" : "var(--red)", whiteSpace: "nowrap", cursor: "help" }}>
                    {badge.text}
                  </span>
                )}
              </div>
            );
          })}
          {assets.map(item => <LineItemRow key={item.id} item={item} type="balance" onDelete={deleteBalanceSheetItem} isPrivate={isPrivate} historicalValue={historicalValues[item.id]} />)}
          <div style={{ marginTop: "10px" }}><AddItemRow type="balance" placeholder="e.g. Checking account" onAdd={addBalanceSheetItem} /></div>
        </div>
        <div style={{ marginBottom: "20px", paddingTop: "4px", borderTop: "1px solid var(--border-subtle)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", paddingTop: "16px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>Liabilities</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: totalLiabilities > 0 ? "oklch(0.65 0.18 25)" : "var(--text-muted)", fontWeight: 600 }}>{ph(fmt(totalLiabilities))}</span>
          </div>
          {liabilities.map(item => <LineItemRow key={item.id} item={item} type="balance" onDelete={deleteBalanceSheetItem} isPrivate={isPrivate} historicalValue={historicalValues[item.id]} />)}
          <div style={{ marginTop: "10px" }}><AddItemRow type="balance" sectionType="liability" placeholder="e.g. Student loan" onAdd={addBalanceSheetItem} /></div>
        </div>
        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "14px", color: "var(--text-primary)" }}>Net Worth</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 700, color: nwColor }}>{ph(fmt(netWorth))}</span>
        </div>
      </div>

    </div>
  );
}
