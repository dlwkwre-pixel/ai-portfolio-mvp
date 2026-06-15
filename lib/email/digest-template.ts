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

  topMovers: {
    best: { ticker: string; change_pct: number } | null;
    worst: { ticker: string; change_pct: number } | null;
  } | null;

  benchmark: {
    symbol: string;
    portfolioPct: number;
    benchmarkPct: number;
  } | null;

  aiRecs: {
    count: number;
    items: { action: string; ticker: string }[];
  } | null;

  weekAhead: {
    lean: string;
    volatility: string;
    headline: string;
  } | null;

  news: {
    headline: string;
    source: string;
    url: string;
  }[] | null;

  transactions: {
    type: string;
    ticker: string;
    quantity: number;
    price: number;
  }[] | null;

  cash: {
    cashPct: number;
    cashValue: number;
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
  return pct >= 0 ? "#15803d" : "#b91c1c";
}

function scoreColor(score: number): string {
  if (score >= 80) return "#15803d";
  if (score >= 60) return "#4d7c0f";
  if (score >= 40) return "#b45309";
  return "#b91c1c";
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Healthy";
  if (score >= 40) return "Fair";
  return "Needs Review";
}

const COLORS = ["#1d4ed8", "#7c3aed", "#0e7490", "#92400e", "#166534"];

export function buildDigestHtml(data: DigestTemplateData): string {
  const dateStr = new Date(data.sentAt).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  const reportingPeriod = (() => {
    const d = new Date(data.sentAt);
    const weekAgo = new Date(d.getTime() - 7 * 24 * 60 * 60 * 1000);
    return `Week ending ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  })();

  // Design tokens — light mode hardcoded, dark mode overrides via <style>
  const NAV    = "#0d1f3c";
  const NAV2   = "#162540";
  const RULE   = "#dee2e8";
  const RULE2  = "#f0f2f5";
  const TEXT   = "#111827";
  const MUTED  = "#4b5563";
  const DIM    = "#9ca3af";
  const GOLD   = "#7c5501";
  const GOLDBG = "#fef9ee";
  const GOLDBORDER = "#fcd34d";
  const WHITE  = "#ffffff";
  const BGPAGE = "#eef0f3";

  // ── Performance section ─────────────────────────────────────────────────────
  function perfSection(): string {
    if (!data.performance) return "";
    const p = data.performance;
    const sinceLabel = p.inceptionDate ? `Since ${fmtMonthYear(p.inceptionDate)}` : "Inception";
    const totalFmt   = p.totalValue != null ? fmt$(p.totalValue) : "—";
    const wkFmt      = p.weekReturnPct != null ? fmtPct(p.weekReturnPct) : "—";
    const atFmt      = p.allTimeReturnPct != null ? fmtPct(p.allTimeReturnPct) : "—";
    const wkAbsFmt   = p.weekReturnAbs != null ? `${p.weekReturnAbs >= 0 ? "+" : ""}${fmt$(p.weekReturnAbs)}` : null;
    const wkColor    = retColor(p.weekReturnPct);
    const atColor    = retColor(p.allTimeReturnPct);

    return `
    <!-- Performance -->
    <tr><td style="padding:0 40px 32px;" class="mobile-pad">
      <div style="border-bottom:2px solid ${NAV};padding-bottom:8px;margin-bottom:20px;">
        <span style="font-size:9px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${NAV};font-family:Helvetica Neue,Arial,sans-serif;">Performance</span>
      </div>
      <!-- Metric row: 3 columns separated by vertical lines -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <!-- Portfolio Value -->
          <td width="32%" style="vertical-align:top;border-right:1px solid ${RULE};padding-right:24px;">
            <div style="font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;margin-bottom:8px;">Portfolio Value</div>
            <div style="font-size:28px;font-weight:700;color:${TEXT};font-family:Georgia,'Times New Roman',serif;letter-spacing:-0.5px;line-height:1;">${totalFmt}</div>
            <div style="font-size:11px;color:${DIM};font-family:Helvetica Neue,Arial,sans-serif;margin-top:6px;">Current NAV</div>
          </td>
          <!-- This Week -->
          <td width="34%" style="vertical-align:top;border-right:1px solid ${RULE};padding:0 24px;">
            <div style="font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;margin-bottom:8px;">This Week</div>
            <div style="font-size:28px;font-weight:700;color:${wkColor};font-family:Georgia,'Times New Roman',serif;letter-spacing:-0.5px;line-height:1;">${wkFmt}</div>
            ${wkAbsFmt ? `<div style="font-size:11px;color:${wkColor};font-family:Helvetica Neue,Arial,sans-serif;margin-top:6px;">${wkAbsFmt} absolute</div>` : `<div style="font-size:11px;color:${DIM};font-family:Helvetica Neue,Arial,sans-serif;margin-top:6px;">&nbsp;</div>`}
          </td>
          <!-- All-time -->
          <td width="34%" style="vertical-align:top;padding-left:24px;">
            <div style="font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;margin-bottom:8px;">${sinceLabel}</div>
            <div style="font-size:28px;font-weight:700;color:${atColor};font-family:Georgia,'Times New Roman',serif;letter-spacing:-0.5px;line-height:1;">${atFmt}</div>
            <div style="font-size:11px;color:${DIM};font-family:Helvetica Neue,Arial,sans-serif;margin-top:6px;">Total return</div>
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
      const col  = COLORS[i % COLORS.length];
      const pct  = h.allocation_pct ?? 0;
      // Bar expressed as % of a 200px container — use table-width trick
      const barW = h.allocation_pct != null ? Math.max(Math.round((pct / maxAlloc) * 100), 2) : 0;
      const rowBg = i % 2 === 0 ? WHITE : RULE2;
      return `
        <tr style="background-color:${rowBg};">
          <td style="padding:10px 16px 10px 0;width:52px;vertical-align:middle;">
            <span style="font-size:12px;font-weight:700;color:${col};font-family:Helvetica Neue,Arial,sans-serif;">${h.ticker}</span>
          </td>
          <td style="padding:10px 0;vertical-align:middle;">
            <div style="font-size:11px;color:${TEXT};font-family:Helvetica Neue,Arial,sans-serif;font-weight:500;margin-bottom:5px;">${h.company_name ?? h.ticker}</div>
            ${h.allocation_pct != null ? `
            <table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:160px;">
              <tr>
                <td style="background-color:#e5e7eb;border-radius:2px;height:4px;padding:0;">
                  <table cellpadding="0" cellspacing="0" border="0" style="width:${barW}%;max-width:100%;">
                    <tr><td style="background-color:${col};border-radius:2px;height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
                  </table>
                </td>
              </tr>
            </table>` : ""}
          </td>
          <td align="right" style="padding:10px 0 10px 16px;width:52px;vertical-align:middle;">
            <span style="font-size:13px;font-weight:700;color:${TEXT};font-family:Helvetica Neue,Arial,sans-serif;">${pct.toFixed(1)}%</span>
          </td>
        </tr>`;
    }).join("");

    return `
    <!-- Holdings -->
    <tr><td style="padding:0 40px 32px;" class="mobile-pad">
      <div style="border-bottom:2px solid ${NAV};padding-bottom:8px;margin-bottom:4px;">
        <span style="font-size:9px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${NAV};font-family:Helvetica Neue,Arial,sans-serif;">Portfolio Positions</span>
        <span style="float:right;font-size:9px;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;letter-spacing:0.04em;text-transform:uppercase;">Top holdings by weight</span>
      </div>
      <!-- Table header -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr style="border-bottom:1px solid ${RULE};">
          <td style="padding:8px 16px 8px 0;width:52px;">
            <span style="font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${DIM};font-family:Helvetica Neue,Arial,sans-serif;">Ticker</span>
          </td>
          <td style="padding:8px 0;">
            <span style="font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${DIM};font-family:Helvetica Neue,Arial,sans-serif;">Company</span>
          </td>
          <td align="right" style="padding:8px 0 8px 16px;width:52px;">
            <span style="font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${DIM};font-family:Helvetica Neue,Arial,sans-serif;">Weight</span>
          </td>
        </tr>
        ${rows}
      </table>
    </td></tr>`;
  }

  // ── Earnings section ────────────────────────────────────────────────────────
  function earningsSection(): string {
    if (!data.earnings || data.earnings.length === 0) return "";

    const rows = data.earnings.slice(0, 6).map((e, i) => {
      const rowBg = i % 2 === 0 ? WHITE : RULE2;
      return `
        <tr style="background-color:${rowBg};">
          <td style="padding:10px 16px 10px 0;width:60px;vertical-align:top;">
            <span style="font-size:12px;font-weight:700;color:${NAV};font-family:Helvetica Neue,Arial,sans-serif;">${e.ticker}</span>
          </td>
          <td style="padding:10px 0;vertical-align:top;">
            <div style="font-size:11px;color:${TEXT};font-family:Helvetica Neue,Arial,sans-serif;font-weight:500;">${e.company_name ?? e.ticker}</div>
            ${e.estimate_eps != null ? `<div style="font-size:10px;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;margin-top:3px;">Consensus EPS: <strong>$${e.estimate_eps.toFixed(2)}</strong></div>` : ""}
          </td>
          <td align="right" style="padding:10px 0 10px 16px;width:88px;vertical-align:top;">
            <div style="font-size:11px;color:${TEXT};font-family:Helvetica Neue,Arial,sans-serif;font-weight:500;">${fmtDate(e.report_date)}</div>
          </td>
        </tr>`;
    }).join("");

    return `
    <!-- Earnings -->
    <tr><td style="padding:0 40px 32px;" class="mobile-pad">
      <div style="border-bottom:2px solid ${NAV};padding-bottom:8px;margin-bottom:4px;">
        <span style="font-size:9px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${NAV};font-family:Helvetica Neue,Arial,sans-serif;">Upcoming Earnings</span>
        <span style="float:right;font-size:9px;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;letter-spacing:0.04em;text-transform:uppercase;">Next 7 days</span>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr style="border-bottom:1px solid ${RULE};">
          <td style="padding:8px 16px 8px 0;width:60px;">
            <span style="font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${DIM};font-family:Helvetica Neue,Arial,sans-serif;">Ticker</span>
          </td>
          <td style="padding:8px 0;">
            <span style="font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${DIM};font-family:Helvetica Neue,Arial,sans-serif;">Company</span>
          </td>
          <td align="right" style="padding:8px 0 8px 16px;width:88px;">
            <span style="font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${DIM};font-family:Helvetica Neue,Arial,sans-serif;">Reports</span>
          </td>
        </tr>
        ${rows}
      </table>
    </td></tr>`;
  }

  // ── AI Score section ────────────────────────────────────────────────────────
  function aiScoreSection(): string {
    if (!data.aiScore) return "";
    const sc  = data.aiScore;
    const col = scoreColor(sc.score);
    const lbl = scoreLabel(sc.score);

    // Score tier descriptions
    const tierNote = sc.score >= 80
      ? "Portfolio demonstrates strong diversification and risk-adjusted positioning."
      : sc.score >= 60
      ? "Portfolio is well-structured with room for minor optimization."
      : sc.score >= 40
      ? "Portfolio has notable concentration or risk factors warranting review."
      : "Portfolio requires attention — significant risk or concentration issues detected.";

    return `
    <!-- AI Health -->
    <tr><td style="padding:0 40px 32px;" class="mobile-pad">
      <div style="border-bottom:2px solid ${NAV};padding-bottom:8px;margin-bottom:20px;">
        <span style="font-size:9px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${NAV};font-family:Helvetica Neue,Arial,sans-serif;">AI Portfolio Assessment</span>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <!-- Score -->
          <td width="96" style="vertical-align:top;border-right:1px solid ${RULE};padding-right:24px;">
            <div style="font-size:44px;font-weight:700;color:${col};font-family:Georgia,'Times New Roman',serif;line-height:1;">${sc.score}</div>
            <div style="font-size:11px;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;margin-top:2px;">/100 &nbsp;·&nbsp; <strong style="color:${col};">${lbl}</strong></div>
            <!-- Score bar -->
            <table cellpadding="0" cellspacing="0" border="0" width="72" style="margin-top:12px;">
              <tr>
                <td style="background-color:#e5e7eb;border-radius:2px;height:6px;padding:0;">
                  <table cellpadding="0" cellspacing="0" border="0" style="width:${sc.score}%;max-width:100%;">
                    <tr><td style="background-color:${col};border-radius:2px;height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
          <!-- Commentary -->
          <td style="vertical-align:top;padding-left:24px;">
            <div style="font-size:11px;color:${TEXT};font-family:Helvetica Neue,Arial,sans-serif;line-height:1.65;margin-bottom:10px;">${tierNote}</div>
            <div style="font-size:11px;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;line-height:1.65;">${sc.label.length > 200 ? sc.label.slice(0, 200) + "…" : sc.label}</div>
          </td>
        </tr>
      </table>
    </td></tr>`;
  }

  // ── Section header helper ───────────────────────────────────────────────────
  function sectionHead(label: string, rightLabel?: string): string {
    return `
      <div style="border-bottom:2px solid ${NAV};padding-bottom:8px;margin-bottom:16px;">
        <span style="font-size:9px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${NAV};font-family:Helvetica Neue,Arial,sans-serif;">${label}</span>
        ${rightLabel ? `<span style="float:right;font-size:9px;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;letter-spacing:0.04em;text-transform:uppercase;">${rightLabel}</span>` : ""}
      </div>`;
  }

  // ── Top Movers ──────────────────────────────────────────────────────────────
  function topMoversSection(): string {
    if (!data.topMovers || (!data.topMovers.best && !data.topMovers.worst)) return "";
    const cell = (label: string, m: { ticker: string; change_pct: number } | null, isGain: boolean) => {
      if (!m) return `<td width="50%" style="vertical-align:top;padding:0 12px;">&nbsp;</td>`;
      const c = isGain ? "#15803d" : "#b91c1c";
      return `
        <td width="50%" style="vertical-align:top;padding:0 12px;">
          <div style="font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;margin-bottom:6px;">${label}</div>
          <div style="font-size:18px;font-weight:700;color:${TEXT};font-family:Helvetica Neue,Arial,sans-serif;">${m.ticker}</div>
          <div style="font-size:13px;font-weight:700;color:${c};font-family:Georgia,'Times New Roman',serif;margin-top:3px;">${m.change_pct >= 0 ? "+" : ""}${m.change_pct.toFixed(1)}%</div>
        </td>`;
    };
    return `
    <tr><td style="padding:0 40px 32px;" class="mobile-pad">
      ${sectionHead("This Week's Movers")}
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        ${cell("Top Gainer", data.topMovers.best, true)}
        ${cell("Biggest Drag", data.topMovers.worst, false)}
      </tr></table>
    </td></tr>`;
  }

  // ── Benchmark ───────────────────────────────────────────────────────────────
  function benchmarkSection(): string {
    if (!data.benchmark) return "";
    const b = data.benchmark;
    const diff = b.portfolioPct - b.benchmarkPct;
    const beat = diff >= 0;
    const verb = beat ? "ahead of" : "behind";
    return `
    <tr><td style="padding:0 40px 32px;" class="mobile-pad">
      ${sectionHead(`vs. ${b.symbol}`)}
      <div style="font-size:13px;color:${TEXT};font-family:Helvetica Neue,Arial,sans-serif;line-height:1.5;">
        Your portfolio is <strong style="color:${beat ? "#15803d" : "#b91c1c"};">${Math.abs(diff).toFixed(1)}% ${verb}</strong> the ${b.symbol} this week.
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;"><tr>
        <td width="50%" style="padding-right:12px;border-right:1px solid ${RULE};">
          <div style="font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;margin-bottom:6px;">Your Portfolio</div>
          <div style="font-size:20px;font-weight:700;color:${retColor(b.portfolioPct)};font-family:Georgia,serif;">${fmtPct(b.portfolioPct)}</div>
        </td>
        <td width="50%" style="padding-left:24px;">
          <div style="font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;margin-bottom:6px;">${b.symbol}</div>
          <div style="font-size:20px;font-weight:700;color:${retColor(b.benchmarkPct)};font-family:Georgia,serif;">${fmtPct(b.benchmarkPct)}</div>
        </td>
      </tr></table>
    </td></tr>`;
  }

  // ── Pending AI recommendations ──────────────────────────────────────────────
  function aiRecsSection(): string {
    if (!data.aiRecs || data.aiRecs.count === 0) return "";
    const rows = data.aiRecs.items.slice(0, 5).map((r, i) => {
      const rowBg = i % 2 === 0 ? WHITE : RULE2;
      const a = r.action.toUpperCase();
      const c = a.includes("BUY") || a === "ADD" ? "#15803d" : a === "SELL" || a === "TRIM" ? "#b91c1c" : NAV;
      return `
        <tr style="background-color:${rowBg};">
          <td style="padding:9px 16px 9px 0;width:64px;"><span style="font-size:11px;font-weight:700;color:${c};font-family:Helvetica Neue,Arial,sans-serif;text-transform:uppercase;">${a}</span></td>
          <td style="padding:9px 0;"><span style="font-size:12px;font-weight:600;color:${TEXT};font-family:Helvetica Neue,Arial,sans-serif;">${r.ticker}</span></td>
        </tr>`;
    }).join("");
    return `
    <tr><td style="padding:0 40px 32px;" class="mobile-pad">
      ${sectionHead("AI Recommendations", `${data.aiRecs.count} pending`)}
      <table width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
      <a href="${data.portfolioUrl}" style="display:inline-block;margin-top:12px;font-size:11px;font-weight:600;color:${NAV};font-family:Helvetica Neue,Arial,sans-serif;text-decoration:none;">Review in BuyTune →</a>
    </td></tr>`;
  }

  // ── Week Ahead ──────────────────────────────────────────────────────────────
  function weekAheadSection(): string {
    if (!data.weekAhead) return "";
    const w = data.weekAhead;
    const leanColor = w.lean === "Bullish" ? "#15803d" : w.lean === "Bearish" ? "#b91c1c" : "#b45309";
    return `
    <tr><td style="padding:0 40px 32px;" class="mobile-pad">
      ${sectionHead("The Week Ahead")}
      <div style="margin-bottom:10px;">
        <span style="display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${leanColor};background-color:${RULE2};padding:3px 10px;border-radius:3px;font-family:Helvetica Neue,Arial,sans-serif;">${w.lean}</span>
        <span style="font-size:11px;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;margin-left:8px;">${w.volatility} volatility expected</span>
      </div>
      <div style="font-size:13px;color:${TEXT};font-family:Helvetica Neue,Arial,sans-serif;line-height:1.55;">${w.headline}</div>
    </td></tr>`;
  }

  // ── News headlines ──────────────────────────────────────────────────────────
  function newsSection(): string {
    if (!data.news || data.news.length === 0) return "";
    const rows = data.news.slice(0, 4).map((n) => `
      <tr><td style="padding:8px 0;border-bottom:1px solid ${RULE2};">
        <a href="${n.url}" style="font-size:12px;color:${TEXT};font-family:Helvetica Neue,Arial,sans-serif;text-decoration:none;line-height:1.45;font-weight:500;">${n.headline}</a>
        <div style="font-size:10px;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;margin-top:3px;">${n.source}</div>
      </td></tr>`).join("");
    return `
    <tr><td style="padding:0 40px 32px;" class="mobile-pad">
      ${sectionHead("Top Headlines")}
      <table width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
    </td></tr>`;
  }

  // ── Transactions recap ──────────────────────────────────────────────────────
  function transactionsSection(): string {
    if (!data.transactions || data.transactions.length === 0) return "";
    const rows = data.transactions.slice(0, 8).map((t, i) => {
      const rowBg = i % 2 === 0 ? WHITE : RULE2;
      const a = t.type.toUpperCase();
      const c = a.includes("BUY") ? "#15803d" : a.includes("SELL") ? "#b91c1c" : NAV;
      return `
        <tr style="background-color:${rowBg};">
          <td style="padding:9px 16px 9px 0;width:54px;"><span style="font-size:11px;font-weight:700;color:${c};font-family:Helvetica Neue,Arial,sans-serif;text-transform:uppercase;">${a.replace("_", " ")}</span></td>
          <td style="padding:9px 0;"><span style="font-size:12px;font-weight:600;color:${TEXT};font-family:Helvetica Neue,Arial,sans-serif;">${t.ticker}</span></td>
          <td align="right" style="padding:9px 0 9px 16px;"><span style="font-size:11px;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;">${t.quantity} @ $${t.price.toFixed(2)}</span></td>
        </tr>`;
    }).join("");
    return `
    <tr><td style="padding:0 40px 32px;" class="mobile-pad">
      ${sectionHead("This Week's Activity")}
      <table width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
    </td></tr>`;
  }

  // ── Cash position ───────────────────────────────────────────────────────────
  function cashSection(): string {
    if (!data.cash) return "";
    const { cashPct, cashValue } = data.cash;
    const note = cashPct >= 25
      ? "A sizable cash position is dry powder for opportunities, but uninvested cash can be a drag in a rising market."
      : cashPct < 3
      ? "You are nearly fully invested, leaving little buffer to act on a dip without selling first."
      : "A balanced cash buffer for flexibility.";
    return `
    <tr><td style="padding:0 40px 32px;" class="mobile-pad">
      ${sectionHead("Cash Position")}
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="40%" style="vertical-align:top;">
          <div style="font-size:28px;font-weight:700;color:${TEXT};font-family:Georgia,serif;line-height:1;">${cashPct.toFixed(1)}%</div>
          <div style="font-size:11px;color:${DIM};font-family:Helvetica Neue,Arial,sans-serif;margin-top:6px;">${fmt$(cashValue)} in cash</div>
        </td>
        <td width="60%" style="vertical-align:top;padding-left:20px;">
          <div style="font-size:12px;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;line-height:1.5;">${note}</div>
        </td>
      </tr></table>
    </td></tr>`;
  }

  // ── No-data placeholder ─────────────────────────────────────────────────────
  function noDataSection(): string {
    return `
    <tr><td style="padding:36px 40px;" class="mobile-pad">
      <p style="font-size:13px;color:${MUTED};font-family:Helvetica Neue,Arial,sans-serif;text-align:center;margin:0;">
        No data available yet. Add holdings and run an AI analysis to populate your digest.
      </p>
    </td></tr>`;
  }

  const hasContent = data.performance || data.holdings || data.earnings || data.aiScore
    || data.topMovers || data.benchmark || data.aiRecs || data.weekAhead || data.news
    || data.transactions || data.cash;

  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light">
  <title>${data.portfolioName} — BuyTune Investor Update</title>
  <style>
    /* Force light mode in all clients that respect this */
    :root { color-scheme: light only; }
    body { background-color: ${BGPAGE} !important; }
    /* Override Gmail/Apple Mail dark mode injection */
    @media (prefers-color-scheme: dark) {
      body, .email-wrapper, .email-card, td, th, div, p, span, a {
        color-scheme: light !important;
        background-color: inherit !important;
      }
      .force-bg-page  { background-color: ${BGPAGE}  !important; }
      .force-bg-white { background-color: ${WHITE}   !important; }
      .force-bg-nav   { background-color: ${NAV}     !important; }
      .force-bg-nav2  { background-color: ${NAV2}    !important; }
      .force-bg-rule2 { background-color: ${RULE2}   !important; }
      .force-text     { color: ${TEXT}    !important; }
      .force-muted    { color: ${MUTED}   !important; }
      .force-dim      { color: ${DIM}     !important; }
      .force-white    { color: ${WHITE}   !important; }
      .force-nav      { color: ${NAV}     !important; }
    }
    @media only screen and (max-width: 620px) {
      .mobile-pad { padding-left: 20px !important; padding-right: 20px !important; }
      .mobile-hide { display: none !important; }
    }
  </style>
</head>
<body class="force-bg-page" style="margin:0;padding:0;background-color:${BGPAGE};-webkit-font-smoothing:antialiased;">
<table class="email-wrapper force-bg-page" width="100%" cellpadding="0" cellspacing="0" border="0"
  style="background-color:${BGPAGE};">
  <tr>
    <td align="center" style="padding:32px 16px 48px;">

      <table class="email-card force-bg-white" width="600" cellpadding="0" cellspacing="0" border="0"
        style="max-width:600px;width:100%;background-color:${WHITE};border:1px solid ${RULE};">

        <!-- ── LETTERHEAD HEADER ── -->
        <tr>
          <td class="force-bg-nav" style="background-color:${NAV};padding:30px 40px 26px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:bottom;">
                  <div class="force-dim" style="font-size:9px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:#8faac8;font-family:Helvetica Neue,Arial,sans-serif;margin-bottom:10px;">BuyTune Capital &nbsp;&middot;&nbsp; Investor Update</div>
                  <div class="force-white" style="font-size:26px;font-weight:700;color:${WHITE};font-family:Georgia,'Times New Roman',serif;letter-spacing:-0.3px;line-height:1.15;">${data.portfolioName}</div>
                </td>
                <td align="right" style="vertical-align:bottom;padding-left:20px;white-space:nowrap;">
                  <div class="force-dim" style="font-size:10px;color:#8faac8;font-family:Helvetica Neue,Arial,sans-serif;text-align:right;line-height:1.8;">${dateStr}<br>${reportingPeriod}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Navy sub-bar -->
        <tr>
          <td class="force-bg-nav2" style="background-color:${NAV2};padding:9px 40px;border-bottom:3px solid #c8a84b;">
            <div class="force-dim" style="font-size:10px;color:#8faac8;font-family:Helvetica Neue,Arial,sans-serif;letter-spacing:0.04em;">
              Confidential &nbsp;&middot;&nbsp; Prepared by BuyTune AI &nbsp;&middot;&nbsp; For authorized recipients only
            </div>
          </td>
        </tr>

        <!-- ── BODY ── -->
        <tr>
          <td class="force-bg-white" style="background-color:${WHITE};padding-top:32px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">

              ${hasContent
                ? [
                    perfSection(),
                    topMoversSection(),
                    benchmarkSection(),
                    holdingsSection(),
                    cashSection(),
                    transactionsSection(),
                    aiRecsSection(),
                    aiScoreSection(),
                    earningsSection(),
                    weekAheadSection(),
                    newsSection(),
                  ].join("")
                : noDataSection()
              }

              <!-- ── DIVIDER ── -->
              <tr><td style="padding:0 40px 24px;" class="mobile-pad">
                <div style="border-top:1px solid ${RULE};"></div>
              </td></tr>

              <!-- ── CTA BUTTONS ── -->
              <tr><td style="padding:0 40px 32px;" class="mobile-pad">
                <table cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding-right:12px;">
                      <a href="${data.portfolioUrl}"
                        style="display:inline-block;background-color:${NAV};color:${WHITE};text-decoration:none;font-size:11px;font-weight:700;padding:12px 28px;font-family:Helvetica Neue,Arial,sans-serif;letter-spacing:0.08em;text-transform:uppercase;">
                        View Portfolio &rsaquo;
                      </a>
                    </td>
                    <td>
                      <a href="${data.reportUrl}"
                        style="display:inline-block;background-color:${WHITE};color:${NAV};text-decoration:none;font-size:11px;font-weight:700;padding:11px 28px;font-family:Helvetica Neue,Arial,sans-serif;letter-spacing:0.08em;text-transform:uppercase;border:1px solid ${NAV};">
                        Full Report &rsaquo;
                      </a>
                    </td>
                  </tr>
                </table>
              </td></tr>

            </table>
          </td>
        </tr>

        <!-- ── FOOTER ── -->
        <tr>
          <td style="background-color:#f4f5f7;padding:16px 40px;border-top:1px solid ${RULE};">
            <div style="font-size:10px;color:${DIM};font-family:Helvetica Neue,Arial,sans-serif;line-height:1.8;">
              You are receiving this report because you have enabled email digests for this portfolio.
              <br>
              <a href="${data.manageUrl}" style="color:${DIM};text-decoration:underline;">Manage preferences</a>
              &nbsp;&middot;&nbsp;
              <a href="${data.unsubscribeUrl}" style="color:${DIM};text-decoration:underline;">Unsubscribe</a>
              &nbsp;&middot;&nbsp;
              <a href="https://buytuneio.vercel.app" style="color:${DIM};text-decoration:underline;">BuyTune</a>
            </div>
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
