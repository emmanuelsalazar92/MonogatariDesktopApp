import { NextResponse } from "next/server";

import { isNotionConfigured, testNotionConnection } from "@/lib/notion";

export async function GET() {
  return NextResponse.json({ configured: isNotionConfigured() });
}

export async function POST(request: Request) {
  let body: { rootPage?: unknown };

  try {
    body = (await request.json()) as { rootPage?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_JSON", message: "The request body must be valid JSON." },
      { status: 400 }
    );
  }

  if (typeof body.rootPage !== "string") {
    return NextResponse.json(
      { ok: false, code: "INVALID_PAGE", message: "Enter a valid Notion page URL or page ID." },
      { status: 400 }
    );
  }

  const result = await testNotionConnection(body.rootPage);
  return NextResponse.json(result, { status: result.ok ? 200 : result.status });
}
