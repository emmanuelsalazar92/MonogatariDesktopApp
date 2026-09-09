import { NextResponse, type NextRequest } from "next/server";

function monitorAuthorized(request: NextRequest) {
  const token = process.env.MONOGATARI_MONITOR_TOKEN?.trim();
  if (!token) return "disabled" as const;
  const authorization = request.headers.get("authorization") ?? "";
  const expected = `Basic ${btoa(`monitor:${token}`)}`;
  return authorization === expected ? "authorized" as const : "unauthorized" as const;
}

export function middleware(request: NextRequest) {
  const access = monitorAuthorized(request);
  if (access === "authorized") return NextResponse.next();
  if (access === "disabled") return new NextResponse("Monitor is not configured.", { status: 404 });
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Monogatari Monitor", charset="UTF-8"', "Cache-Control": "no-store" }
  });
}

export const config = { matcher: ["/monitor/:path*", "/api/monitor/:path*"] };
