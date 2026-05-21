import React from "react";
import {
  Document, Page, Text, View, StyleSheet, Font,
} from "@react-pdf/renderer";
import type { DigestTemplateData } from "./digest-template";

// Register fonts — use built-in Helvetica family (always available)
Font.registerHyphenationCallback((w) => [w]);

const NAVY  = "#0f1629";
const BLUE  = "#2563eb";
const GREEN = "#16a34a";
const RED   = "#dc2626";
const SLATE = "#475569";
const LIGHT = "#94a3b8";
const RULE  = "#e2e8f0";
const WHITE = "#ffffff";
const GOLD  = "#b45309";

const COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#d97706", "#059669"];

const s = StyleSheet.create({
  page: { backgroundColor: WHITE, paddingHorizontal: 44, paddingVertical: 40, fontFamily: "Helvetica" },

  // Header
  headerRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: NAVY },
  brand:        { fontSize: 7, fontFamily: "Helvetica-Bold", letterSpacing: 2, color: BLUE, textTransform: "uppercase", marginBottom: 4 },
  portfolioName:{ fontSize: 20, fontFamily: "Helvetica-Bold", color: NAVY, letterSpacing: -0.3 },
  dateText:     { fontSize: 9, color: SLATE, textAlign: "right" },

  // Section label
  sectionLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", letterSpacing: 1.5, color: GOLD, textTransform: "uppercase", marginBottom: 10, marginTop: 20 },

  // Performance
  perfRow:      { flexDirection: "row", gap: 10, marginBottom: 4 },
  perfCard:     { flex: 1, borderWidth: 1, borderColor: RULE, borderRadius: 6, padding: 14 },
  perfCardGreen:{ flex: 1, borderWidth: 1, borderColor: "#bbf7d0", borderRadius: 6, padding: 14, backgroundColor: "#f0fdf4" },
  perfCardRed:  { flex: 1, borderWidth: 1, borderColor: "#fecaca", borderRadius: 6, padding: 14, backgroundColor: "#fef2f2" },
  perfLabel:    { fontSize: 7, fontFamily: "Helvetica-Bold", letterSpacing: 1, color: LIGHT, textTransform: "uppercase", marginBottom: 6 },
  perfValue:    { fontSize: 24, fontFamily: "Helvetica-Bold", letterSpacing: -0.5 },
  perfSub:      { fontSize: 9, color: SLATE, marginTop: 4, fontFamily: "Helvetica" },

  // Holdings
  holdingRow:   { flexDirection: "row", alignItems: "center", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: RULE },
  holdingTicker:{ width: 44, fontSize: 10, fontFamily: "Helvetica-Bold" },
  holdingName:  { flex: 1, fontSize: 9, color: SLATE },
  holdingBar:   { width: 110, height: 6, borderRadius: 2, backgroundColor: "#f1f5f9", marginRight: 8 },
  holdingFill:  { height: 6, borderRadius: 2 },
  holdingPct:   { width: 36, fontSize: 10, fontFamily: "Helvetica-Bold", color: NAVY, textAlign: "right" },

  // Earnings
  earningsRow:  { flexDirection: "row", alignItems: "center", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: RULE },
  earTicker:    { width: 44, fontSize: 10, fontFamily: "Helvetica-Bold", color: BLUE },
  earName:      { flex: 1, fontSize: 9, color: SLATE },
  earDate:      { width: 80, fontSize: 9, color: SLATE, textAlign: "right" },
  earEps:       { width: 80, fontSize: 9, color: LIGHT, textAlign: "right" },

  // AI Score
  scoreRow:     { flexDirection: "row", alignItems: "center", gap: 16 },
  scoreNum:     { fontSize: 36, fontFamily: "Helvetica-Bold" },
  scoreDenom:   { fontSize: 14, color: LIGHT, marginTop: 2 },
  scoreLabel:   { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  scoreBarBg:   { height: 8, backgroundColor: "#f1f5f9", borderRadius: 4, marginTop: 10 },
  scoreBarFill: { height: 8, borderRadius: 4 },

  // Footer
  footer:       { position: "absolute", bottom: 28, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: RULE, paddingTop: 10 },
  footerText:   { fontSize: 8, color: LIGHT },
});

function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}
function fmt$(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
function perfCardStyle(pct: number | null) {
  if (pct == null) return s.perfCard;
  return pct >= 0 ? s.perfCardGreen : s.perfCardRed;
}
function perfColor(pct: number | null): string {
  if (pct == null) return SLATE;
  return pct >= 0 ? GREEN : RED;
}
function scoreColor(score: number): string {
  if (score >= 80) return GREEN;
  if (score >= 60) return "#65a30d";
  if (score >= 40) return "#d97706";
  return RED;
}
function scoreLabel(score: number): string {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Healthy";
  if (score >= 40) return "Fair";
  return "Needs Review";
}

export function PortfolioPDF({ data }: { data: DigestTemplateData }) {
  const dateStr = new Date(data.sentAt).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const p = data.performance;
  const maxAlloc = data.holdings
    ? Math.max(...data.holdings.map((h) => h.allocation_pct ?? 0), 1)
    : 1;

  return (
    <Document title={`${data.portfolioName} — BuyTune Investor Update`} author="BuyTune">
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.headerRow}>
          <View>
            <Text style={s.brand}>BuyTune · Investor Update</Text>
            <Text style={s.portfolioName}>{data.portfolioName}</Text>
          </View>
          <View>
            <Text style={s.dateText}>{dateStr}</Text>
          </View>
        </View>

        {/* Performance */}
        {p && (
          <View>
            <Text style={s.sectionLabel}>Performance Summary</Text>
            <View style={s.perfRow}>
              {/* Week */}
              <View style={perfCardStyle(p.weekReturnPct)}>
                <Text style={s.perfLabel}>This Week</Text>
                <Text style={[s.perfValue, { color: perfColor(p.weekReturnPct) }]}>
                  {p.weekReturnPct != null ? fmtPct(p.weekReturnPct) : "—"}
                </Text>
                {p.weekReturnAbs != null && (
                  <Text style={s.perfSub}>
                    {p.weekReturnAbs >= 0 ? "+" : ""}{fmt$(p.weekReturnAbs)}
                  </Text>
                )}
              </View>
              {/* All-time */}
              <View style={perfCardStyle(p.allTimeReturnPct)}>
                <Text style={s.perfLabel}>
                  {p.inceptionDate ? `Since ${fmtMonthYear(p.inceptionDate)}` : "All-Time"}
                </Text>
                <Text style={[s.perfValue, { color: perfColor(p.allTimeReturnPct) }]}>
                  {p.allTimeReturnPct != null ? fmtPct(p.allTimeReturnPct) : "—"}
                </Text>
                {p.totalValue != null && (
                  <Text style={s.perfSub}>{fmt$(p.totalValue)} total value</Text>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Holdings */}
        {data.holdings && data.holdings.length > 0 && (
          <View>
            <Text style={s.sectionLabel}>Portfolio Composition — Top Positions</Text>
            <View style={{ borderTopWidth: 1, borderTopColor: RULE }}>
              {data.holdings.slice(0, 8).map((h, i) => {
                const color = COLORS[i % COLORS.length];
                const pct = h.allocation_pct ?? 0;
                const barWidth = maxAlloc > 0 ? (pct / maxAlloc) * 110 : 0;
                return (
                  <View key={h.ticker} style={s.holdingRow}>
                    <Text style={[s.holdingTicker, { color }]}>{h.ticker}</Text>
                    <Text style={s.holdingName}>{h.company_name ?? ""}</Text>
                    <View style={s.holdingBar}>
                      <View style={[s.holdingFill, { width: barWidth, backgroundColor: color }]} />
                    </View>
                    <Text style={s.holdingPct}>{pct.toFixed(1)}%</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Earnings */}
        {data.earnings && data.earnings.length > 0 && (
          <View>
            <Text style={s.sectionLabel}>Upcoming Earnings — Next 7 Days</Text>
            <View style={{ borderTopWidth: 1, borderTopColor: RULE }}>
              {data.earnings.slice(0, 6).map((e) => (
                <View key={`${e.ticker}-${e.report_date}`} style={s.earningsRow}>
                  <Text style={s.earTicker}>{e.ticker}</Text>
                  <Text style={s.earName}>{e.company_name ?? e.ticker}</Text>
                  <Text style={s.earDate}>{fmtDate(e.report_date)}</Text>
                  <Text style={s.earEps}>
                    {e.estimate_eps != null ? `EPS est. $${e.estimate_eps.toFixed(2)}` : ""}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* AI Score */}
        {data.aiScore && (
          <View>
            <Text style={s.sectionLabel}>AI Portfolio Health Assessment</Text>
            <View style={{ borderWidth: 1, borderColor: RULE, borderRadius: 6, padding: 16 }}>
              <View style={s.scoreRow}>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}>
                  <Text style={[s.scoreNum, { color: scoreColor(data.aiScore.score) }]}>
                    {data.aiScore.score}
                  </Text>
                  <Text style={s.scoreDenom}>/100</Text>
                </View>
                <View>
                  <Text style={[s.scoreLabel, { color: scoreColor(data.aiScore.score) }]}>
                    {scoreLabel(data.aiScore.score)}
                  </Text>
                  <Text style={{ fontSize: 9, color: SLATE, maxWidth: 340 }}>
                    {data.aiScore.label}
                  </Text>
                </View>
              </View>
              <View style={s.scoreBarBg}>
                <View style={[s.scoreBarFill, {
                  width: `${data.aiScore.score}%`,
                  backgroundColor: scoreColor(data.aiScore.score),
                }]} />
              </View>
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>BuyTune · buytune.io</Text>
          <Text style={s.footerText}>{data.portfolioName} · Portfolio Digest</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          } />
        </View>

      </Page>
    </Document>
  );
}
