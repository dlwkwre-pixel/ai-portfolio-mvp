// Template-based email builder — no LLM calls, no paid tokens

export type DigestTemplateData = {
  portfolioName: string;
  portfolioUrl: string;
  manageUrl: string;
  unsubscribeUrl: string;

  // Content sections — null means section disabled or data unavailable
  performance: {
    allTimeReturnPct: number | null;
    weekReturnPct: number | null;
    weekReturnAbs: number | null;
    totalValue: number | null;
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
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function retColor(pct: number | null): string {
  if (pct == null) return "#94a3b8";
  return pct >= 0 ? "#4ade80" : "#f87171";
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Needs attention";
}

function scoreColor(score: number): string {
  if (score >= 80) return "#4ade80";
  if (score >= 60) return "#a3e635";
  if (score >= 40) return "#fbbf24";
  return "#f87171";
}

// Inline bar using repeated block characters (works in all email clients)
function textBar(pct: number, maxPct: number, width = 14): string {
  const filled = Math.round((pct / Math.max(maxPct, 1)) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

export function buildDigestHtml(data: DigestTemplateData): string {
  const dateStr = fmtDate(data.sentAt);
  const hasAny = data.performance || data.holdings || data.earnings || data.aiScore;

  const BG = "#040d1a";
  const CARD = "#0d1a35";
  const CARD_INNER = "#0a1628";
  const BORDER = "#1e2d4a";
  const BORDER_LIGHT = "#162236";
  const TEXT = "#f0f4ff";
  const TEXT_MUTED = "#94a3b8";
  const TEXT_DIM = "#475569";
  const BLUE = "#2563eb";
  const BLUE_LIGHT = "#3b82f6";

  // ── Performance section ─────────────────────────────────────────────────────
  function perfSection(): string {
    if (!data.performance) return "";
    const p = data.performance;
    const atColor = retColor(p.allTimeReturnPct);
    const wkColor = retColor(p.weekReturnPct);

    return `
    <tr>
      <td style="padding:0 28px 4px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding:20px 0 12px 0;border-bottom:1px solid ${BORDER_LIGHT};">
              <span style="color:${BLUE_LIGHT};font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">Performance</span>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 0 0;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="50%" style="padding-right:8px;vertical-align:top;">
                    <div style="background-color:${CARD_INNER};border:1px solid ${BORDER};border-radius:8px;padding:14px 16px;">
                      <div style="color:${TEXT_DIM};font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">ALL-TIME RETURN</div>
                      <div style="color:${atColor};font-size:26px;font-weight:700;font-family:monospace;letter-spacing:-0.5px;">${p.allTimeReturnPct != null ? fmtPct(p.allTimeReturnPct) : "—"}</div>
                      ${p.totalValue != null ? `<div style="color:${TEXT_DIM};font-size:10px;margin-top:4px;">${fmt$(p.totalValue)} total</div>` : ""}
                    </div>
                  </td>
                  <td width="50%" style="padding-left:8px;vertical-align:top;">
                    <div style="background-color:${CARD_INNER};border:1px solid ${BORDER};border-radius:8px;padding:14px 16px;">
                      <div style="color:${TEXT_DIM};font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">THIS WEEK</div>
                      <div style="color:${wkColor};font-size:26px;font-weight:700;font-family:monospace;letter-spacing:-0.5px;">${p.weekReturnPct != null ? fmtPct(p.weekReturnPct) : "—"}</div>
                      ${p.weekReturnAbs != null ? `<div style="color:${TEXT_DIM};font-size:10px;margin-top:4px;">${p.weekReturnAbs >= 0 ? "+" : ""}${fmt$(p.weekReturnAbs)}</div>` : ""}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
  }

  // ── Holdings section ────────────────────────────────────────────────────────
  function holdingsSection(): string {
    if (!data.holdings || data.holdings.length === 0) return "";
    const maxAlloc = Math.max(...data.holdings.map((h) => h.allocation_pct ?? 0), 1);

    const rows = data.holdings
      .slice(0, 5)
      .map((h, i) => {
        const colors = ["#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981"];
        const col = colors[i % colors.length];
        const pct = h.allocation_pct ?? 0;
        const bar = h.allocation_pct != null ? textBar(pct, maxAlloc) : "";
        return `
        <tr>
          <td style="padding:7px 0;border-bottom:1px solid ${BORDER_LIGHT};">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="40" style="vertical-align:middle;">
                  <span style="color:${col};font-size:9px;font-weight:700;font-family:monospace;">${h.ticker}</span>
                </td>
                <td style="vertical-align:middle;padding:0 8px;">
                  <span style="color:${col};font-size:10px;font-family:monospace;letter-spacing:1px;">${bar}</span>
                </td>
                <td width="40" align="right" style="vertical-align:middle;">
                  <span style="color:${TEXT_DIM};font-size:10px;font-family:monospace;">${pct.toFixed(1)}%</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
      })
      .join("");

    return `
    <tr>
      <td style="padding:0 28px 4px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding:20px 0 12px 0;border-bottom:1px solid ${BORDER_LIGHT};">
              <span style="color:${BLUE_LIGHT};font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">Top Holdings</span>
            </td>
          </tr>
          <tr>
            <td style="padding-top:8px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${rows}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
  }

  // ── Earnings section ────────────────────────────────────────────────────────
  function earningsSection(): string {
    if (!data.earnings || data.earnings.length === 0) return "";

    const rows = data.earnings
      .slice(0, 5)
      .map((e) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid ${BORDER_LIGHT};">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:middle;">
                  <span style="color:${TEXT};font-size:12px;font-weight:600;">${e.ticker}</span>
                  ${e.company_name ? `<span style="color:${TEXT_MUTED};font-size:11px;margin-left:6px;">${e.company_name}</span>` : ""}
                </td>
                <td align="right" style="vertical-align:middle;">
                  <span style="color:${TEXT_DIM};font-size:11px;">${fmtDate(e.report_date)}</span>
                  ${e.estimate_eps != null ? `<span style="color:${TEXT_DIM};font-size:10px;margin-left:6px;">EPS est. $${e.estimate_eps.toFixed(2)}</span>` : ""}
                </td>
              </tr>
            </table>
          </td>
        </tr>`)
      .join("");

    return `
    <tr>
      <td style="padding:0 28px 4px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding:20px 0 12px 0;border-bottom:1px solid ${BORDER_LIGHT};">
              <span style="color:${BLUE_LIGHT};font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">Upcoming Earnings</span>
              <span style="color:${TEXT_DIM};font-size:10px;margin-left:6px;">next 7 days</span>
            </td>
          </tr>
          <tr>
            <td style="padding-top:4px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${rows}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
  }

  // ── AI Score section ────────────────────────────────────────────────────────
  function aiScoreSection(): string {
    if (!data.aiScore) return "";
    const s = data.aiScore;
    const col = scoreColor(s.score);
    const label = scoreLabel(s.score);
    const barFilled = Math.round((s.score / 100) * 20);
    const bar = "█".repeat(barFilled) + "░".repeat(20 - barFilled);

    return `
    <tr>
      <td style="padding:0 28px 4px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding:20px 0 12px 0;border-bottom:1px solid ${BORDER_LIGHT};">
              <span style="color:${BLUE_LIGHT};font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">AI Health Score</span>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 0 0;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <span style="color:${col};font-size:32px;font-weight:700;font-family:monospace;">${s.score}</span>
                    <span style="color:${TEXT_DIM};font-size:14px;font-family:monospace;">/100</span>
                    <span style="color:${col};font-size:12px;font-weight:500;margin-left:10px;">${label}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:8px;">
                    <span style="color:${col};font-size:11px;font-family:monospace;letter-spacing:1px;">${bar}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
  }

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
      <td align="center" style="padding:32px 16px 40px;">

        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:${CARD};border-radius:12px;border:1px solid ${BORDER};overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background-color:${CARD_INNER};padding:20px 28px;border-bottom:1px solid ${BORDER};">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <span style="color:${BLUE_LIGHT};font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;font-family:Helvetica Neue,Arial,sans-serif;">BuyTune</span>
                    <br>
                    <span style="color:${TEXT};font-size:20px;font-weight:700;letter-spacing:-0.3px;font-family:Helvetica Neue,Arial,sans-serif;">${data.portfolioName}</span>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="color:${TEXT_DIM};font-size:11px;font-family:Helvetica Neue,Arial,sans-serif;">${dateStr}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body wrapper: all sections share the same font -->
          <tr>
            <td style="font-family:Helvetica Neue,Arial,sans-serif;color:${TEXT};">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">

                ${hasAny ? [perfSection(), holdingsSection(), earningsSection(), aiScoreSection()].join("") : `
                <tr>
                  <td style="padding:32px 28px;text-align:center;color:${TEXT_MUTED};font-size:13px;">
                    No data available yet. Add holdings and run an AI analysis in BuyTune.
                  </td>
                </tr>`}

                <!-- CTA -->
                <tr>
                  <td style="padding:24px 28px 28px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="padding-bottom:20px;">
                          <a href="${data.portfolioUrl}" style="display:inline-block;background-color:${BLUE};color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:11px 24px;border-radius:8px;">View Full Portfolio &#8594;</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:${CARD_INNER};padding:16px 28px;border-top:1px solid ${BORDER};">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="color:${TEXT_DIM};font-size:10px;font-family:Helvetica Neue,Arial,sans-serif;line-height:1.6;">
                    You're receiving this because you enabled email digests for this portfolio.<br>
                    <a href="${data.manageUrl}" style="color:#334155;text-decoration:underline;">Manage settings</a>
                    &nbsp;&middot;&nbsp;
                    <a href="${data.unsubscribeUrl}" style="color:#334155;text-decoration:underline;">Unsubscribe this portfolio</a>
                    &nbsp;&middot;&nbsp;
                    <a href="https://buytune.io" style="color:#334155;text-decoration:underline;">buytune.io</a>
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
  if (performance?.allTimeReturnPct != null) {
    const sign = performance.allTimeReturnPct >= 0 ? "+" : "";
    return `${portfolioName} · ${sign}${performance.allTimeReturnPct.toFixed(1)}% all-time — BuyTune Digest`;
  }
  if (performance?.weekReturnPct != null) {
    const sign = performance.weekReturnPct >= 0 ? "+" : "";
    return `${portfolioName} · ${sign}${performance.weekReturnPct.toFixed(1)}% this week — BuyTune Digest`;
  }
  return `${portfolioName} — BuyTune Portfolio Digest`;
}
