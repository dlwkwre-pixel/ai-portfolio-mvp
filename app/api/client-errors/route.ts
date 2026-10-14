import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordError } from "@/lib/monitoring/record-error";

// Browser error reports from app/components/error-reporter.tsx (sent with sendBeacon,
// so the response is never read). Signed-out visitors can report too — the landing page
// breaks as easily as any other.
export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (raw.length > 20_000) return new NextResponse(null, { status: 413 });
    const body = JSON.parse(raw) as { message?: unknown; stack?: unknown; path?: unknown; digest?: unknown; kind?: unknown };
    if (typeof body.message !== "string" || !body.message.trim()) return new NextResponse(null, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

    await recordError({
      source: "client",
      message: body.message,
      stack: typeof body.stack === "string" ? body.stack : null,
      path: typeof body.path === "string" ? body.path : null,
      digest: typeof body.digest === "string" ? body.digest : null,
      userId: user?.id ?? null,
      userAgent: req.headers.get("user-agent"),
      context: typeof body.kind === "string" ? { kind: body.kind } : null,
    });
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 400 });
  }
}
