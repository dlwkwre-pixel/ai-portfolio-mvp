"use client";

export type HealthReport = {
  overall_score: number | null;
  headline: string | null;
  risk_assessment: string | null;
  concentration_analysis: string | null;
  gaps_and_weaknesses: string | null;
  strengths: string | null;
  suggested_focus: string | null;
};

function formatUpdated(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
    " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function HealthReportCard({ report, updatedAt }: { report: HealthReport; updatedAt?: string | null }) {
  if (report.overall_score === null) return null;
  const score = report.overall_score;
  const accent = score >= 70 ? "var(--green)" : score >= 50 ? "var(--amber)" : "var(--red)";
  const tintBg = score >= 70 ? "var(--green-bg)" : score >= 50 ? "var(--amber-bg)" : "var(--red-bg)";
  const tintBorder = score >= 70 ? "var(--green-border)" : score >= 50 ? "var(--amber-border)" : "var(--red-border)";
  const verdict = score >= 85 ? "Excellent" : score >= 70 ? "Solid" : score >= 50 ? "Needs attention" : score >= 25 ? "Fragile" : "High risk";
  const r = 26, circ = 2 * Math.PI * r, offset = circ - (score / 100) * circ;

  const tiles: { label: string; text: string | null; color: string; bg: string; border: string }[] = [
    { label: "Strengths", text: report.strengths, color: "var(--green)", bg: "var(--green-bg)", border: "var(--green-border)" },
    { label: "Gaps & weaknesses", text: report.gaps_and_weaknesses, color: "var(--amber)", bg: "var(--amber-bg)", border: "var(--amber-border)" },
    { label: "Concentration", text: report.concentration_analysis, color: "var(--text-secondary)", bg: "var(--card-bg)", border: "var(--card-border)" },
    { label: "Risk", text: report.risk_assessment, color: "var(--text-secondary)", bg: "var(--card-bg)", border: "var(--card-border)" },
  ];

  return (
    <div style={{ borderRadius: "var(--radius-lg)", border: "1px solid var(--card-border)", background: "var(--card-bg)", overflow: "hidden" }}>
      {/* Hero: gauge + verdict */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px", padding: "16px 18px", borderBottom: "1px solid var(--border-subtle)" }}>
        <div style={{ position: "relative", width: "64px", height: "64px", flexShrink: 0 }}>
          <svg width="64" height="64" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r={r} fill="none" stroke="var(--border)" strokeWidth="5" />
            <circle cx="32" cy="32" r={r} fill="none" stroke={accent} strokeWidth="5" strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={offset} transform="rotate(-90 32 32)"
              style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1)" }} />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>
            {score}
          </div>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>Portfolio Health</span>
            <span style={{ fontSize: "10px", fontWeight: 700, color: accent, background: tintBg, border: `1px solid ${tintBorder}`, padding: "1px 8px", borderRadius: "var(--radius-full)" }}>{verdict}</span>
          </div>
          {report.headline && (
            <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.4, margin: "4px 0 0" }}>{report.headline}</p>
          )}
          <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "3px 0 0" }}>
            {updatedAt ? `Last updated ${formatUpdated(updatedAt)} · ` : ""}Gemini cross-check · not advice
          </p>
        </div>
      </div>

      {/* Insight tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px", padding: "12px" }}>
        {tiles.filter(t => t.text).map(t => (
          <div key={t.label} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: "10px", padding: "10px 12px" }}>
            <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: t.color, margin: "0 0 4px" }}>{t.label}</p>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>{t.text}</p>
          </div>
        ))}
      </div>

      {/* Suggested focus — highlighted */}
      {report.suggested_focus && (
        <div style={{ margin: "0 12px 12px", padding: "11px 13px", borderRadius: "10px", background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)", display: "flex", gap: "9px", alignItems: "flex-start" }}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="var(--brand-blue)" style={{ flexShrink: 0, marginTop: "1px" }}><path d="M10 1a6 6 0 00-3.6 10.8c.4.3.6.7.6 1.2v.5a1 1 0 001 1h4a1 1 0 001-1v-.5c0-.5.2-.9.6-1.2A6 6 0 0010 1zM7.5 17a1 1 0 011-1h3a1 1 0 110 2h-3a1 1 0 01-1-1z" /></svg>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--brand-blue)", margin: "0 0 2px" }}>Focus next</p>
            <p style={{ fontSize: "12px", color: "var(--text-primary)", lineHeight: 1.5, margin: 0 }}>{report.suggested_focus}</p>
          </div>
        </div>
      )}
    </div>
  );
}
