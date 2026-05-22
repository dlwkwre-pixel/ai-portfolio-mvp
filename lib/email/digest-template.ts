// Template-based email builder — no LLM calls, no paid tokens

export type DigestTemplateData = {
  portfolioName: string;
  portfolioUrl: string;
  reportUrl: string;
  manageUrl: string;
  unsubscribeUrl: string;

  performance: {
    allTimeReturnPct: number | null;
    weekReturnPct: number | null;
    weekReturnAbs: number | null;
    totalValue: number | null;
    inceptionDate: string | null;
  } | null;

  holdings: {
    ticker: string;
    company_name: string | null;
    allocation_pct: number | null;
  }[] | null;

  earnings: {
    ticker: string;
    company_name: string | null;
    report_date: string;
    estimate_eps: number | null;
  }[] | null;

  aiScore: {
    score: number;
    label: string;
  } | null;

  sentAt: string;
};

function fmt$(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtPct(n: number, showSign = true): string {
  const sign = showSign && n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function fmtMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function retColor(pct: number | null): string {
  if (pct == null) return "#64748b";
  return pct >= 0 ? "#16a34a" : "#dc2626";
}

function retBg(pct: number | null): string {
  if (pct == null) return "#f8fafc";
  return pct >= 0 ? "#f0fdf4" : "#fef2f2";
}

function retBorderColor(pct: number | null): string {
  if (pct == null) return "#e2e8f0";
  return pct >= 0 ? "#bbf7d0" : "#fecaca";
}

function scoreColor(score: number): string {
  if (score >= 80) return "#16a34a";
  if (score >= 60) return "#65a30d";
  if (score >= 40) return "#d97706";
  return "#dc2626";
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Healthy";
  if (score >= 40) return "Fair";
  return "Needs Review";
}

const COLORS = ["#1d4ed8", "#7c3aed", "#0891b2", "#b45309", "#059669"];

export function buildDigestHtml(data: DigestTemplateData): string {
  const dateStr = new Date(data.sentAt).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const BG     = "#f1f5f9";
  const CARD   = "#ffffff";
  const NAV    = "#0f1629";
  const NAV2   = "#1e2d4a";
  const RULE   = "#e2e8f0";
  const RULE2  = "#f1f5f9";
  const TEXT   = "#0f172a";
  const MUTED  = "#475569";
  const DIM    = "#94a3b8";
  const GOLD   = "#92400e";
  const GOLDBG = "#fef3c7";
  const BLUE   = "#1d4ed8";

  // ── Performance section ─────────────────────────────────────────────────────
  function perfSection(): string {
    if (!data.performance) return "";
    const p = data.performance;
    const sinceStr = p.inceptionDate ? `Since ${fmtMonthYear(p.inceptionDate)}` : "All-time";
    const totalFmt = p.totalValue != null ? fmt$(p.totalValue) : null;

    return `
    <tr><td style="padding:0 36px 28px;">
      <!-- Section label -->
      <div style="font-size:8px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${GOLD};background-color:${GOLDBG};display:inline-block;padding:3px 8px;border-radius:3px;font-family:Helvetica Neue,Arial,sans-serif;margin-bottom:14px;">Performance Summary</div>
      <!-- Metric grid -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <!-- Week -->
          <td width="48%" style="vertical-align:top;padding-right:8px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0"
              style="background-color:${retBg(p.weekReturnPct)};border:1px solid ${retBorderColor(p.weekReturnPct)};border-radius:8px;">
              <tr><td style="padding:18px 22px 16px;">
                <div style="font-size:9px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;margin-bottom:8px;">This Week</div>
                <div style="font-size:32px;font-weight:700;color:${retColor(p.weekReturnPct)};font-family:Georgia,Times New Roman,serif;letter-spacing:-0.5px;line-height:1;">
                  ${p.weekReturnPct != null ? fmtPct(p.weekReturnPct) : "&mdash;"}
                </div>
                ${p.weekReturnAbs != null ? `
                <div style="font-size:13px;color:${retColor(p.weekReturnAbs)};font-family:Helvetica Neue,Arial,sans-serif;margin-top:5px;font-weight:500;">
                  ${p.weekReturnAbs >= 0 ? "+" : ""}${fmt$(p.weekReturnAbs)} net change
                </div>` : ""}
              </td></tr>
            </table>
          </td>
          <!-- All-time -->
          <td width="48%" style="vertical-align:top;padding-left:8px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0"
              style="background-color:${retBg(p.allTimeReturnPct)};border:1px solid ${retBorderColor(p.allTimeReturnPct)};border-radius:8px;">
              <tr><td style="padding:18px 22px 16px;">
                <div style="font-size:9px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;margin-bottom:8px;">${sinceStr}</div>
                <div style="font-size:32px;font-weight:700;color:${retColor(p.allTimeReturnPct)};font-family:Georgia,Times New Roman,serif;letter-spacing:-0.5px;line-height:1;">
                  ${p.allTimeReturnPct != null ? fmtPct(p.allTimeReturnPct) : "&mdash;"}
                </div>
                ${totalFmt ? `
                <div style="font-size:13px;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;margin-top:5px;font-weight:500;">
                  ${totalFmt} portfolio value
                </div>` : ""}
              </td></tr>
            </table>
          </td>
        </tr>
      </table>
    </td></tr>`;
  }

  // ── Holdings section ────────────────────────────────────────────────────────
  function holdingsSection(): string {
    if (!data.holdings || data.holdings.length === 0) return "";
    const maxAlloc = Math.max(...data.holdings.map((h) => h.allocation_pct ?? 0), 1);

    const rows = data.holdings.slice(0, 6).map((h, i) => {
      const col   = COLORS[i % COLORS.length];
      const pct   = h.allocation_pct ?? 0;
      const barW  = h.allocation_pct != null ? Math.round((pct / maxAlloc) * 120) : 0;
      return `
      <tr>
        <td style="padding:11px 0;border-bottom:1px solid ${RULE2};">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="52" style="vertical-align:middle;">
                <span style="font-size:12px;font-weight:700;color:${col};font-family:Helvetica Neue,Arial,sans-serif;">${h.ticker}</span>
              </td>
              <td style="vertical-align:middle;padding:0 12px;">
                <div style="font-size:11px;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;margin-bottom:5px;">${h.company_name ?? ""}</div>
                ${h.allocation_pct != null ? `
                <table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:180px;">
                  <tr>
                    <td style="background-color:#e2e8f0;border-radius:2px;height:5px;padding:0;">
                      <table cellpadding="0" cellspacing="0" border="0" width="${barW}" style="width:${barW}px;max-width:100%;">
                        <tr><td style="background-color:${col};border-radius:2px;height:5px;font-size:0;line-height:0;">&nbsp;</td></tr>
                      </table>
                    </td>
                  </tr>
                </table>` : ""}
              </td>
              <td width="48" align="right" style="vertical-align:middle;">
                <span style="font-size:13px;font-weight:700;color:${TEXT};font-family:Helvetica Neue,Arial,sans-serif;">${pct.toFixed(1)}%</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    }).join("");

    return `
    <tr><td style="padding:0 36px 28px;">
      <div style="border-top:1px solid ${RULE};margin-bottom:16px;"></div>
      <div style="font-size:8px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${GOLD};background-color:${GOLDBG};display:inline-block;padding:3px 8px;border-radius:3px;font-family:Helvetica Neue,Arial,sans-serif;margin-bottom:14px;">Portfolio Composition</div>
      <div style="font-size:11px;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;margin-bottom:12px;">Top positions by allocation</div>
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
        style="border:1px solid ${RULE};border-radius:8px;overflow:hidden;">
        <tr><td style="padding:4px 20px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            ${rows}
          </table>
        </td></tr>
      </table>
    </td></tr>`;
  }

  // ── Earnings section ────────────────────────────────────────────────────────
  function earningsSection(): string {
    if (!data.earnings || data.earnings.length === 0) return "";

    const rows = data.earnings.slice(0, 5).map((e) => `
    <tr>
      <td style="padding:11px 0;border-bottom:1px solid ${RULE2};">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="60" style="vertical-align:top;padding-top:1px;">
              <span style="font-size:12px;font-weight:700;color:${BLUE};font-family:Helvetica Neue,Arial,sans-serif;">${e.ticker}</span>
            </td>
            <td style="vertical-align:top;">
              <div style="font-size:12px;color:${TEXT};font-family:Helvetica Neue,Arial,sans-serif;font-weight:500;">${e.company_name ?? e.ticker}</div>
              ${e.estimate_eps != null ? `<div style="font-size:11px;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;margin-top:2px;">Consensus EPS estimate: <strong>$${e.estimate_eps.toFixed(2)}</strong></div>` : ""}
            </td>
            <td width="80" align="right" style="vertical-align:top;padding-top:1px;">
              <div style="font-size:11px;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;font-weight:600;">${fmtDate(e.report_date)}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`).join("");

    return `
    <tr><td style="padding:0 36px 28px;">
      <div style="border-top:1px solid ${RULE};margin-bottom:16px;"></div>
      <div style="font-size:8px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${GOLD};background-color:${GOLDBG};display:inline-block;padding:3px 8px;border-radius:3px;font-family:Helvetica Neue,Arial,sans-serif;margin-bottom:6px;">Upcoming Earnings</div>
      <div style="font-size:11px;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;margin-bottom:12px;">Holdings reporting in the next 7 days</div>
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
        style="border:1px solid ${RULE};border-radius:8px;overflow:hidden;">
        <tr><td style="padding:4px 20px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            ${rows}
          </table>
        </td></tr>
      </table>
    </td></tr>`;
  }

  // ── AI Score section ────────────────────────────────────────────────────────
  function aiScoreSection(): string {
    if (!data.aiScore) return "";
    const sc   = data.aiScore;
    const col  = scoreColor(sc.score);
    const lbl  = scoreLabel(sc.score);
    const barW = Math.round((sc.score / 100) * 420);

    return `
    <tr><td style="padding:0 36px 28px;">
      <div style="border-top:1px solid ${RULE};margin-bottom:16px;"></div>
      <div style="font-size:8px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${GOLD};background-color:${GOLDBG};display:inline-block;padding:3px 8px;border-radius:3px;font-family:Helvetica Neue,Arial,sans-serif;margin-bottom:14px;">AI Portfolio Health Assessment</div>
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
        style="border:1px solid ${RULE};border-radius:8px;overflow:hidden;">
        <tr><td style="padding:22px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="80" style="vertical-align:middle;">
                <div style="font-size:44px;font-weight:700;color:${col};font-family:Georgia,Times New Roman,serif;line-height:1;">${sc.score}</div>
                <div style="font-size:11px;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;">out of 100</div>
              </td>
              <td style="vertical-align:middle;padding-left:20px;">
                <div style="font-size:16px;font-weight:700;color:${col};font-family:Helvetica Neue,Arial,sans-serif;margin-bottom:4px;">${lbl}</div>
                <div style="font-size:12px;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;line-height:1.5;max-width:300px;">${sc.label.length > 120 ? sc.label.slice(0, 120) + "…" : sc.label}</div>
              </td>
            </tr>
          </table>
          <!-- Progress bar -->
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:14px;">
            <tr>
              <td style="background-color:#e2e8f0;border-radius:4px;height:8px;padding:0;">
                <table cellpadding="0" cellspacing="0" border="0" width="${barW}" style="width:${barW}px;max-width:100%;">
                  <tr><td style="background-color:${col};border-radius:4px;height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
                </table>
              </td>
            </tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;">
            <tr>
              <td style="font-size:9px;color:${DIM};font-family:Helvetica Neue,Arial,sans-serif;">0</td>
              <td align="center" style="font-size:9px;color:${DIM};font-family:Helvetica Neue,Arial,sans-serif;">50</td>
              <td align="right" style="font-size:9px;color:${DIM};font-family:Helvetica Neue,Arial,sans-serif;">100</td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td></tr>`;
  }

  const hasContent = data.performance || data.holdings || data.earnings || data.aiScore;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${data.portfolioName} — BuyTune Investor Update</title>
</head>
<body style="margin:0;padding:0;background-color:${BG};-webkit-font-smoothing:antialiased;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BG}" style="background-color:${BG};">
  <tr>
    <td align="center" style="padding:32px 16px 48px;">

      <table width="600" cellpadding="0" cellspacing="0" border="0"
        style="max-width:600px;width:100%;background-color:${CARD};border-radius:4px;overflow:hidden;border:1px solid ${RULE};">

        <!-- Navy header -->
        <tr>
          <td style="background-color:${NAV};padding:28px 36px 26px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:bottom;">
                  <div style="font-size:9px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:#7c9cc0;font-family:Helvetica Neue,Arial,sans-serif;margin-bottom:7px;">BuyTune &middot; Investor Update</div>
                  <div style="font-size:24px;font-weight:700;color:#ffffff;font-family:Georgia,Times New Roman,serif;letter-spacing:-0.2px;line-height:1.15;">${data.portfolioName}</div>
                </td>
                <td align="right" style="vertical-align:bottom;">
                  <div style="font-size:10px;color:#7c9cc0;font-family:Helvetica Neue,Arial,sans-serif;text-align:right;line-height:1.7;">${dateStr}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Navy sub-bar -->
        <tr>
          <td style="background-color:${NAV2};padding:10px 36px;">
            <div style="font-size:10px;color:#7c9cc0;font-family:Helvetica Neue,Arial,sans-serif;">
              Weekly portfolio digest &nbsp;&middot;&nbsp; Prepared by BuyTune AI
            </div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding-top:28px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">

              ${hasContent
                ? [perfSection(), holdingsSection(), earningsSection(), aiScoreSection()].join("")
                : `<tr><td style="padding:40px 36px;text-align:center;color:${MUTED};font-size:13px;font-family:Helvetica Neue,Arial,sans-serif;">
                    No data available. Add holdings and run an AI analysis to populate your digest.
                  </td></tr>`
              }

              <!-- CTA row -->
              <tr>
                <td style="padding:4px 36px 32px;">
                  <div style="border-top:1px solid ${RULE};padding-top:22px;">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding-right:10px;">
                          <a href="${data.portfolioUrl}"
                            style="display:inline-block;background-color:${NAV};color:#ffffff;text-decoration:none;font-size:12px;font-weight:600;padding:11px 24px;border-radius:4px;font-family:Helvetica Neue,Arial,sans-serif;letter-spacing:0.04em;">
                            View Portfolio &rsaquo;
                          </a>
                        </td>
                        <td>
                          <a href="${data.reportUrl}"
                            style="display:inline-block;background-color:transparent;color:${MUTED};text-decoration:none;font-size:12px;font-weight:600;padding:10px 24px;border-radius:4px;border:1px solid ${RULE};font-family:Helvetica Neue,Arial,sans-serif;letter-spacing:0.04em;">
                            Full Report &rsaquo;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </div>
                </td>
              </tr>

            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color:#f8fafc;padding:16px 36px;border-top:1px solid ${RULE};">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="color:${DIM};font-size:10px;font-family:Helvetica Neue,Arial,sans-serif;line-height:1.8;">
                  You're receiving this because you enabled email digests for this portfolio.
                  <br>
                  <a href="${data.manageUrl}" style="color:${DIM};text-decoration:underline;">Manage preferences</a>
                  &nbsp;&middot;&nbsp;
                  <a href="${data.unsubscribeUrl}" style="color:${DIM};text-decoration:underline;">Unsubscribe</a>
                  &nbsp;&middot;&nbsp;
                  <a href="https://buytuneio.vercel.app" style="color:${DIM};text-decoration:underline;">buytune.io</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>
</body>
</html>`;
}

export function buildDigestSubject(portfolioName: string, performance: DigestTemplateData["performance"]): string {
  if (performance?.weekReturnPct != null) {
    const sign      = performance.weekReturnPct >= 0 ? "+" : "";
    const direction = performance.weekReturnPct >= 0 ? "▲" : "▼";
    return `${direction} ${sign}${performance.weekReturnPct.toFixed(1)}% this week — ${portfolioName} Investor Update`;
  }
  if (performance?.totalValue != null) {
    return `${portfolioName} — Portfolio Update`;
  }
  return `${portfolioName} — BuyTune Investor Update`;
}
