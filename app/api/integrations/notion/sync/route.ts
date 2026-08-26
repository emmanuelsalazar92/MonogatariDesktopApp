import { NextResponse } from "next/server";

import { NotionApiError, NotionPublishError, NotionSyncError, syncNovelToNotion } from "@/lib/notion-sync";

type SyncBody = { novelId?: unknown; force?: unknown };

export async function POST(request: Request) {
  let body: SyncBody;

  try {
    body = (await request.json()) as SyncBody;
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_JSON", message: "The request body must be valid JSON." },
      { status: 400 }
    );
  }

  if (typeof body.novelId !== "string" || !body.novelId.trim()) {
    return NextResponse.json(
      { ok: false, code: "NOVEL_REQUIRED", message: "Select a novel before syncing to Notion." },
      { status: 400 }
    );
  }

  try {
    const result = await syncNovelToNotion(body.novelId, body.force === true);
    return NextResponse.json({
      ok: true,
      ...result,
      lastNotionSync: result.lastNotionSync?.toISOString() ?? null
    });
  } catch (error) {
    if (error instanceof NotionPublishError || error instanceof NotionApiError || error instanceof NotionSyncError) {
      return NextResponse.json(
        { ok: false, code: error.code, message: error.message },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { ok: false, code: "SYNC_FAILED", message: "Monogatari could not sync this novel to Notion." },
      { status: 500 }
    );
  }
}
