import { NextResponse } from "next/server";
import { getFredMacroSignals } from "@/lib/market-data/fred";

export const revalidate = 14400; // 4-hour server-side cache

export async function GET() {
  try {
    const signals = await getFredMacroSignals();
    return NextResponse.json({
      fedFundsRate: signals.fedFundsRate,
      yield10y: signals.yield10y,
      cpi: signals.cpi,
      unemployment: signals.unemployment,
      yieldCurveSpread: signals.yieldCurveSpread,
      creditSpread: signals.creditSpread,
      fredAvailable: signals.fredAvailable,
    });
  } catch (err) {
    console.error("[macro] failed:", err);
    return NextResponse.json({ error: "Macro data unavailable" }, { status: 500 });
  }
}
