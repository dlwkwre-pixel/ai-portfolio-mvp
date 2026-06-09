import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const year  = req.nextUrl.searchParams.get("year");
  const make  = req.nextUrl.searchParams.get("make");
  const model = req.nextUrl.searchParams.get("model");
  const vid   = req.nextUrl.searchParams.get("vid"); // optional: fetch specific vehicle by ID

  if (vid) {
    // Fetch full detail for a specific vehicle ID
    const res = await fetch(`https://fueleconomy.gov/ws/rest/vehicle/${vid}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return NextResponse.json({ error: "EPA detail lookup failed." }, { status: 502 });
    try {
      const d = await res.json();
      return NextResponse.json(buildDetail(d));
    } catch {
      return NextResponse.json({ mpg: null });
    }
  }

  if (!year || !make || !model) {
    return NextResponse.json({ error: "year, make, and model are required." }, { status: 400 });
  }

  // Step 1: get vehicle option list (value = vehicle ID, text = trim/fuel description)
  const listUrl = `https://fueleconomy.gov/ws/rest/yfv?year=${encodeURIComponent(year)}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`;
  const listRes = await fetch(listUrl, {
    headers: { Accept: "application/json" },
    next: { revalidate: 86400 },
  });
  if (!listRes.ok) return NextResponse.json({ error: "EPA lookup failed." }, { status: 502 });

  let vehicles: { value: string; text: string }[] = [];
  try {
    const json = await listRes.json();
    const raw = Array.isArray(json) ? json : json?.menuItem ? [json.menuItem].flat() : [];
    vehicles = raw as { value: string; text: string }[];
  } catch {
    return NextResponse.json({ mpg: null });
  }

  if (vehicles.length === 0) return NextResponse.json({ mpg: null });

  const firstId = vehicles[0].value;

  // Step 2: fetch full detail for the first vehicle
  try {
    const detailRes = await fetch(`https://fueleconomy.gov/ws/rest/vehicle/${firstId}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 },
    });
    if (detailRes.ok) {
      const d = await detailRes.json();
      return NextResponse.json({
        ...buildDetail(d),
        options: vehicles.slice(0, 6).map((v) => ({ id: v.value, text: v.text })),
      });
    }
  } catch { /* fall through */ }

  // Fallback: no detail available
  return NextResponse.json({ mpg: null, options: vehicles.slice(0, 6).map((v) => ({ id: v.value, text: v.text })) });
}

type EpaVehicle = Record<string, unknown>;

function buildDetail(d: EpaVehicle) {
  const id   = d.id as number | undefined;
  const comb = d.comb08 ? Number(d.comb08) : d.combE ? Number(d.combE) : null;
  const city = d.city08 ? Number(d.city08) : null;
  const hwy  = d.hwy08  ? Number(d.hwy08)  : null;
  const co2  = d.co2    ? Number(d.co2)    : null;
  const annualCost = d.fuelCost08 ? Number(d.fuelCost08) : null;
  const drive   = (d.drive    as string | null) ?? null;
  const trany   = (d.trany    as string | null) ?? null;
  const fuel    = (d.fuelType1 as string | null) ?? null;
  const engDesc = (d.eng_dscr as string | null) ?? null;
  const displ   = d.displ    ? Number(d.displ)    : null;
  const cyls    = d.cylinders ? Number(d.cylinders) : null;
  const engine  = [displ ? `${displ}L` : null, cyls ? `${cyls}-cyl` : null, engDesc].filter(Boolean).join(" ") || null;
  const photoUrl = id ? `https://www.fueleconomy.gov/feg/photos/${id}/med.jpg` : null;

  return { mpg: comb, city_mpg: city, hwy_mpg: hwy, co2, annual_fuel_cost: annualCost, drive, trany, fuel, engine, photo_url: photoUrl, vehicle_id: id ?? null };
}
