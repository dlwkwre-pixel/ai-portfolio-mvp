import { NextResponse } from "next/server";
import { getBenchmarkComparison } from "@/lib/portfolio/benchmark";

export async function GET() {
  try {
    const result = await getBenchmarkComparison({
      benchmarkSymbol: "SPY",
      snapshots: [
        { snapshot_date: "2025-01-02", total_value: 100000 },
        { snapshot_date: "2025-02-03", total_value: 103500 },
        { snapshot_date: "2025-03-03", total_value: 101200 },
        { snapshot_date: "2025-04-01", total_value: 108000 },
      ],
    });

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}