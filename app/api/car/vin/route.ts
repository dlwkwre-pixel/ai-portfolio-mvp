import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const vin = req.nextUrl.searchParams.get("vin")?.trim().toUpperCase();
  if (!vin || vin.length !== 17) {
    return NextResponse.json({ error: "VIN must be 17 characters." }, { status: 400 });
  }

  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`;
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) return NextResponse.json({ error: "NHTSA lookup failed." }, { status: 502 });

  const json = await res.json();
  const r = json?.Results?.[0];
  if (!r) return NextResponse.json({ error: "No result." }, { status: 404 });

  return NextResponse.json({
    make:  r.Make  ?? null,
    model: r.Model ?? null,
    year:  r.ModelYear ? Number(r.ModelYear) : null,
    trim:  r.Trim  ?? null,
  });
}
