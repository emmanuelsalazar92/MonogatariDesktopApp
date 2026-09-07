import { NextResponse } from "next/server";

import { disconnectNotionNovel } from "@/lib/db/notion-publish";
import { isTrustedMutationRequest } from "@/lib/request-security";
import { isValidNovelRouteId } from "@/lib/studio-routes";

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return NextResponse.json({ ok: false, code: "UNTRUSTED_ORIGIN", message: "Cross-origin mutation rejected." }, { status: 403 });
  let body: { novelId?: unknown };
  try { body = (await request.json()) as { novelId?: unknown }; } catch {
    return NextResponse.json({ ok: false, code: "INVALID_JSON", message: "The request body must be valid JSON." }, { status: 400 });
  }
  if (typeof body.novelId !== "string" || !isValidNovelRouteId(body.novelId)) {
    return NextResponse.json({ ok: false, code: "NOVEL_REQUIRED", message: "Select a novel before disconnecting it from Notion." }, { status: 400 });
  }
  await disconnectNotionNovel(body.novelId);
  return NextResponse.json({ ok: true, message: "This novel is now local only. Its Notion pages were not deleted." });
}
