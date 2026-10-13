import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { scrapePage, scrapeErrorMessage } from "@/lib/scrape/firecrawl";
import { callGemini, extractJsonObject } from "@/lib/ai/gemini";

// Paste a listing link → pre-filled planner form. Firecrawl reads the page (1 credit,
// cached 12h per URL), our own model pulls out the fields. Nothing is saved here; the
// form shows the values and the user reviews before saving.

export const maxDuration = 60;

type Kind = "apartment" | "car";

const PROMPTS: Record<Kind, string> = {
  apartment: `Extract rental listing details from this web page. Return ONLY a JSON object with these keys (use null when the page doesn't say):
{"name": string (property/building name), "address": string, "floorplan_name": string, "bedrooms": number (0 for studio), "bathrooms": number, "square_feet": number,
 "base_rent": number (monthly rent in dollars), "available_date": "YYYY-MM-DD", "lease_term_months": number,
 "application_fee": number, "admin_fee": number, "security_deposit": number, "pet_deposit": number, "pet_rent_monthly": number, "parking_monthly": number,
 "concession_text": string (any move-in special, e.g. "6 weeks free"), "note": string (one short sentence, e.g. which unit you picked if several were listed)}
If several units or floorplans are listed, pick the cheapest one that is available and say so in "note". Numbers must be plain numbers without $ or commas.`,
  car: `Extract vehicle listing details from this web page. Return ONLY a JSON object with these keys (use null when the page doesn't say):
{"year": number, "make": string, "model": string, "trim": string, "price": number (asking price in dollars), "mileage": number, "vin": string (17 characters), "mpg_combined": number,
 "note": string (one short sentence, e.g. "Used, 24k miles, dealer listing")}
Numbers must be plain numbers without $ or commas.`,
};

const num = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === "string" ? Number(v.replace(/[$,\s]/g, "")) : Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : null;
};
const str = (v: unknown, max = 120): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const date = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

function sanitize(kind: Kind, raw: Record<string, unknown>): Record<string, string | number | null> {
  if (kind === "apartment") {
    return {
      name: str(raw.name), address: str(raw.address, 200), floorplan_name: str(raw.floorplan_name, 60),
      bedrooms: num(raw.bedrooms, 0, 10), bathrooms: num(raw.bathrooms, 0, 10), square_feet: num(raw.square_feet, 100, 20_000),
      base_rent: num(raw.base_rent, 100, 50_000), available_date: date(raw.available_date), lease_term_months: num(raw.lease_term_months, 1, 36),
      application_fee: num(raw.application_fee, 0, 2_000), admin_fee: num(raw.admin_fee, 0, 5_000), security_deposit: num(raw.security_deposit, 0, 50_000),
      pet_deposit: num(raw.pet_deposit, 0, 5_000), pet_rent_monthly: num(raw.pet_rent_monthly, 0, 500), parking_monthly: num(raw.parking_monthly, 0, 1_000),
      concession_text: str(raw.concession_text, 200), note: str(raw.note, 200),
    };
  }
  const vin = typeof raw.vin === "string" ? raw.vin.trim().toUpperCase() : "";
  return {
    year: num(raw.year, 1950, new Date().getFullYear() + 2), make: str(raw.make, 40), model: str(raw.model, 60), trim: str(raw.trim, 60),
    price: num(raw.price, 500, 1_000_000), mileage: num(raw.mileage, 0, 1_000_000),
    vin: /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vin : null, mpg_combined: num(raw.mpg_combined, 5, 200), note: str(raw.note, 200),
  };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { limited, retryAfter } = checkRateLimit(`listing-extract:${user.id}`, 8, 10 * 60_000);
  if (limited) return NextResponse.json({ error: "Too many links in a short time. Please wait a few minutes." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });

  let url = "", kind: Kind = "apartment";
  try {
    const body = await req.json() as { url?: string; kind?: string };
    url = String(body.url ?? "");
    kind = body.kind === "car" ? "car" : "apartment";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const scraped = await scrapePage(url, { maxAgeHours: 12, maxChars: 14_000 });
  if (!scraped.ok) {
    const { status, message } = scrapeErrorMessage(scraped.reason);
    return NextResponse.json({ error: message }, { status });
  }

  const raw = await callGemini(
    `${PROMPTS[kind]}\n\nPage title: ${scraped.page.title ?? "(none)"}\nPage URL: ${scraped.page.url}\n\nPage content:\n${scraped.page.markdown}`,
    { temperature: 0, maxOutputTokens: 700, groqOnly: true },
  );
  const parsed = extractJsonObject<Record<string, unknown>>(raw);
  if (!parsed) return NextResponse.json({ error: "Couldn't find listing details on that page. Fill it in by hand." }, { status: 422 });

  const fields = sanitize(kind, parsed);
  const found = Object.entries(fields).filter(([k, v]) => k !== "note" && v !== null).length;
  if (found === 0) return NextResponse.json({ error: "That page didn't have listing details we could read. Fill it in by hand." }, { status: 422 });

  return NextResponse.json({ fields, url: scraped.page.url, title: scraped.page.title });
}
