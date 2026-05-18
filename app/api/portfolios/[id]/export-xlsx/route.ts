import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import { getPortfolioPerformanceSummary } from "@/lib/portfolio/performance";
import XLSXStyle from "xlsx-js-style";

// ─── palette ──────────────────────────────────────────────────────────────────

const P = {
  // backgrounds
  COVER:    "020B18",   // deepest navy — title block
  BASE:     "040D1A",   // page background
  ROW_ALT:  "071828",   // alternate data row
  HDR:      "0A1F38",   // column header row
  SECTION:  "0D2540",   // section header row
  TOTAL:    "0F2A48",   // totals row

  // text
  WHITE:    "F1F5F9",
  MUTED:    "94A3B8",
  DIM:      "475569",
  BLUE_LT:  "93C5FD",   // section labels / accents
  BLUE:     "2563EB",

  // signals
  GREEN:    "22C55E",
  RED:      "EF4444",
  AMBER:    "F59E0B",

  // borders
  BORDER:   "1E3A5F",
  BORDER_LT:"0F2240",
} as const;

// ─── cell factory ─────────────────────────────────────────────────────────────

type CellOpts = {
  bold?: boolean;
  italic?: boolean;
  sz?: number;
  color?: string;
  bg?: string;
  align?: "left" | "center" | "right";
  numFmt?: string;
  bTop?: boolean;
  bBottom?: boolean;
  bLeft?: boolean;
  bRight?: boolean;
  indent?: number;
};

function c(
  value: string | number | null | undefined,
  opts: CellOpts = {}
): XLSXStyle.CellObject {
  const {
    bold = false, italic = false, sz = 10,
    color = P.WHITE, bg = P.BASE,
    align = "left", numFmt,
    bTop = false, bBottom = false, bLeft = false, bRight = false,
    indent = 0,
  } = opts;

  const borderSide = (on: boolean, style = "thin") =>
    on ? { style, color: { rgb: P.BORDER } } : undefined;

  const obj: XLSXStyle.CellObject = {
    v: value ?? "",
    t: typeof value === "number" ? "n" : "s",
    s: {
      font:      { bold, italic, sz, color: { rgb: color }, name: "Calibri" },
      alignment: { horizontal: align, vertical: "center", indent },
      fill:      { fgColor: { rgb: bg } },
      border: {
        top:    borderSide(bTop),
        bottom: borderSide(bBottom),
        left:   borderSide(bLeft),
        right:  borderSide(bRight),
      },
    },
  };

  if (numFmt) (obj.s as Record<string, unknown>).numFmt = numFmt;
  return obj;
}

// convenience wrappers
const e = (bg: string = P.BASE) => c("", { bg });                 // empty
const bordered = (v: string | number | null | undefined, opts: CellOpts = {}) =>
  c(v, { bTop: true, bBottom: true, bLeft: true, bRight: true, ...opts });

function colHeader(v: string): XLSXStyle.CellObject {
  return c(v, {
    bold: true, sz: 9, color: P.BLUE_LT, bg: P.HDR,
    bTop: true, bBottom: true, bLeft: true, bRight: true,
  });
}

function sectionHeader(v: string, cols: number): XLSXStyle.CellObject[] {
  const bg: string = P.SECTION;
  return [
    c(v, { bold: true, sz: 10, color: P.BLUE_LT, bg }),
    ...Array(cols - 1).fill(e(bg)),
  ];
}

function moneyC(v: number | null | undefined, opts: CellOpts = {}): XLSXStyle.CellObject {
  if (v == null) return bordered("—", { align: "right", ...opts });
  return bordered(v, { numFmt: '"$"#,##0.00', align: "right", bg: P.BASE, ...opts });
}

function plMoneyC(v: number | null | undefined, opts: CellOpts = {}): XLSXStyle.CellObject {
  if (v == null) return bordered("—", { align: "right", ...opts });
  const col = v > 0 ? P.GREEN : v < 0 ? P.RED : P.WHITE;
  return bordered(v, { numFmt: '"$"#,##0.00', align: "right", color: col, bg: P.BASE, ...opts });
}

function pctC(v: number | null | undefined, opts: CellOpts = {}): XLSXStyle.CellObject {
  if (v == null) return bordered("—", { align: "right", ...opts });
  return bordered(v / 100, { numFmt: "0.00%", align: "right", bg: P.BASE, ...opts });
}

function plPctC(v: number | null | undefined, opts: CellOpts = {}): XLSXStyle.CellObject {
  if (v == null) return bordered("—", { align: "right", ...opts });
  const col = v > 0 ? P.GREEN : v < 0 ? P.RED : P.WHITE;
  return bordered(v / 100, { numFmt: "0.00%", align: "right", color: col, bg: P.BASE, ...opts });
}

function sharesC(v: number, opts: CellOpts = {}): XLSXStyle.CellObject {
  // Show up to 4 decimal places but strip trailing zeros so "2" not "2.0000"
  const fmt = v % 1 === 0 ? "#,##0" : "#,##0.0###";
  return bordered(v, { numFmt: fmt, align: "right", bg: P.BASE, ...opts });
}

// ─── sheet title block (rows 0–2) ─────────────────────────────────────────────

function titleBlock(
  portfolioName: string,
  exportDate: string,
  subtitle: string,
  cols: number
): { rows: XLSXStyle.CellObject[][]; rowHeights: { hpt: number }[] } {
  const fill = cols - 1;
  return {
    rows: [
      // Row 0: BuyTune wordmark + export date
      [
        c("BUYTUNE", { bold: true, sz: 14, color: P.WHITE, bg: P.COVER as string }),
        ...Array(fill - 1).fill(e(P.COVER as string)),
        c(exportDate, { sz: 9, color: P.DIM, bg: P.COVER as string, align: "right" }),
      ],
      // Row 1: Portfolio name
      [
        c(portfolioName, { bold: true, sz: 12, color: P.BLUE_LT, bg: P.COVER as string }),
        ...Array(fill).fill(e(P.COVER as string)),
      ],
      // Row 2: Subtitle/sheet label
      [
        c(subtitle.toUpperCase(), { sz: 9, color: P.DIM, bg: P.COVER as string }),
        ...Array(fill).fill(e(P.COVER as string)),
      ],
      // Row 3: Visual divider (thin bottom border on all cells)
      Array(cols).fill(c("", {
        bg: P.COVER as string,
        bBottom: true,
      })),
      // Row 4: spacer
      Array(cols).fill(e(P.BASE as string)),
    ],
    rowHeights: [
      { hpt: 32 }, // title
      { hpt: 22 }, // portfolio name
      { hpt: 16 }, // subtitle
      { hpt: 4  }, // divider
      { hpt: 6  }, // spacer
    ],
  };
}

// ─── route ────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [
    { data: portfolio },
    { data: rawHoldings },
    { data: transactions },
    { data: assignment },
    { data: recs },
    { data: cashLedger },
  ] = await Promise.all([
    supabase.from("portfolios").select("*").eq("id", id).eq("user_id", user.id).single(),
    supabase.from("holdings").select("*").eq("portfolio_id", id).order("ticker"),
    supabase
      .from("portfolio_transactions")
      .select("transaction_type, gross_amount, net_cash_impact, realized_gain_loss")
      .eq("portfolio_id", id),
    supabase
      .from("portfolio_strategy_assignments")
      .select(`*, strategies(name, description, style, risk_level), strategy_versions(version_number, max_position_pct, turnover_preference, holding_period_bias)`)
      .eq("portfolio_id", id).eq("is_active", true).is("ended_at", null)
      .order("assigned_at", { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from("recommendation_items")
      .select("action_type, ticker, company_name, thesis, conviction, recommendation_status, created_at")
      .eq("portfolio_id", id).order("created_at", { ascending: false }).limit(20),
    supabase
      .from("cash_ledger")
      .select("*").eq("portfolio_id", id).order("effective_at", { ascending: false }).limit(50),
  ]);

  if (!portfolio) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cashBalance = Number(portfolio.cash_balance ?? 0);

  const valuation = await getPortfolioValuation({
    holdings: (rawHoldings ?? []).map((h) => ({
      id: h.id, ticker: h.ticker, company_name: h.company_name,
      asset_type: h.asset_type, shares: h.shares, average_cost_basis: h.average_cost_basis,
    })),
    cashBalance,
  });

  const perf = getPortfolioPerformanceSummary({
    valuedHoldings: valuation.valued_holdings,
    transactions: transactions ?? [],
    cashBalance,
  });

  const totalReturnPct =
    perf.invested_capital > 0 ? (perf.total_pl / perf.invested_capital) * 100 : null;

  const totalMV = perf.holdings_market_value_total;
  const holdings = valuation.valued_holdings
    .map((h) => ({
      ...h,
      weight_pct: totalMV > 0 && h.market_value ? (h.market_value / totalMV) * 100 : 0,
    }))
    .sort((a, b) => (b.market_value ?? 0) - (a.market_value ?? 0));

  const strategy = (assignment as { strategies?: { name: string; description: string | null; style: string | null; risk_level: string | null } | null } | null)?.strategies ?? null;
  const stratVer = (assignment as { strategy_versions?: { version_number: number | null; max_position_pct: number | null; turnover_preference: string | null; holding_period_bias: string | null } | null } | null)?.strategy_versions ?? null;

  const exportDate = new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  const wb = XLSXStyle.utils.book_new();

  // ── Sheet 1: Summary ────────────────────────────────────────────────────────
  {
    const COLS = 6;
    const { rows: headerRows, rowHeights: headerHeights } = titleBlock(
      portfolio.name, exportDate, "Portfolio Summary", COLS
    );

    const metricRow = (label: string, valueCell: XLSXStyle.CellObject): XLSXStyle.CellObject[] => [
      bordered(label, { bg: P.HDR, color: P.MUTED, sz: 10 }),
      valueCell,
      ...Array(COLS - 2).fill(e()),
    ];

    const kpiRows: XLSXStyle.CellObject[][] = [
      sectionHeader("PERFORMANCE METRICS", COLS),
      [colHeader("Metric"), colHeader("Value"), ...Array(COLS - 2).fill(e(P.HDR))],
      metricRow("Total Portfolio Value",    moneyC(perf.total_portfolio_value)),
      metricRow("Invested Capital",         moneyC(perf.invested_capital)),
      metricRow("Holdings Cost Basis",      moneyC(perf.holdings_cost_basis_total)),
      metricRow("Holdings Market Value",    moneyC(perf.holdings_market_value_total)),
      metricRow("Cash Balance",             moneyC(cashBalance)),
      metricRow("Unrealized P/L",           plMoneyC(perf.unrealized_pl_total)),
      metricRow("Realized P/L",             plMoneyC(perf.realized_pl_total)),
      metricRow("Total P/L",                plMoneyC(perf.total_pl)),
      metricRow("Return on Capital",        plPctC(totalReturnPct)),
      Array(COLS).fill(e()),
    ];

    const stratRows: XLSXStyle.CellObject[][] = strategy ? [
      sectionHeader("STRATEGY PROFILE", COLS),
      [colHeader("Field"), colHeader("Value"), ...Array(COLS - 2).fill(e(P.HDR))],
      metricRow("Strategy Name",  bordered(strategy.name ?? "—")),
      metricRow("Style",          bordered(strategy.style ?? "—")),
      metricRow("Risk Level",     bordered(strategy.risk_level ?? "—")),
      metricRow("Version",        bordered(stratVer?.version_number != null ? `v${stratVer.version_number}` : "—")),
      metricRow("Max Position",   bordered(stratVer?.max_position_pct != null ? `${stratVer.max_position_pct}%` : "—")),
      metricRow("Turnover",       bordered(stratVer?.turnover_preference ?? "—")),
      metricRow("Holding Period", bordered(stratVer?.holding_period_bias ?? "—")),
    ] : [];

    const footerRows: XLSXStyle.CellObject[][] = [
      Array(COLS).fill(e()),
      [
        c("Generated by BuyTune AI · Investment intelligence platform", { sz: 8, color: P.DIM, italic: true }),
        ...Array(COLS - 1).fill(e()),
      ],
    ];

    const allRows = [...headerRows, ...kpiRows, ...stratRows, ...footerRows];
    const dataRowHeights = [
      { hpt: 16 }, // section header
      { hpt: 18 }, // col header
      ...Array(9).fill({ hpt: 18 }), // metrics
      { hpt: 8  }, // spacer
      ...(strategy ? [
        { hpt: 16 },
        { hpt: 18 },
        ...Array(7).fill({ hpt: 18 }),
      ] : []),
      { hpt: 8  },
      { hpt: 14 },
    ];

    const ws = XLSXStyle.utils.aoa_to_sheet(allRows);
    ws["!cols"] = [{ wch: 30 }, { wch: 24 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
    ws["!rows"] = [...headerHeights, ...dataRowHeights];
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: COLS - 2 } }, // BuyTune wordmark spans cols 0–4
      { s: { r: 1, c: 0 }, e: { r: 1, c: COLS - 1 } }, // portfolio name spans all
      { s: { r: 2, c: 0 }, e: { r: 2, c: COLS - 1 } }, // subtitle spans all
    ];
    XLSXStyle.utils.book_append_sheet(wb, ws, "Summary");
  }

  // ── Sheet 2: Holdings ────────────────────────────────────────────────────────
  {
    const COLS = 9;
    const { rows: headerRows, rowHeights: headerHeights } = titleBlock(
      portfolio.name, exportDate,
      `Holdings · ${holdings.length} Position${holdings.length !== 1 ? "s" : ""}`,
      COLS
    );

    const colHeaders = [
      colHeader("Ticker"),
      colHeader("Company"),
      colHeader("Shares"),
      colHeader("Avg Cost"),
      colHeader("Current"),
      colHeader("Mkt Value"),
      colHeader("Weight"),
      colHeader("Unrealized P/L"),
      colHeader("Return"),
    ];

    const dataRows = holdings.map((h, i) => {
      const bg = i % 2 === 0 ? P.BASE : P.ROW_ALT;
      return [
        bordered(h.ticker,                   { bold: true, color: P.WHITE, bg }),
        bordered(h.company_name || h.ticker,  { color: P.MUTED, bg }),
        sharesC(h.shares_number,              { bg }),
        moneyC(h.average_cost_basis_number,   { bg }),
        h.current_price != null ? moneyC(h.current_price, { bg }) : bordered("—", { align: "right", bg }),
        moneyC(h.market_value,               { bg }),
        pctC(h.weight_pct,                   { bg }),
        plMoneyC(h.unrealized_pl,            { bg }),
        plPctC(h.unrealized_pl_pct,          { bg }),
      ];
    });

    // Totals row
    const totalUnrealized = holdings.reduce((s, h) => s + (h.unrealized_pl ?? 0), 0);
    const totalsRow: XLSXStyle.CellObject[] = [
      c("TOTAL", { bold: true, sz: 10, color: P.BLUE_LT, bg: P.TOTAL, bTop: true, bBottom: true, bLeft: true }),
      c("",      { bg: P.TOTAL, bTop: true, bBottom: true }),
      c("",      { bg: P.TOTAL, bTop: true, bBottom: true }),
      c("",      { bg: P.TOTAL, bTop: true, bBottom: true }),
      c("",      { bg: P.TOTAL, bTop: true, bBottom: true }),
      bordered(perf.holdings_market_value_total, {
        numFmt: '"$"#,##0.00', align: "right", bold: true, color: P.WHITE, bg: P.TOTAL,
      }),
      bordered(1.0, { numFmt: "0.00%", align: "right", bold: true, color: P.WHITE, bg: P.TOTAL }),
      plMoneyC(totalUnrealized, { bold: true, bg: P.TOTAL }),
      c("", { bg: P.TOTAL, bTop: true, bBottom: true, bRight: true }),
    ];

    const allRows = [
      ...headerRows,
      colHeaders,
      ...dataRows,
      totalsRow,
    ];

    const ws = XLSXStyle.utils.aoa_to_sheet(allRows);
    ws["!cols"] = [
      { wch: 10 }, { wch: 30 }, { wch: 12 }, { wch: 14 },
      { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 18 }, { wch: 12 },
    ];
    ws["!rows"] = [
      ...headerHeights,
      { hpt: 20 },                           // col headers
      ...Array(holdings.length).fill({ hpt: 19 }), // data rows
      { hpt: 22 },                           // totals
    ];
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: COLS - 2 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: COLS - 1 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: COLS - 1 } },
    ];
    // Freeze title block + header row (rows 0–5 = 5 title rows + 1 col header)
    ws["!freeze"] = { xSplit: 0, ySplit: 6 };
    XLSXStyle.utils.book_append_sheet(wb, ws, "Holdings");
  }

  // ── Sheet 3: AI Recommendations ──────────────────────────────────────────────
  if (recs && recs.length > 0) {
    const COLS = 7;
    const { rows: headerRows, rowHeights: headerHeights } = titleBlock(
      portfolio.name, exportDate, "AI Recommendations", COLS
    );

    const colHeaders = [
      colHeader("Action"),
      colHeader("Ticker"),
      colHeader("Company"),
      colHeader("Thesis"),
      colHeader("Conviction"),
      colHeader("Status"),
      colHeader("Date"),
    ];

    const dataRows = recs.map((r, i) => {
      const bg = i % 2 === 0 ? P.BASE : P.ROW_ALT;
      const action = (r.action_type ?? "—").replace(/_/g, " ").toUpperCase();
      const acColor =
        action.includes("BUY") || action.includes("ADD") ? P.GREEN :
        action.includes("SELL") || action.includes("REDUCE") || action.includes("EXIT") ? P.RED :
        P.AMBER;
      const stColor =
        r.recommendation_status === "executed" ? P.GREEN :
        r.recommendation_status === "rejected"  ? P.RED : P.MUTED;

      return [
        bordered(action,                   { bold: true, color: acColor, bg }),
        bordered(r.ticker ?? "—",          { bold: true, color: P.WHITE, bg }),
        bordered(r.company_name ?? "—",    { color: P.MUTED, bg }),
        bordered(r.thesis ?? "—",          { color: P.MUTED, bg }),
        bordered(r.conviction ?? "—",      { bg }),
        bordered(r.recommendation_status ?? "proposed", { color: stColor, bg }),
        bordered(new Date(r.created_at).toLocaleDateString(), { color: P.MUTED, bg }),
      ];
    });

    const allRows = [...headerRows, colHeaders, ...dataRows];
    const ws = XLSXStyle.utils.aoa_to_sheet(allRows);
    ws["!cols"] = [
      { wch: 14 }, { wch: 10 }, { wch: 26 }, { wch: 64 }, { wch: 14 }, { wch: 12 }, { wch: 14 },
    ];
    ws["!rows"] = [
      ...headerHeights,
      { hpt: 20 },
      ...Array(recs.length).fill({ hpt: 40 }), // thesis cells may wrap
    ];
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: COLS - 2 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: COLS - 1 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: COLS - 1 } },
    ];
    ws["!freeze"] = { xSplit: 0, ySplit: 6 };
    // Allow thesis column to wrap
    if (ws["!cols"]) ws["!cols"][3] = { wch: 64 };
    XLSXStyle.utils.book_append_sheet(wb, ws, "AI Recommendations");
  }

  // ── Sheet 4: Cash Activity ────────────────────────────────────────────────────
  if (cashLedger && cashLedger.length > 0) {
    const COLS = 5;
    const { rows: headerRows, rowHeights: headerHeights } = titleBlock(
      portfolio.name, exportDate, "Cash Activity", COLS
    );

    const colHeaders = [
      colHeader("Date"),
      colHeader("Type"),
      colHeader("Direction"),
      colHeader("Amount"),
      colHeader("Notes"),
    ];

    const dataRows = cashLedger.map((entry, i) => {
      const bg = i % 2 === 0 ? P.BASE : P.ROW_ALT;
      const isIn = entry.direction === "IN";
      const amtColor = isIn ? P.GREEN : P.RED;
      const signed = isIn ? Number(entry.amount) : -Number(entry.amount);
      return [
        bordered(new Date(entry.effective_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), { bg }),
        bordered((entry.reason ?? "").replace(/_/g, " "), { bg }),
        bordered(entry.direction ?? "—", { bold: true, color: amtColor, bg }),
        bordered(signed, { numFmt: '"$"#,##0.00', align: "right", color: amtColor, bg }),
        bordered(entry.notes ?? "", { color: P.DIM, bg }),
      ];
    });

    // Net flow summary row
    const netFlow = cashLedger.reduce((sum, e) => {
      return sum + (e.direction === "IN" ? Number(e.amount) : -Number(e.amount));
    }, 0);

    const totalsRow: XLSXStyle.CellObject[] = [
      c("NET FLOW", { bold: true, sz: 10, color: P.BLUE_LT, bg: P.TOTAL, bTop: true, bBottom: true, bLeft: true }),
      c("",         { bg: P.TOTAL, bTop: true, bBottom: true }),
      c("",         { bg: P.TOTAL, bTop: true, bBottom: true }),
      bordered(netFlow, {
        numFmt: '"$"#,##0.00', align: "right", bold: true,
        color: netFlow >= 0 ? P.GREEN : P.RED, bg: P.TOTAL,
      }),
      c("", { bg: P.TOTAL, bTop: true, bBottom: true, bRight: true }),
    ];

    const allRows = [...headerRows, colHeaders, ...dataRows, totalsRow];
    const ws = XLSXStyle.utils.aoa_to_sheet(allRows);
    ws["!cols"] = [{ wch: 18 }, { wch: 22 }, { wch: 12 }, { wch: 18 }, { wch: 42 }];
    ws["!rows"] = [
      ...headerHeights,
      { hpt: 20 },
      ...Array(cashLedger.length).fill({ hpt: 18 }),
      { hpt: 22 },
    ];
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: COLS - 2 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: COLS - 1 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: COLS - 1 } },
    ];
    ws["!freeze"] = { xSplit: 0, ySplit: 6 };
    XLSXStyle.utils.book_append_sheet(wb, ws, "Cash Activity");
  }

  // ── serialize & return ────────────────────────────────────────────────────────
  const buffer = XLSXStyle.write(wb, { type: "buffer", bookType: "xlsx" });
  const safeName = portfolio.name.replace(/[^a-zA-Z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
  const filename = `BuyTune-${safeName}-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control":       "no-store",
    },
  });
}
