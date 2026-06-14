import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.POLYGON_API_KEY;

  if (!key) {
    // Fall back to time-based estimate
    const now = new Date();
    const day = now.getUTCDay();
    const minutesUTC = now.getUTCHours() * 60 + now.getUTCMinutes();
    // NYSE hours: 13:30–20:00 UTC (EDT), 14:30–21:00 UTC (EST)
    const isOpen = day >= 1 && day <= 5 && minutesUTC >= 810 && minutesUTC <= 1200;
    return NextResponse.json(
      { isOpen, session: isOpen ? "regular" : "closed", source: "estimate" },
      { headers: { "Cache-Control": "public, max-age=180" } }
    );
  }

  try {
    const res = await fetch(
      `https://api.polygon.io/v1/marketstatus/now?apiKey=${key}`,
      { next: { revalidate: 180 } }
    );
    if (!res.ok) throw new Error("Polygon error");
    const data = await res.json();

    const isOpen = data.market === "open";
    const session: string = data.afterHours ? "after_hours" : data.earlyHours ? "pre_market" : isOpen ? "regular" : "closed";

    return NextResponse.json(
      { isOpen, session, afterHours: data.afterHours ?? false, earlyHours: data.earlyHours ?? false },
      { headers: { "Cache-Control": "public, max-age=180" } }
    );
  } catch {
    return NextResponse.json(
      { isOpen: false, session: "closed", source: "error" },
      { headers: { "Cache-Control": "public, max-age=60" } }
    );
  }
}
