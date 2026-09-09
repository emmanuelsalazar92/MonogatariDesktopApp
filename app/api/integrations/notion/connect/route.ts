import { NextResponse } from "next/server";

import { initialPublishNovelToNotion, NotionApiError, NotionPublishError, NotionSyncError } from "@/lib/notion-sync";
import { isTrustedMutationRequest } from "@/lib/request-security";
import { isValidNovelRouteId } from "@/lib/studio-routes";
import { SchemaCompatibilityError } from "@/lib/schema-compatibility";

type ConnectBody = { novelId?: unknown; mode?: unknown };

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) {
    return NextResponse.json({ ok: false, code: "UNTRUSTED_ORIGIN", message: "Cross-origin mutation rejected." }, { status: 403 });
  }

  let body: ConnectBody;
  try { body = (await request.json()) as ConnectBody; } catch {
    return NextResponse.json({ ok: false, code: "INVALID_JSON", message: "The request body must be valid JSON." }, { status: 400 });
  }
  if (typeof body.novelId !== "string" || !isValidNovelRouteId(body.novelId)) {
    return NextResponse.json({ ok: false, code: "NOVEL_REQUIRED", message: "Select a novel before connecting it to Notion." }, { status: 400 });
  }
  // Existing pages need a content and structure review before they can be linked.
  // Do not accept a page ID here and accidentally turn an import into an overwrite.
  if (body.mode !== "create") {
    return NextResponse.json({ ok: false, code: "EXISTING_PAGE_REVIEW_REQUIRED", message: "Linking existing Notion content is not available until its differences can be reviewed safely. No data was changed." }, { status: 409 });
  }

  try {
    const result = await initialPublishNovelToNotion(body.novelId);
    return NextResponse.json({ ok: true, ...result, lastNotionSync: result.lastNotionSync?.toISOString() ?? null });
  } catch (error) {
    if (error instanceof SchemaCompatibilityError) {
      return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: 503 });
    }
    if (error instanceof NotionPublishError || error instanceof NotionApiError || error instanceof NotionSyncError) {
      return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
    }
    return NextResponse.json({ ok: false, code: "INITIAL_PUBLISH_FAILED", message: "Monogatari could not complete the initial Notion publish." }, { status: 500 });
  }
}
