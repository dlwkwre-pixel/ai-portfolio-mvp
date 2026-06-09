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

  const displ = r.DisplacementL ? parseFloat(r.DisplacementL) : null;
  const cyls  = r.EngineCylinders ? parseInt(r.EngineCylinders, 10) : null;
  const engine = [displ ? `${displ}L` : null, cyls ? `${cyls}-cyl` : null].filter(Boolean).join(" ") || null;

  return NextResponse.json({
    make:       r.Make       ?? null,
    model:      r.Model      ?? null,
    year:       r.ModelYear  ? Number(r.ModelYear) : null,
    trim:       r.Trim       ?? null,
    body_class: r.BodyClass  ?? null,
    drive_type: r.DriveType  ?? null,
    fuel_type:  r.FuelTypePrimary ?? null,
    engine,
    doors:      r.Doors      ? Number(r.Doors) : null,
    trany:      [r.TransmissionStyle, r.TransmissionSpeeds ? `${r.TransmissionSpeeds}-spd` : null].filter(Boolean).join(" ") || null,
  });
}
