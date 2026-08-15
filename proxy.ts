import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Hard, liability-driven account-approval gate. Runs on every route (Node.js
// runtime, per Next 16) so no future top-level page can ship unprotected —
// unlike the soft terms_accepted_at check, which is just a dashboard modal.
const PUBLIC_PATHS = [
  "/", "/login", "/signup", "/forgot-password", "/reset-password",
  "/auth/callback", "/pending-approval", "/offline",
  "/api/notify-signup", // fired right after signUp(), while the caller is still unapproved
  "/api/oauth/register", // RFC 7591 Dynamic Client Registration — called before any user is involved
  "/api/oauth/token",    // token exchange is a server-to-server call, never carries a Supabase session cookie
];
const PUBLIC_PREFIXES = ["/legal", "/terms", "/privacy", "/accessibility", "/.well-known"];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (PUBLIC_PATHS.includes(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p))) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          // Rebuilt AFTER request.cookies is mutated, so it isn't based on stale cookies.
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims) return supabaseResponse;
  if (claims.email === process.env.ADMIN_EMAIL) return supabaseResponse;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("approved")
    .eq("id", claims.sub)
    .maybeSingle();
  if (profile?.approved) return supabaseResponse;

  if (path.startsWith("/api/")) {
    return Response.json({ error: "Account pending approval" }, { status: 403 });
  }

  const redirectRes = NextResponse.redirect(new URL("/pending-approval", request.url));
  // Carry over any refreshed session cookies so an in-flight token refresh isn't dropped.
  supabaseResponse.cookies.getAll().forEach((c) => redirectRes.cookies.set(c));
  return redirectRes;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|webp|ico|xml|txt)$).*)",
  ],
};
