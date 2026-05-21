// Template-based email builder — no LLM calls, no paid tokens

export type DigestTemplateData = {
  portfolioName: string;
  portfolioUrl: string;
  reportUrl: string;
  manageUrl: string;
  unsubscribeUrl: string;

  // Content sections — null means section disabled or data unavailable
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

  sentAt: string; // ISO date
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
  if (pct == null) return "#94a3b8";
  return pct >= 0 ? "#22c55e" : "#ef4444";
}

function retBg(pct: number | null): string {
  if (pct == null) return "rgba(148,163,184,0.08)";
  return pct >= 0 ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)";
}

function retBorder(pct: number | null): string {
  if (pct == null) return "rgba(148,163,184,0.15)";
  return pct >= 0 ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)";
}

function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#84cc16";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Healthy";
  if (score >= 40) return "Fair";
  return "Needs Review";
}

function textBar(pct: number, maxPct: number, width = 16): string {
  const filled = Math.round((pct / Math.max(maxPct, 1)) * width);
  return "▓".repeat(Math.max(filled, 0)) + "░".repeat(Math.max(width - filled, 0));
}

const COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981"];

export function buildDigestHtml(data: DigestTemplateData): string {
  const dateStr = new Date(data.sentAt).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const BG      = "#070d1c";
  const CARD    = "#0c1628";
  const INNER   = "#091220";
  const BORDER  = "#1a2a45";
  const BORDER2 = "#132038";
  const WHITE   = "#ffffff";
  const MUTED   = "#7c93b0";
  const DIM     = "#3d5270";
  const BLUE    = "#3b82f6";
  const GOLD    = "#f59e0b";

  // ── Performance section ───────────────────────────────────────────────────
  function perfSection(): string {
    if (!data.performance) return "";
    const p = data.performance;
    const wkColor  = retColor(p.weekReturnPct);
    const atColor  = retColor(p.allTimeReturnPct);
    const wkBg     = retBg(p.weekReturnPct);
    const atBg     = retBg(p.allTimeReturnPct);
    const wkBorder = retBorder(p.weekReturnPct);
    const atBorder = retBorder(p.allTimeReturnPct);

    const totalFmt = p.totalValue != null ? fmt$(p.totalValue) : null;
    const sinceStr = p.inceptionDate ? `Since ${fmtMonthYear(p.inceptionDate)}` : "All-time";

    return `
    <tr><td style="padding:0 0 2px;">
      <!-- Section header -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding:28px 32px 16px;">
            <span style="font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${GOLD};font-family:Helvetica Neue,Arial,sans-serif;">Performance</span>
            ${totalFmt ? `<span style="float:right;font-size:13px;font-weight:700;color:${WHITE};font-family:'Courier New',Courier,monospace;">${totalFmt}</span>` : ""}
          </td>
        </tr>
      </table>
      <!-- Metric cards -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding:0 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <!-- Week card -->
                <td width="48%" style="vertical-align:top;padding-right:8px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0"
                    style="background-color:${wkBg};border:1px solid ${wkBorder};border-radius:8px;">
                    <tr><td style="padding:18px 20px;">
                      <div style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${DIM};font-family:Helvetica Neue,Arial,sans-serif;margin-bottom:10px;">THIS WEEK</div>
                      <div style="font-size:30px;font-weight:700;color:${wkColor};font-family:'Courier New',Courier,monospace;letter-spacing:-0.5px;line-height:1;">
                        ${p.weekReturnPct != null ? fmtPct(p.weekReturnPct) : "—"}
                      </div>
                      ${p.weekReturnAbs != null ? `<div style="font-size:11px;color:${MUTED};font-family:'Courier New',Courier,monospace;margin-top:6px;">${p.weekReturnAbs >= 0 ? "+" : ""}${fmt$(p.weekReturnAbs)}</div>` : ""}
                    </td></tr>
                  </table>
                </td>
                <!-- All-time card -->
                <td width="48%" style="vertical-align:top;padding-left:8px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0"
                    style="background-color:${atBg};border:1px solid ${atBorder};border-radius:8px;">
                    <tr><td style="padding:18px 20px;">
                      <div style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${DIM};font-family:Helvetica Neue,Arial,sans-serif;margin-bottom:10px;">${sinceStr.toUpperCase()}</div>
                      <div style="font-size:30px;font-weight:700;color:${atColor};font-family:'Courier New',Courier,monospace;letter-spacing:-0.5px;line-height:1;">
                        ${p.allTimeReturnPct != null ? fmtPct(p.allTimeReturnPct) : "—"}
                      </div>
                      ${totalFmt ? `<div style="font-size:11px;color:${MUTED};font-family:'Courier New',Courier,monospace;margin-top:6px;">${totalFmt} total value</div>` : ""}
                    </td></tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td></tr>`;
  }

  // ── Holdings section ──────────────────────────────────────────────────────
  function holdingsSection(): string {
    if (!data.holdings || data.holdings.length === 0) return "";
    const maxAlloc = Math.max(...data.holdings.map((h) => h.allocation_pct ?? 0), 1);

    const rows = data.holdings.slice(0, 5).map((h, i) => {
      const col = COLORS[i % COLORS.length];
      const pct = h.allocation_pct ?? 0;
      const bar = h.allocation_pct != null ? textBar(pct, maxAlloc, 18) : "";
      return `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid ${BORDER2};">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="52" style="vertical-align:middle;">
                <span style="font-size:11px;font-weight:700;color:${col};font-family:'Courier New',Courier,monospace;">${h.ticker}</span>
              </td>
              <td style="vertical-align:middle;padding:0 10px;">
                <div style="font-size:9px;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;margin-bottom:3px;white-space:nowrap;overflow:hidden;">${h.company_name ?? ""}</div>
                <span style="font-size:10px;color:${col};font-family:'Courier New',Courier,monospace;letter-spacing:1.5px;">${bar}</span>
              </td>
              <td width="44" align="right" style="vertical-align:middle;">
                <span style="font-size:11px;font-weight:700;color:${WHITE};font-family:'Courier New',Courier,monospace;">${pct.toFixed(1)}%</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    }).join("");

    return `
    <tr><td style="padding:0 0 2px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="padding:4px 32px 16px;">
          <div style="border-top:1px solid ${BORDER2};padding-top:24px;">
            <span style="font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${GOLD};font-family:Helvetica Neue,Arial,sans-serif;">Portfolio Composition</span>
          </div>
        </td></tr>
        <tr><td style="padding:0 32px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0"
            style="background-color:${INNER};border:1px solid ${BORDER};border-radius:8px;">
            <tr><td style="padding:8px 20px 4px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${rows}
              </table>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>`;
  }

  // ── Earnings section ──────────────────────────────────────────────────────
  function earningsSection(): string {
    if (!data.earnings || data.earnings.length === 0) return "";

    const rows = data.earnings.slice(0, 5).map((e) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${BORDER2};">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="52" style="vertical-align:middle;">
              <span style="font-size:11px;font-weight:700;color:${BLUE};font-family:'Courier New',Courier,monospace;">${e.ticker}</span>
            </td>
            <td style="vertical-align:middle;">
              <div style="font-size:11px;color:${WHITE};font-family:Helvetica Neue,Arial,sans-serif;">${e.company_name ?? e.ticker}</div>
            </td>
            <td align="right" style="vertical-align:middle;">
              <div style="font-size:11px;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;">${fmtDate(e.report_date)}</div>
              ${e.estimate_eps != null ? `<div style="font-size:10px;color:${DIM};font-family:'Courier New',Courier,monospace;margin-top:2px;">EPS est. $${e.estimate_eps.toFixed(2)}</div>` : ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>`).join("");

    return `
    <tr><td style="padding:0 0 2px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="padding:4px 32px 16px;">
          <div style="border-top:1px solid ${BORDER2};padding-top:24px;">
            <span style="font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${GOLD};font-family:Helvetica Neue,Arial,sans-serif;">Upcoming Earnings</span>
            <span style="font-size:9px;color:${DIM};font-family:Helvetica Neue,Arial,sans-serif;margin-left:8px;">NEXT 7 DAYS</span>
          </div>
        </td></tr>
        <tr><td style="padding:0 32px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0"
            style="background-color:${INNER};border:1px solid ${BORDER};border-radius:8px;">
            <tr><td style="padding:8px 20px 4px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${rows}
              </table>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>`;
  }

  // ── AI Score section ──────────────────────────────────────────────────────
  function aiScoreSection(): string {
    if (!data.aiScore) return "";
    const s = data.aiScore;
    const col = scoreColor(s.score);
    const label = scoreLabel(s.score);
    const barFilled = Math.round((s.score / 100) * 20);
    const bar = "▓".repeat(barFilled) + "░".repeat(20 - barFilled);

    return `
    <tr><td style="padding:0 0 2px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="padding:4px 32px 16px;">
          <div style="border-top:1px solid ${BORDER2};padding-top:24px;">
            <span style="font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${GOLD};font-family:Helvetica Neue,Arial,sans-serif;">AI Portfolio Health</span>
          </div>
        </td></tr>
        <tr><td style="padding:0 32px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0"
            style="background-color:${INNER};border:1px solid ${BORDER};border-radius:8px;">
            <tr><td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <span style="font-size:40px;font-weight:700;color:${col};font-family:'Courier New',Courier,monospace;line-height:1;">${s.score}</span>
                    <span style="font-size:16px;color:${DIM};font-family:'Courier New',Courier,monospace;">/100</span>
                    <span style="display:inline-block;margin-left:12px;font-size:13px;font-weight:700;color:${col};font-family:Helvetica Neue,Arial,sans-serif;vertical-align:middle;">${label}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:10px;">
                    <span style="font-size:12px;color:${col};font-family:'Courier New',Courier,monospace;letter-spacing:2px;">${bar}</span>
                  </td>
                </tr>
              </table>
            </td></tr>
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
  <meta name="color-scheme" content="dark">
  <title>BuyTune — ${data.portfolioName}</title>
</head>
<body style="margin:0;padding:0;background-color:${BG};-webkit-font-smoothing:antialiased;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BG}" style="background-color:${BG};">
  <tr>
    <td align="center" style="padding:36px 16px 48px;">

      <table width="600" cellpadding="0" cellspacing="0" border="0"
        style="max-width:600px;width:100%;background-color:${CARD};border-radius:12px;border:1px solid ${BORDER};overflow:hidden;">

        <!-- Top accent bar -->
        <tr>
          <td style="background:linear-gradient(90deg,#1e3a6e 0%,#1a2d5a 50%,#0f1e3d 100%);height:3px;font-size:0;line-height:0;">&nbsp;</td>
        </tr>

        <!-- Header -->
        <tr>
          <td style="padding:28px 32px 24px;border-bottom:1px solid ${BORDER};">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:top;">
                  <div style="font-size:9px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${BLUE};font-family:Helvetica Neue,Arial,sans-serif;margin-bottom:6px;">BUYTUNE · INVESTOR UPDATE</div>
                  <div style="font-size:22px;font-weight:700;color:${WHITE};font-family:Helvetica Neue,Arial,sans-serif;letter-spacing:-0.3px;line-height:1.2;">${data.portfolioName}</div>
                </td>
                <td align="right" style="vertical-align:top;">
                  <div style="font-size:10px;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;text-align:right;line-height:1.6;">
                    ${dateStr}
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="font-family:Helvetica Neue,Arial,sans-serif;color:${WHITE};">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">

              ${hasContent
                ? [perfSection(), holdingsSection(), earningsSection(), aiScoreSection()].join("")
                : `<tr><td style="padding:40px 32px;text-align:center;color:${MUTED};font-size:13px;font-family:Helvetica Neue,Arial,sans-serif;">
                    No data yet. Add holdings and run an AI analysis in BuyTune to populate your digest.
                  </td></tr>`
              }

              <!-- CTA row -->
              <tr>
                <td style="padding:8px 32px 32px;">
                  <div style="border-top:1px solid ${BORDER2};padding-top:24px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="padding-bottom:0;">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="padding-right:10px;">
                                <a href="${data.portfolioUrl}"
                                  style="display:inline-block;background-color:#1d4ed8;color:#ffffff;text-decoration:none;font-size:12px;font-weight:700;padding:11px 22px;border-radius:6px;font-family:Helvetica Neue,Arial,sans-serif;letter-spacing:0.02em;">
                                  VIEW PORTFOLIO &#8599;
                                </a>
                              </td>
                              <td>
                                <a href="${data.reportUrl}"
                                  style="display:inline-block;background-color:transparent;color:${MUTED};text-decoration:none;font-size:12px;font-weight:600;padding:10px 22px;border-radius:6px;border:1px solid ${BORDER};font-family:Helvetica Neue,Arial,sans-serif;letter-spacing:0.02em;">
                                  FULL REPORT &#8599;
                                </a>
                              </td>
                            </tr>
                          </table>
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
          <td style="background-color:${INNER};padding:16px 32px;border-top:1px solid ${BORDER};">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="color:${DIM};font-size:10px;font-family:Helvetica Neue,Arial,sans-serif;line-height:1.7;">
                  You're receiving this because you enabled email digests for this portfolio.&nbsp;&nbsp;
                  <a href="${data.manageUrl}" style="color:${DIM};text-decoration:underline;">Manage</a>
                  &nbsp;&middot;&nbsp;
                  <a href="${data.unsubscribeUrl}" style="color:${DIM};text-decoration:underline;">Unsubscribe</a>
                  &nbsp;&middot;&nbsp;
                  <a href="https://buytune.io" style="color:${DIM};text-decoration:underline;">buytune.io</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Bottom accent bar -->
        <tr>
          <td style="background:linear-gradient(90deg,#0f1e3d 0%,#1a2d5a 50%,#1e3a6e 100%);height:3px;font-size:0;line-height:0;">&nbsp;</td>
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
    const sign = performance.weekReturnPct >= 0 ? "+" : "";
    const direction = performance.weekReturnPct >= 0 ? "▲" : "▼";
    return `${direction} ${sign}${performance.weekReturnPct.toFixed(1)}% this week — ${portfolioName} Investor Update`;
  }
  if (performance?.totalValue != null) {
    return `${portfolioName} — Portfolio Update`;
  }
  return `${portfolioName} — BuyTune Investor Update`;
}
