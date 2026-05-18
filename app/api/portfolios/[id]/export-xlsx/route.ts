import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import { getPortfolioPerformanceSummary } from "@/lib/portfolio/performance";
import XLSXStyle from "xlsx-js-style";

// ─── cell helpers ─────────────────────────────────────────────────────────────

type CellOpts = {
  bold?: boolean;
  italic?: boolean;
  fontSize?: number;
  color?: string;
  bg?: string;
  align?: "left" | "center" | "right";
  numFmt?: string;
  border?: boolean;
};

function cell(
  value: string | number | null | undefined,
  opts: CellOpts = {}
): XLSXStyle.CellObject {
  const {
    bold,
    italic,
    fontSize = 10,
    color = "F1F5F9",
    bg,
    align = "left",
    numFmt,
    border = false,
  } = opts;

  const c: XLSXStyle.CellObject = {
    v: value ?? "",
    t: typeof value === "number" ? "n" : "s",
    s: {
      font: {
        bold: bold ?? false,
        italic: italic ?? false,
        sz: fontSize,
        color: { rgb: color },
        name: "Calibri",
      },
      alignment: { horizontal: align, vertical: "center", wrapText: false },
      fill: bg ? { fgColor: { rgb: bg } } : { fgColor: { rgb: "040D1A" } },
    },
  };

  if (numFmt) (c.s as Record<string, unknown>).numFmt = numFmt;

  if (border) {
    const b = { style: "thin", color: { rgb: "1E293B" } };
    (c.s as Record<string, unknown>).border = { top: b, bottom: b, left: b, right: b };
  }

  return c;
}

function headerCell(v: string): XLSXStyle.CellObject {
  return cell(v, { bold: true, bg: "0F172A", color: "94A3B8", fontSize: 9, border: true });
}

function titleCell(v: string): XLSXStyle.CellObject {
  return cell(v, { bold: true, fontSize: 14, color: "F1F5F9", bg: "040D1A" });
}

function sectionCell(v: string): XLSXStyle.CellObject {
  return cell(v, { bold: true, fontSize: 11, color: "93C5FD", bg: "040D1A" });
}

function moneyCell(v: number | null | undefined, highlight = false): XLSXStyle.CellObject {
  if (v == null) return cell("—", { align: "right" });
  const color =
    highlight && v > 0 ? "22C55E" : highlight && v < 0 ? "EF4444" : "F1F5F9";
  return cell(v, {
    numFmt: '"$"#,##0.00',
    align: "right",
    color,
    border: true,
  });
}

function pctCell(v: number | null | undefined, highlight = false): XLSXStyle.CellObject {
  if (v == null) return cell("—", { align: "right" });
  const color =
    highlight && v > 0 ? "22C55E" : highlight && v < 0 ? "EF4444" : "F1F5F9";
  return cell(v / 100, { numFmt: "0.00%", align: "right", color, border: true });
}

function empty(): XLSXStyle.CellObject {
  return cell("", { bg: "040D1A" });
}

// ─── route ────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
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
      .eq("portfolio_id", id)
      .eq("is_active", true)
      .is("ended_at", null)
      .order("assigned_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("recommendation_items")
      .select("action_type, ticker, company_name, thesis, conviction, recommendation_status, created_at")
      .eq("portfolio_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("cash_ledger")
      .select("*")
      .eq("portfolio_id", id)
      .order("effective_at", { ascending: false })
      .limit(50),
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
    perf.invested_capital > 0
      ? (perf.total_pl / perf.invested_capital) * 100
      : null;

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
  const COL_BG = "040D1A";
  const HDR_BG = "0F172A";

  // ── Sheet 1: Summary ────────────────────────────────────────────────────────
  const summaryRows: XLSXStyle.CellObject[][] = [
    [titleCell("BUYTUNE — PORTFOLIO REPORT"), ...Array(5).fill(empty())],
    [cell(portfolio.name, { bold: true, fontSize: 12, bg: COL_BG }), ...Array(5).fill(empty())],
    [cell(`Exported: ${exportDate}`, { color: "475569", bg: COL_BG }), ...Array(5).fill(empty())],
    Array(6).fill(empty()),
    [sectionCell("PERFORMANCE SUMMARY"), ...Array(5).fill(empty())],
    [headerCell("Metric"), headerCell("Value"), ...Array(4).fill(empty())],
    [
      cell("Total Portfolio Value", { border: true, bg: HDR_BG }),
      moneyCell(perf.total_portfolio_value),
      ...Array(4).fill(empty()),
    ],
    [
      cell("Invested Capital", { border: true, bg: HDR_BG }),
      moneyCell(perf.invested_capital),
      ...Array(4).fill(empty()),
    ],
    [
      cell("Cost Basis", { border: true, bg: HDR_BG }),
      moneyCell(perf.holdings_cost_basis_total),
      ...Array(4).fill(empty()),
    ],
    [
      cell("Market Value", { border: true, bg: HDR_BG }),
      moneyCell(perf.holdings_market_value_total),
      ...Array(4).fill(empty()),
    ],
    [
      cell("Cash Balance", { border: true, bg: HDR_BG }),
      moneyCell(cashBalance),
      ...Array(4).fill(empty()),
    ],
    [
      cell("Unrealized P/L", { border: true, bg: HDR_BG }),
      moneyCell(perf.unrealized_pl_total, true),
      ...Array(4).fill(empty()),
    ],
    [
      cell("Realized P/L", { border: true, bg: HDR_BG }),
      moneyCell(perf.realized_pl_total, true),
      ...Array(4).fill(empty()),
    ],
    [
      cell("Total P/L", { border: true, bg: HDR_BG }),
      moneyCell(perf.total_pl, true),
      ...Array(4).fill(empty()),
    ],
    [
      cell("Return on Capital", { border: true, bg: HDR_BG }),
      pctCell(totalReturnPct, true),
      ...Array(4).fill(empty()),
    ],
    Array(6).fill(empty()),
  ];

  if (strategy) {
    summaryRows.push(
      [sectionCell("STRATEGY PROFILE"), ...Array(5).fill(empty())],
      [
        cell("Strategy Name", { border: true, bg: HDR_BG }),
        cell(strategy.name, { border: true }),
        ...Array(4).fill(empty()),
      ],
      [
        cell("Style", { border: true, bg: HDR_BG }),
        cell(strategy.style ?? "—", { border: true }),
        ...Array(4).fill(empty()),
      ],
      [
        cell("Risk Level", { border: true, bg: HDR_BG }),
        cell(strategy.risk_level ?? "—", { border: true }),
        ...Array(4).fill(empty()),
      ],
      [
        cell("Version", { border: true, bg: HDR_BG }),
        cell(stratVer?.version_number != null ? `v${stratVer.version_number}` : "—", { border: true }),
        ...Array(4).fill(empty()),
      ],
      [
        cell("Max Position", { border: true, bg: HDR_BG }),
        cell(stratVer?.max_position_pct != null ? `${stratVer.max_position_pct}%` : "—", { border: true }),
        ...Array(4).fill(empty()),
      ]
    );
  }

  const summarySheet = XLSXStyle.utils.aoa_to_sheet(summaryRows);
  summarySheet["!cols"] = [{ wch: 28 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }];
  XLSXStyle.utils.book_append_sheet(wb, summarySheet, "Summary");

  // ── Sheet 2: Holdings ────────────────────────────────────────────────────────
  const holdingRows: XLSXStyle.CellObject[][] = [
    [
      headerCell("Ticker"),
      headerCell("Company"),
      headerCell("Shares"),
      headerCell("Avg Cost"),
      headerCell("Current Price"),
      headerCell("Market Value"),
      headerCell("Weight %"),
      headerCell("Unrealized P/L"),
      headerCell("Return %"),
    ],
    ...holdings.map((h, i) => {
      const rowBg = i % 2 === 0 ? COL_BG : "071224";
      return [
        cell(h.ticker, { bold: true, bg: rowBg, border: true }),
        cell(h.company_name || h.ticker, { bg: rowBg, color: "94A3B8", border: true }),
        cell(h.shares_number, { numFmt: "#,##0", align: "right", bg: rowBg, border: true }),
        moneyCell(h.average_cost_basis_number),
        h.current_price != null ? moneyCell(h.current_price) : cell("—", { align: "right", bg: rowBg, border: true }),
        moneyCell(h.market_value),
        pctCell(h.weight_pct),
        moneyCell(h.unrealized_pl, true),
        pctCell(h.unrealized_pl_pct, true),
      ];
    }),
  ];

  const holdingsSheet = XLSXStyle.utils.aoa_to_sheet(holdingRows);
  holdingsSheet["!cols"] = [
    { wch: 10 }, { wch: 28 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
    { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 12 },
  ];
  XLSXStyle.utils.book_append_sheet(wb, holdingsSheet, "Holdings");

  // ── Sheet 3: AI Recommendations ──────────────────────────────────────────────
  if (recs && recs.length > 0) {
    const recRows: XLSXStyle.CellObject[][] = [
      [
        headerCell("Action"),
        headerCell("Ticker"),
        headerCell("Company"),
        headerCell("Thesis"),
        headerCell("Conviction"),
        headerCell("Status"),
        headerCell("Date"),
      ],
      ...recs.map((r, i) => {
        const rowBg = i % 2 === 0 ? COL_BG : "071224";
        return [
          cell((r.action_type ?? "—").replace(/_/g, " ").toUpperCase(), { bold: true, bg: rowBg, border: true }),
          cell(r.ticker ?? "—", { bold: true, bg: rowBg, border: true }),
          cell(r.company_name ?? "—", { bg: rowBg, color: "94A3B8", border: true }),
          cell(r.thesis ?? "—", { bg: rowBg, color: "94A3B8", border: true }),
          cell(r.conviction ?? "—", { bg: rowBg, border: true }),
          cell(r.recommendation_status ?? "proposed", { bg: rowBg, border: true }),
          cell(new Date(r.created_at).toLocaleDateString(), { bg: rowBg, border: true }),
        ];
      }),
    ];

    const recSheet = XLSXStyle.utils.aoa_to_sheet(recRows);
    recSheet["!cols"] = [
      { wch: 14 }, { wch: 10 }, { wch: 24 }, { wch: 60 }, { wch: 14 }, { wch: 12 }, { wch: 14 },
    ];
    XLSXStyle.utils.book_append_sheet(wb, recSheet, "AI Recommendations");
  }

  // ── Sheet 4: Cash Activity ────────────────────────────────────────────────────
  if (cashLedger && cashLedger.length > 0) {
    const cashRows: XLSXStyle.CellObject[][] = [
      [
        headerCell("Date"),
        headerCell("Type"),
        headerCell("Direction"),
        headerCell("Amount"),
        headerCell("Notes"),
      ],
      ...cashLedger.map((e, i) => {
        const rowBg = i % 2 === 0 ? COL_BG : "071224";
        const amountColor = e.direction === "IN" ? "22C55E" : "EF4444";
        const signed = e.direction === "IN" ? Number(e.amount) : -Number(e.amount);
        return [
          cell(new Date(e.effective_at).toLocaleDateString(), { bg: rowBg, border: true }),
          cell((e.reason ?? "").replace(/_/g, " "), { bg: rowBg, border: true }),
          cell(e.direction ?? "—", { bg: rowBg, color: amountColor, bold: true, border: true }),
          cell(signed, { numFmt: '"$"#,##0.00', align: "right", bg: rowBg, color: amountColor, border: true }),
          cell(e.notes ?? "", { bg: rowBg, color: "475569", border: true }),
        ];
      }),
    ];

    const cashSheet = XLSXStyle.utils.aoa_to_sheet(cashRows);
    cashSheet["!cols"] = [{ wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 40 }];
    XLSXStyle.utils.book_append_sheet(wb, cashSheet, "Cash Activity");
  }

  // ── serialize & return ────────────────────────────────────────────────────────
  const buffer = XLSXStyle.write(wb, { type: "buffer", bookType: "xlsx" });
  const safeName = portfolio.name.replace(/[^a-zA-Z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
  const filename = `BuyTune-${safeName}-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
