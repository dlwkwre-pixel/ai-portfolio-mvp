import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, getIp } from "@/lib/rate-limit";

const MAX_FEEDBACK_LENGTH = 2000;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Light rate limit — feedback submissions should be rare.
  const { limited } = checkRateLimit(`feedback:${user.id}:${getIp(req)}`, 5, 60_000);
  if (limited) {
    return NextResponse.json({ error: "Too many submissions. Try again shortly." }, { status: 429 });
  }

  let body: { rating?: unknown; feedback?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Rating must be a whole number from 1 to 5." }, { status: 400 });
  }

  let feedback: string | null = null;
  if (typeof body.feedback === "string") {
    const trimmed = body.feedback.trim();
    feedback = trimmed ? trimmed.slice(0, MAX_FEEDBACK_LENGTH) : null;
  }

  const { error } = await supabase
    .from("feedback_responses")
    .insert({ user_id: user.id, rating, feedback });

  if (error) {
    return NextResponse.json({ error: "Could not save your feedback." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
