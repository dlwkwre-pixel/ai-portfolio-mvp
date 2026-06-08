import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const year  = req.nextUrl.searchParams.get("year");
  const make  = req.nextUrl.searchParams.get("make");
  const model = req.nextUrl.searchParams.get("model");

  if (!year || !make || !model) {
    return NextResponse.json({ error: "year, make, and model are required." }, { status: 400 });
  }

  const url = `https://fueleconomy.gov/ws/rest/yfv?year=${encodeURIComponent(year)}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return NextResponse.json({ error: "EPA lookup failed." }, { status: 502 });

  const text = await res.text();
  // EPA returns XML or JSON; parse the combined MPG from JSON if available
  try {
    const json = JSON.parse(text);
    const vehicles = Array.isArray(json) ? json : json?.menuItem ? [json.menuItem].flat() : [];
    if (vehicles.length === 0) return NextResponse.json({ mpg: null });
    // Pick first result, return combined MPG
    const first = vehicles[0];
    const mpg = first?.comb08 ? Number(first.comb08) : first?.combE ? Number(first.combE) : null;
    return NextResponse.json({ mpg, options: vehicles.slice(0, 5).map((v: Record<string, unknown>) => ({ text: v.text ?? v.trany, mpg: v.comb08 ?? null })) });
  } catch {
    return NextResponse.json({ mpg: null });
  }
}
