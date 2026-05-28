import { NextRequest, NextResponse } from "next/server";
import XLSXStyle from "xlsx-js-style";

// ─── Palette — light professional theme ──────────────────────────────────────

const P = {
  // backgrounds
  COVER:    "1E3A5F",   // deep navy — title block only
  BASE:     "FFFFFF",   // white — main background
  ROW_ALT:  "F8FAFC",   // near-white alternating row
  HDR:      "EFF6FF",   // very light blue — column headers
  SECTION:  "DBEAFE",   // pale blue — section header rows
  TOTAL:    "F1F5F9",   // light slate — totals / derived rows

  // text
  WHITE:    "FFFFFF",
  NAVY:     "1E3A5F",   // headings on light bg
  TEXT:     "1E293B",   // primary text
  MUTED:    "64748B",   // secondary / label text
  DIM:      "94A3B8",   // tertiary / caption text
  BLUE_LT:  "BFDBFE",   // section labels on dark covers
  BLUE:     "2563EB",
  BLUE_TXT: "1D4ED8",   // blue text on light bg

  // signals
  GREEN:    "15803D",   // green text
  RED:      "DC2626",   // red text
  AMBER:    "B45309",   // amber text

  // editable cells — soft amber tint, unmistakably "edit me"
  EDIT_BG:  "FFFBEB",
  EDIT_TEXT:"92400E",
  EDIT_BDR: "FCD34D",

  // row highlights
  HOLD_BG:  "EFF6FF",   // light blue — planned hold year
  CROSS_BG: "F0FDF4",   // light green — crossover year

  // borders
  BORDER:   "CBD5E1",   // slate-300
  BORDER_HDR: "BFDBFE", // blue tint for header borders
} as const;

// ─── Cell factory ─────────────────────────────────────────────────────────────

type CellOpts = {
  bold?: boolean;
  sz?: number;
  color?: string;
  bg?: string;
  align?: "left" | "center" | "right";
  numFmt?: string;
  bTop?: boolean;
  bBottom?: boolean;
  bLeft?: boolean;
  bRight?: boolean;
  italic?: boolean;
  wrap?: boolean;
};

function c(
  value: string | number | null | undefined,
  opts: CellOpts = {}
): XLSXStyle.CellObject {
  const {
    bold = false, italic = false, sz = 10,
    color = P.TEXT, bg = P.BASE,
    align = "left", numFmt,
    bTop = false, bBottom = false, bLeft = false, bRight = false,
    wrap = false,
  } = opts;

  const border = (on: boolean) =>
    on ? { style: "thin" as const, color: { rgb: P.BORDER } } : undefined;

  const obj: XLSXStyle.CellObject = {
    v: value ?? "",
    t: typeof value === "number" ? "n" : "s",
    s: {
      font: { bold, italic, sz, color: { rgb: color }, name: "Calibri" },
      alignment: { horizontal: align, vertical: "center", wrapText: wrap },
      fill: { fgColor: { rgb: bg } },
      border: {
        top:    border(bTop),
        bottom: border(bBottom),
        left:   border(bLeft),
        right:  border(bRight),
      },
    },
  };

  if (numFmt) (obj.s as Record<string, unknown>).numFmt = numFmt;
  return obj;
}

function e(bg: string = P.BASE): XLSXStyle.CellObject { return c("", { bg }); }

function fc(
  formula: string,
  cachedValue: number | string,
  opts: CellOpts = {}
): XLSXStyle.CellObject {
  const cell = c(cachedValue, opts);
  (cell as unknown as Record<string, unknown>).f = formula;
  return cell;
}

function colHeader(v: string): XLSXStyle.CellObject {
  return c(v, {
    bold: true, sz: 9, color: P.BLUE_TXT, bg: P.HDR,
    bTop: true, bBottom: true, bLeft: true, bRight: true,
    align: "right",
  });
}

function colHeaderLeft(v: string): XLSXStyle.CellObject {
  return c(v, {
    bold: true, sz: 9, color: P.BLUE_TXT, bg: P.HDR,
    bTop: true, bBottom: true, bLeft: true, bRight: true,
    align: "left",
  });
}

function sectionHeader(v: string, cols: number): XLSXStyle.CellObject[] {
  return [
    c(v, { bold: true, sz: 10, color: P.BLUE_TXT, bg: P.SECTION }),
    ...Array(cols - 1).fill(e(P.SECTION)),
  ];
}

function money(v: number, bg: string = P.BASE): XLSXStyle.CellObject {
  return c(v, {
    numFmt: '"$"#,##0', align: "right", bg, color: P.TEXT,
    bTop: true, bBottom: true, bLeft: true, bRight: true,
  });
}

function pct(v: number, bg: string = P.BASE): XLSXStyle.CellObject {
  return c(v, {
    numFmt: "0.0%", align: "right", bg, color: P.TEXT,
    bTop: true, bBottom: true, bLeft: true, bRight: true,
  });
}

// ─── Title block ─────────────────────────────────────────────────────────────

function titleBlock(
  scenarioName: string,
  exportDate: string,
  cols: number
): { rows: XLSXStyle.CellObject[][]; rowHeights: { hpt: number }[] } {
  const fill = cols - 1;
  return {
    rows: [
      [
        c("BUYTUNE", { bold: true, sz: 14, color: P.WHITE, bg: P.COVER }),
        ...Array(fill - 1).fill(e(P.COVER)),
        c(exportDate, { sz: 9, color: P.BLUE_LT, bg: P.COVER, align: "right" }),
      ],
      [
        c(scenarioName, { bold: true, sz: 13, color: P.WHITE, bg: P.COVER }),
        ...Array(fill).fill(e(P.COVER)),
      ],
      [
        c("HOME PLANNING  ·  AMORTIZATION SCHEDULE", { sz: 9, color: P.BLUE_LT, bg: P.COVER }),
        ...Array(fill).fill(e(P.COVER)),
      ],
      Array(cols).fill(e(P.BASE)),
      Array(cols).fill(e(P.BASE)),
    ],
    rowHeights: [{ hpt: 32 }, { hpt: 22 }, { hpt: 14 }, { hpt: 4 }, { hpt: 6 }],
  };
}

// ─── Request body types ───────────────────────────────────────────────────────

interface AmortInputs {
  name: string;
  purchase_price: number;
  down_payment: number;
  mortgage_rate: number;       // already in %, e.g. 6.75
  loan_term_years: number;
  expected_appreciation: number; // in %, e.g. 3.5
  hold_years: number;
  monthly_rent: number;
}

interface AmortRow {
  year: number;
  balance: number;
  annualPrincipal: number;
  annualInterest: number;
  cumulativeInterest: number;
  homeValue: number;
  equity: number;
  equityPct: number;
  isCrossover: boolean;
}

interface AmortStats {
  monthlyPayment: number;
  totalInterest: number;
  crossoverYear: number | null;
  equity20Year: number | null;
  equity50Year: number | null;
  equity80Year: number | null;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    inputs: AmortInputs;
    amortization: AmortRow[];
    amortStats: AmortStats;
  };

  const { inputs, amortization, amortStats } = body;
  const COLS = 9;

  const exportDate = new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  const wb = XLSXStyle.utils.book_new();

  // ── Layout plan (all 0-indexed → Excel 1-indexed = +1) ────────────────────
  // Rows 0-4   (Excel 1-5):   Title block
  // Row 5      (Excel 6):     Spacer
  // Row 6      (Excel 7):     ASSUMPTIONS header
  // Row 7      (Excel 8):     Instruction row
  // Row 8      (Excel 9):     Assumption col headers
  // Row 9      (Excel 10):    Purchase Price         → B10
  // Row 10     (Excel 11):    Down Payment           → B11
  // Row 11     (Excel 12):    Interest Rate %        → B12
  // Row 12     (Excel 13):    Loan Term (years)      → B13
  // Row 13     (Excel 14):    Annual Appreciation %  → B14
  // Row 14     (Excel 15):    Planned Hold Year      → B15
  // Row 15     (Excel 16):    Monthly Rent           → B16
  // Row 16     (Excel 17):    Spacer
  // Row 17     (Excel 18):    CALCULATED SUMMARY header
  // Row 18     (Excel 19):    Summary col headers
  // Row 19     (Excel 20):    Loan Amount            → B20 = B10-B11
  // Row 20     (Excel 21):    Monthly Payment P&I    → B21 = -PMT(...)
  // Row 21     (Excel 22):    Total Interest         → B22 = -CUMIPMT(...)
  // Row 22     (Excel 23):    Interest/Price ratio   → B23 = B22/B10
  // Row 23     (Excel 24):    Spacer
  // Row 24     (Excel 25):    AMORTIZATION SCHEDULE header
  // Row 25     (Excel 26):    Table column headers
  // Row 26     (Excel 27):    Year 0 data
  // Row 26+N   (Excel 27+N):  Year N data

  const { rows: headerRows, rowHeights: headerHeights } = titleBlock(
    inputs.name, exportDate, COLS
  );

  // Assumption rows
  const editOpts = (v: number | string): XLSXStyle.CellObject =>
    c(v, {
      bg: P.EDIT_BG, color: P.EDIT_TEXT, bold: true, sz: 11,
      bTop: true, bBottom: true, bLeft: true, bRight: true,
      align: typeof v === "number" ? "right" : "left",
      numFmt: typeof v === "number" && (v as number) > 100 ? '"$"#,##0' : undefined,
    });

  const assumptionDescriptions: Record<string, string> = {
    "Purchase Price":          "Full asking / purchase price of the property",
    "Down Payment":            "Cash paid upfront. Remainder becomes your loan",
    "Interest Rate (%)":       "Annual mortgage rate. Change this to compare scenarios",
    "Loan Term (years)":       "Standard options: 15 or 30 years",
    "Annual Appreciation (%)": "Expected home value growth per year. Historical avg: 3-4%",
    "Planned Hold Year":       "How many years before you plan to sell or refinance",
    "Monthly Rent":            "What you'd pay renting a comparable home (for comparison)",
  };

  const assumptionData: [string, number][] = [
    ["Purchase Price",          inputs.purchase_price],
    ["Down Payment",            inputs.down_payment],
    ["Interest Rate (%)",       inputs.mortgage_rate],
    ["Loan Term (years)",       inputs.loan_term_years],
    ["Annual Appreciation (%)", inputs.expected_appreciation],
    ["Planned Hold Year",       inputs.hold_years],
    ["Monthly Rent",            inputs.monthly_rent],
  ];

  const assumptionRows: XLSXStyle.CellObject[][] = assumptionData.map(([label, value]) => [
    c(label, { bg: P.HDR, color: P.NAVY, bold: true, sz: 10, bTop: true, bBottom: true, bLeft: true, bRight: true }),
    editOpts(value),
    c(assumptionDescriptions[label] ?? "", { bg: P.BASE, color: P.MUTED, sz: 9, italic: true }),
    ...Array(COLS - 3).fill(e()),
  ]);

  // Summary formula rows (reference assumption cells B10-B16 absolutely)
  const loanAmt = inputs.purchase_price - inputs.down_payment;

  const summaryRows: XLSXStyle.CellObject[][] = [
    [
      c("Loan Amount", { bg: P.TOTAL, color: P.NAVY, bold: true, sz: 10, bTop: true, bBottom: true, bLeft: true, bRight: true }),
      fc("B10-B11", loanAmt, {
        bg: P.TOTAL, color: P.TEXT, bold: true, sz: 11, numFmt: '"$"#,##0', align: "right",
        bTop: true, bBottom: true, bLeft: true, bRight: true,
      }),
      c("Purchase price minus down payment", { bg: P.BASE, color: P.MUTED, sz: 9, italic: true }),
      ...Array(COLS - 3).fill(e()),
    ],
    [
      c("Monthly Payment (P&I)", { bg: P.TOTAL, color: P.NAVY, bold: true, sz: 10, bTop: true, bBottom: true, bLeft: true, bRight: true }),
      fc("-PMT(B12/100/12,B13*12,B10-B11)", amortStats.monthlyPayment, {
        bg: P.TOTAL, color: P.TEXT, bold: true, sz: 11, numFmt: '"$"#,##0', align: "right",
        bTop: true, bBottom: true, bLeft: true, bRight: true,
      }),
      c("Principal + interest only. Does not include tax, insurance, or HOA", { bg: P.BASE, color: P.MUTED, sz: 9, italic: true }),
      ...Array(COLS - 3).fill(e()),
    ],
    [
      c("Total Interest Paid", { bg: P.TOTAL, color: P.NAVY, bold: true, sz: 10, bTop: true, bBottom: true, bLeft: true, bRight: true }),
      fc("-CUMIPMT(B12/100/12,B13*12,B10-B11,1,B13*12,0)", amortStats.totalInterest, {
        bg: P.TOTAL, color: P.RED, bold: true, sz: 11, numFmt: '"$"#,##0', align: "right",
        bTop: true, bBottom: true, bLeft: true, bRight: true,
      }),
      c("The total extra cost of borrowing over the full loan term", { bg: P.BASE, color: P.MUTED, sz: 9, italic: true }),
      ...Array(COLS - 3).fill(e()),
    ],
    [
      c("Interest as % of Purchase", { bg: P.TOTAL, color: P.NAVY, bold: true, sz: 10, bTop: true, bBottom: true, bLeft: true, bRight: true }),
      fc("B22/B10", amortStats.totalInterest / inputs.purchase_price, {
        bg: P.TOTAL, color: P.MUTED, sz: 11, numFmt: "0.0%", align: "right",
        bTop: true, bBottom: true, bLeft: true, bRight: true,
      }),
      c("How much extra you pay relative to the purchase price", { bg: P.BASE, color: P.MUTED, sz: 9, italic: true }),
      ...Array(COLS - 3).fill(e()),
    ],
  ];

  // Amortization data rows
  const dataRows: XLSXStyle.CellObject[][] = amortization.map((row, idx) => {
    const excelRow = 27 + idx;   // Excel 1-indexed row number for this data row
    const A = `A${excelRow}`;    // cell reference for Year column
    const B = `B${excelRow}`;
    const F = `F${excelRow}`;
    const G = `G${excelRow}`;

    const isHoldYear = row.year === inputs.hold_years;
    const isCrossover = row.isCrossover;
    const isEven = idx % 2 === 0;
    const rowBg = isHoldYear ? P.HOLD_BG : isCrossover ? P.CROSS_BG : isEven ? P.BASE : P.ROW_ALT;

    const dt = (v: number | string, opts: CellOpts = {}) => c(v, {
      bg: rowBg,
      bTop: true, bBottom: true, bLeft: true, bRight: true,
      ...opts,
    });

    // Year 0: no CUMPRINC (start_period would be invalid)
    const balFormula = row.year === 0
      ? "$B$10-$B$11"
      : `MAX(0,($B$10-$B$11)+CUMPRINC($B$12/100/12,$B$13*12,$B$10-$B$11,1,${A}*12,0))`;

    const principalFormula = row.year === 0
      ? "0"
      : `-CUMPRINC($B$12/100/12,$B$13*12,$B$10-$B$11,(${A}-1)*12+1,${A}*12,0)`;

    const interestFormula = row.year === 0
      ? "0"
      : `-CUMIPMT($B$12/100/12,$B$13*12,$B$10-$B$11,(${A}-1)*12+1,${A}*12,0)`;

    const cumulFormula = row.year === 0
      ? "0"
      : `-CUMIPMT($B$12/100/12,$B$13*12,$B$10-$B$11,1,${A}*12,0)`;

    const homeValFormula = `$B$10*(1+$B$14/100)^${A}`;
    const equityFormula  = `${F}-${B}`;
    const equityPctFormula = `${G}/$B$10`;
    const noteFormula = `IF(${A}=$B$15,"★ Planned Hold Year","")`;

    // Color coding per column
    const yearColor  = isHoldYear ? P.BLUE_TXT : P.MUTED;
    const balColor   = P.TEXT;
    const priColor   = "1D4ED8";   // blue-700
    const intColor   = "DC2626";   // red-600
    const cIntColor  = P.MUTED;
    const hvColor    = P.TEXT;
    const eqColor    = "15803D";   // green-700
    const noteBg     = isHoldYear ? P.HOLD_BG : isCrossover ? P.CROSS_BG : P.BASE;

    const b = (extra: CellOpts) => ({
      bg: rowBg, bTop: true, bBottom: true, bLeft: true, bRight: true, align: "right" as const, ...extra,
    });

    return [
      dt(row.year, { color: yearColor, bold: isHoldYear, align: "center", sz: 10 }),
      fc(balFormula,       row.balance < 100 ? 0 : row.balance,           b({ color: balColor,  numFmt: '"$"#,##0' })),
      fc(principalFormula, row.year === 0 ? 0 : row.annualPrincipal,      b({ color: priColor,  numFmt: '"$"#,##0' })),
      fc(interestFormula,  row.year === 0 ? 0 : row.annualInterest,       b({ color: intColor,  numFmt: '"$"#,##0' })),
      fc(cumulFormula,     row.cumulativeInterest,                         b({ color: cIntColor, numFmt: '"$"#,##0' })),
      fc(homeValFormula,   row.homeValue,                                  b({ color: hvColor,   numFmt: '"$"#,##0' })),
      fc(equityFormula,    row.equity,                                     b({ color: eqColor, bold: true, numFmt: '"$"#,##0' })),
      fc(equityPctFormula, row.equityPct / 100, b({
        color: row.equityPct >= 50 ? eqColor : row.equityPct >= 20 ? "1D4ED8" : P.MUTED,
        bold: row.equityPct >= 20,
        numFmt: "0.0%",
      })),
      dt(isHoldYear ? "★ Planned Hold Year" : isCrossover ? "↑ Crossover" : "", {
        color: isHoldYear ? P.BLUE_TXT : "15803D", sz: 9, italic: true, align: "left", bg: noteBg,
      }),
    ];
  });

  // Legend rows at bottom
  const legendRows: XLSXStyle.CellObject[][] = [
    Array(COLS).fill(e()),
    [
      c("LEGEND", { bold: true, sz: 9, color: P.MUTED, bg: P.BASE }),
      ...Array(COLS - 1).fill(e()),
    ],
    [
      c("★ = your planned hold year (blue row)", { sz: 9, color: P.BLUE_TXT, italic: true, bg: P.BASE }),
      ...Array(COLS - 1).fill(e()),
    ],
    [
      c("↑ Crossover = year principal paid exceeds interest (green row)", { sz: 9, color: "15803D", italic: true, bg: P.BASE }),
      ...Array(COLS - 1).fill(e()),
    ],
    [
      c("Amber cells in Assumptions are editable — change them to model different scenarios", { sz: 9, color: P.EDIT_TEXT, italic: true, bg: P.BASE }),
      ...Array(COLS - 1).fill(e()),
    ],
    [
      c("Balance, Principal, Interest, Home Value, and Equity columns use Excel formulas and will recalculate when you edit the amber cells", { sz: 9, color: P.MUTED, italic: true, bg: P.BASE }),
      ...Array(COLS - 1).fill(e()),
    ],
    Array(COLS).fill(e()),
    [
      c("Generated by BuyTune · AI Home Planning · buytune.io", { sz: 8, color: P.DIM, italic: true, bg: P.BASE }),
      ...Array(COLS - 1).fill(e()),
    ],
  ];

  // ── Assemble all rows ─────────────────────────────────────────────────────
  const allRows: XLSXStyle.CellObject[][] = [
    ...headerRows,
    // Spacer
    Array(COLS).fill(e()),
    // Assumptions
    sectionHeader("ASSUMPTIONS  ·  Edit gold cells to model different scenarios", COLS),
    [
      c("↓ Change the highlighted values below — the schedule will recalculate automatically", {
        sz: 9, color: P.EDIT_TEXT, italic: true, bg: P.BASE,
      }),
      ...Array(COLS - 1).fill(e()),
    ],
    [colHeaderLeft("Parameter"), colHeader("Current Value"), colHeaderLeft("Description"), ...Array(COLS - 3).fill(e(P.HDR))],
    ...assumptionRows,
    // Spacer
    Array(COLS).fill(e()),
    // Summary
    sectionHeader("CALCULATED SUMMARY  ·  These update when assumptions change", COLS),
    [colHeaderLeft("Metric"), colHeader("Value"), colHeaderLeft("Notes"), ...Array(COLS - 3).fill(e(P.HDR))],
    ...summaryRows,
    // Spacer
    Array(COLS).fill(e()),
    // Amortization table
    sectionHeader("YEAR-BY-YEAR AMORTIZATION SCHEDULE", COLS),
    [
      colHeaderLeft("Year"),
      colHeader("Loan Balance"),
      colHeader("Principal Paid"),
      colHeader("Interest Paid"),
      colHeader("Cumul. Interest"),
      colHeader("Est. Home Value"),
      colHeader("Equity"),
      colHeader("Equity %"),
      colHeaderLeft("Note"),
    ],
    ...dataRows,
    ...legendRows,
  ];

  const ws = XLSXStyle.utils.aoa_to_sheet(allRows);

  ws["!cols"] = [
    { wch: 26 },   // A: Year / Label
    { wch: 18 },   // B: Value / Loan Balance
    { wch: 15 },   // C: Description / Principal
    { wch: 15 },   // D: Interest
    { wch: 17 },   // E: Cumul Interest
    { wch: 16 },   // F: Home Value
    { wch: 14 },   // G: Equity
    { wch: 10 },   // H: Equity %
    { wch: 22 },   // I: Note
  ];

  const dataRowHeight = { hpt: 18 };
  const summaryHeight = { hpt: 19 };

  ws["!rows"] = [
    ...headerHeights,
    { hpt: 6  },   // spacer
    { hpt: 16 },   // assumptions section header
    { hpt: 14 },   // instruction
    { hpt: 18 },   // assumption col headers
    ...Array(7).fill(summaryHeight),  // 7 assumption rows
    { hpt: 6  },   // spacer
    { hpt: 16 },   // summary section header
    { hpt: 18 },   // summary col headers
    ...Array(4).fill(summaryHeight),  // 4 summary rows
    { hpt: 6  },   // spacer
    { hpt: 16 },   // amort section header
    { hpt: 20 },   // amort col headers
    ...Array(amortization.length).fill(dataRowHeight),
    ...Array(8).fill({ hpt: 14 }),  // legend rows
  ];

  // Merges: title block across all cols
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: COLS - 2 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: COLS - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: COLS - 1 } },
    // instruction row merged
    { s: { r: 7, c: 0 }, e: { r: 7, c: COLS - 1 } },
  ];

  // Freeze at the amortization table header (row index 25 = aoa row 25)
  ws["!freeze"] = { xSplit: 0, ySplit: 26 };

  XLSXStyle.utils.book_append_sheet(wb, ws, "Amortization");

  const buffer = XLSXStyle.write(wb, { type: "buffer", bookType: "xlsx" });
  const safeName = inputs.name.replace(/[^a-zA-Z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
  const filename = `BuyTune-${safeName}-Amortization.xlsx`;

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control":       "no-store",
    },
  });
}
