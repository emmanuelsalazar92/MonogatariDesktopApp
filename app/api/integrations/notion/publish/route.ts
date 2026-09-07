import { NextResponse } from "next/server";

import { NotionApiError, NotionPublishError, NotionSyncError, initialPublishNovelToNotion } from "@/lib/notion-sync";
import { isTrustedMutationRequest } from "@/lib/request-security";

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) {
    return NextResponse.json({ ok: false, code: "UNTRUSTED_ORIGIN", message: "Cross-origin mutation rejected." }, { status: 403 });
  }
  let body: { novelId?: unknown };

  try {
    body = (await request.json()) as { novelId?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_JSON", message: "The request body must be valid JSON." },
      { status: 400 }
    );
  }

  if (typeof body.novelId !== "string" || !body.novelId.trim()) {
    return NextResponse.json(
      { ok: false, code: "NOVEL_REQUIRED", message: "Select a novel before publishing to Notion." },
      { status: 400 }
    );
  }

  try {
    const result = await initialPublishNovelToNotion(body.novelId);
    return NextResponse.json({
      ok: true,
      message: `Published ${result.createdPages} new page(s) and updated ${result.updatedPages} existing page(s).`,
      novelPage: result.novelPage,
      createdPages: result.createdPages,
      updatedPages: result.updatedPages
    });
  } catch (error) {
    if (error instanceof NotionPublishError || error instanceof NotionApiError || error instanceof NotionSyncError) {
      return NextResponse.json(
        { ok: false, code: error.code, message: error.message },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { ok: false, code: "PUBLISH_FAILED", message: "Monogatari could not publish this novel to Notion." },
      { status: 500 }
    );
  }
}
