import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ExportPayload = {
  scenarioName: string;
  purchasePrice: number;
  downPayment: number;
  downPaymentPct: number;
  closingCosts: number;
  mortgageRate: number;
  loanTermYears: number;
  monthlyMortgage: number;
  propertyTaxMonthly: number;
  insuranceMonthly: number;
  hoaMonthly: number;
  maintenancePct: number;
  maintenanceMonthly: number;
  totalMonthlyCost: number;
  monthlyRent: number;
  rentGrowthRate: number;
  expectedAppreciation: number;
  investmentReturn: number;
  holdYears: number;
  targetPurchaseYear: number;
  breakEvenYear: number | null;
  homeEquityAtHold: number | null;
  rentPortfolioAtHold: number | null;
  netAdvantage: number | null;
  loanAmount: number;
  totalInterestPaid: number | null;
  verdict: string;
};

function fmt(n: number) {
  return "$" + Math.round(n).toLocaleString("en-US");
}
function fmtPct(n: number) {
  return n.toFixed(2) + "%";
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: ExportPayload = await req.json();

  const generatedDate = new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  const advantage = body.netAdvantage ?? 0;
  const advantageLabel = advantage > 0
    ? `Buying is ahead by ${fmt(Math.abs(advantage))} after ${body.holdYears} years`
    : `Renting + investing is ahead by ${fmt(Math.abs(advantage))} after ${body.holdYears} years`;
  const advantageColor = advantage > 0 ? "#15803d" : "#dc2626";

  const breakEvenText = body.breakEvenYear
    ? `Year ${body.breakEvenYear} (${body.targetPurchaseYear + body.breakEvenYear})`
    : "Beyond hold period";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Home Purchase Analysis — ${body.scenarioName}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Georgia, 'Times New Roman', serif; background: #fff; color: #1e293b; font-size: 13px; line-height: 1.6; }
  .page { max-width: 760px; margin: 0 auto; padding: 48px 40px; }

  /* Header */
  .header { border-bottom: 2px solid #1e3a5f; padding-bottom: 20px; margin-bottom: 28px; }
  .header-top { display: flex; justify-content: space-between; align-items: flex-start; }
  .brand { font-size: 10px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: #64748b; font-family: Arial, sans-serif; }
  .report-title { font-size: 22px; font-weight: 700; color: #1e3a5f; margin: 6px 0 2px; letter-spacing: -0.01em; }
  .scenario-name { font-size: 13px; color: #475569; }
  .meta { text-align: right; font-size: 11px; color: #94a3b8; font-family: Arial, sans-serif; line-height: 1.8; }

  /* Verdict banner */
  .verdict { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid ${advantageColor}; padding: 14px 18px; margin-bottom: 28px; border-radius: 4px; }
  .verdict-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; font-family: Arial, sans-serif; margin-bottom: 4px; }
  .verdict-value { font-size: 16px; font-weight: 700; color: ${advantageColor}; font-family: Arial, sans-serif; margin-bottom: 4px; }
  .verdict-sub { font-size: 12px; color: #475569; }

  /* Sections */
  .section { margin-bottom: 28px; }
  .section-title { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #2563eb; font-family: Arial, sans-serif; padding-bottom: 6px; border-bottom: 1px solid #dbeafe; margin-bottom: 14px; }

  /* KPI grid */
  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
  .kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 14px; }
  .kpi-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; font-family: Arial, sans-serif; margin-bottom: 4px; }
  .kpi-value { font-size: 18px; font-weight: 700; color: #1e293b; font-family: 'Courier New', monospace; }
  .kpi-sub { font-size: 11px; color: #64748b; font-family: Arial, sans-serif; margin-top: 2px; }

  /* Data table */
  table { width: 100%; border-collapse: collapse; }
  td { padding: 7px 10px; font-size: 12px; border-bottom: 1px solid #f1f5f9; }
  td:first-child { color: #475569; font-family: Arial, sans-serif; }
  td:last-child { text-align: right; font-weight: 600; font-family: 'Courier New', monospace; color: #1e293b; }
  tr:last-child td { border-bottom: none; }
  .row-total td { border-top: 1px solid #cbd5e1; font-weight: 700; background: #f8fafc; }
  .row-total td:last-child { color: #1e3a5f; }

  /* Two-col layout */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }

  /* Disclaimer */
  .disclaimer { margin-top: 36px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; font-family: Arial, sans-serif; line-height: 1.7; }

  @media print {
    body { font-size: 12px; }
    .page { padding: 32px 28px; }
    @page { margin: 0.75in; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div class="header-top">
      <div>
        <div class="brand">BuyTune.io · Home Purchase Analysis</div>
        <div class="report-title">${body.scenarioName}</div>
        <div class="scenario-name">Target year: ${body.targetPurchaseYear} &nbsp;·&nbsp; ${body.holdYears}-year hold period</div>
      </div>
      <div class="meta">
        Generated ${generatedDate}<br/>
        For planning purposes only
      </div>
    </div>
  </div>

  <!-- Verdict -->
  <div class="verdict">
    <div class="verdict-label">After ${body.holdYears} years</div>
    <div class="verdict-value">${advantageLabel}</div>
    <div class="verdict-sub">Break-even: ${breakEvenText} &nbsp;·&nbsp; Verdict: ${body.verdict}</div>
  </div>

  <!-- Key Numbers -->
  <div class="section">
    <div class="section-title">Key Numbers at a Glance</div>
    <div class="kpi-grid">
      <div class="kpi">
        <div class="kpi-label">Purchase Price</div>
        <div class="kpi-value">${fmt(body.purchasePrice)}</div>
        <div class="kpi-sub">${fmtPct(body.downPaymentPct)} down · ${body.mortgageRate}% / ${body.loanTermYears}yr</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Total Monthly Cost</div>
        <div class="kpi-value">${fmt(body.totalMonthlyCost)}</div>
        <div class="kpi-sub">vs ${fmt(body.monthlyRent)}/mo rent</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Home Equity (yr ${body.holdYears})</div>
        <div class="kpi-value">${body.homeEquityAtHold != null ? fmt(body.homeEquityAtHold) : "—"}</div>
        <div class="kpi-sub">${body.rentPortfolioAtHold != null ? `Rent+invest: ${fmt(body.rentPortfolioAtHold)}` : ""}</div>
      </div>
    </div>
  </div>

  <div class="two-col">
    <!-- Property & Financing -->
    <div class="section">
      <div class="section-title">Property &amp; Financing</div>
      <table>
        <tr><td>Purchase price</td><td>${fmt(body.purchasePrice)}</td></tr>
        <tr><td>Down payment</td><td>${fmt(body.downPayment)} (${fmtPct(body.downPaymentPct)})</td></tr>
        <tr><td>Closing costs</td><td>${fmt(body.closingCosts)}</td></tr>
        <tr><td>Loan amount</td><td>${fmt(body.loanAmount)}</td></tr>
        <tr><td>Mortgage rate</td><td>${fmtPct(body.mortgageRate)}</td></tr>
        <tr><td>Loan term</td><td>${body.loanTermYears} years</td></tr>
        ${body.totalInterestPaid != null ? `<tr><td>Total interest paid</td><td>${fmt(body.totalInterestPaid)}</td></tr>` : ""}
      </table>
    </div>

    <!-- Monthly Cost Breakdown -->
    <div class="section">
      <div class="section-title">Monthly Cost Breakdown</div>
      <table>
        <tr><td>Mortgage (P&amp;I)</td><td>${fmt(body.monthlyMortgage)}</td></tr>
        <tr><td>Property tax</td><td>${fmt(body.propertyTaxMonthly)}</td></tr>
        <tr><td>Insurance</td><td>${fmt(body.insuranceMonthly)}</td></tr>
        <tr><td>HOA</td><td>${fmt(body.hoaMonthly)}</td></tr>
        <tr><td>Maintenance (${fmtPct(body.maintenancePct)}/yr)</td><td>${fmt(body.maintenanceMonthly)}</td></tr>
        <tr class="row-total"><td>Total</td><td>${fmt(body.totalMonthlyCost)}</td></tr>
        <tr><td>vs. current rent</td><td style="color:${body.totalMonthlyCost > body.monthlyRent ? "#dc2626" : "#15803d"}">${body.totalMonthlyCost > body.monthlyRent ? "+" : ""}${fmt(body.totalMonthlyCost - body.monthlyRent)}/mo</td></tr>
      </table>
    </div>
  </div>

  <!-- Long-term Assumptions -->
  <div class="section">
    <div class="section-title">Long-term Assumptions</div>
    <div class="two-col">
      <table>
        <tr><td>Home appreciation</td><td>${fmtPct(body.expectedAppreciation)}/yr</td></tr>
        <tr><td>Investment return</td><td>${fmtPct(body.investmentReturn)}/yr</td></tr>
      </table>
      <table>
        <tr><td>Rent growth</td><td>${fmtPct(body.rentGrowthRate)}/yr</td></tr>
        <tr><td>Hold period</td><td>${body.holdYears} years</td></tr>
      </table>
    </div>
  </div>

  <!-- Disclaimer -->
  <div class="disclaimer">
    This report is generated by BuyTune.io for informational and planning purposes only. It does not constitute financial, legal, or tax advice.
    All projections are estimates based on the assumptions shown above. Actual results will vary. Consult a licensed financial advisor or real estate professional before making any purchase decision.
  </div>

</div>
<script>
  // Auto-trigger print dialog on load for seamless PDF export
  window.addEventListener("load", () => window.print());
</script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
