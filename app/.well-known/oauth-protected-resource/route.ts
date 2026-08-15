import { NextResponse } from "next/server";
import { ISSUER, MCP_RESOURCE, CORS_HEADERS } from "@/lib/oauth/config";

// RFC 9728 Protected Resource Metadata. Fetched by an MCP client after it
// gets a 401 from /api/mcp with a WWW-Authenticate: Bearer
// resource_metadata="..." header pointing here — tells it which
// authorization server to use for this resource.
export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(
    {
      resource: MCP_RESOURCE,
      authorization_servers: [ISSUER],
      bearer_methods_supported: ["header"],
    },
    { headers: CORS_HEADERS }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
