import { NextResponse } from "next/server";

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const authHealthUrl = baseUrl ? `${baseUrl}/auth/v1/health` : null;

  let fetchResult: {
    ok: boolean;
    status: number | null;
    statusText: string | null;
    error: string | null;
    body: string | null;
  } = {
    ok: false,
    status: null,
    statusText: null,
    error: null,
    body: null,
  };

  if (authHealthUrl) {
    try {
      const response = await fetch(authHealthUrl, {
        method: "GET",
        headers: {
          apikey: publishableKey ?? "",
        },
        cache: "no-store",
      });

      const bodyText = await response.text();

      fetchResult = {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        error: null,
        body: bodyText,
      };
    } catch (error) {
      fetchResult = {
        ok: false,
        status: null,
        statusText: null,
        error: error instanceof Error ? error.message : "Unknown fetch error",
        body: null,
      };
    }
  }

  return NextResponse.json({
    hasSupabaseUrl: Boolean(baseUrl),
    hasSupabasePublishableKey: Boolean(publishableKey),
    authHealthUrlPreview: authHealthUrl,
    fetchResult,
  });
}