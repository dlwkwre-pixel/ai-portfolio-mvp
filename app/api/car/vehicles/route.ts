import { NextRequest, NextResponse } from "next/server";

type MenuItem = { value?: string; text?: string };

function parseItems(json: unknown): string[] {
  const raw = Array.isArray(json)
    ? json
    : (json as Record<string, unknown>)?.menuItem
      ? [(json as Record<string, unknown>).menuItem].flat()
      : [];
  return (raw as MenuItem[]).map((i) => i.value ?? i.text ?? "").filter(Boolean);
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type");
  const year = req.nextUrl.searchParams.get("year");
  const make = req.nextUrl.searchParams.get("make");

  if (type === "makes") {
    if (!year) return NextResponse.json({ error: "year required" }, { status: 400 });
    const res = await fetch(
      `https://fueleconomy.gov/ws/rest/vehicle/menu/make?year=${encodeURIComponent(year)}`,
      { headers: { Accept: "application/json" }, next: { revalidate: 86400 } },
    );
    if (!res.ok) return NextResponse.json({ options: [] });
    return NextResponse.json({ options: parseItems(await res.json()) });
  }

  if (type === "models") {
    if (!year || !make) return NextResponse.json({ error: "year and make required" }, { status: 400 });
    const res = await fetch(
      `https://fueleconomy.gov/ws/rest/vehicle/menu/model?year=${encodeURIComponent(year)}&make=${encodeURIComponent(make)}`,
      { headers: { Accept: "application/json" }, next: { revalidate: 86400 } },
    );
    if (!res.ok) return NextResponse.json({ options: [] });
    return NextResponse.json({ options: parseItems(await res.json()) });
  }

  return NextResponse.json({ error: "type must be 'makes' or 'models'" }, { status: 400 });
}
