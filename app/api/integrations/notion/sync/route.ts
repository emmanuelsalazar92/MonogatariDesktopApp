import { NextResponse } from "next/server";

import { NotionApiError, NotionPublishError, NotionSyncError, syncNovelToNotion } from "@/lib/notion-sync";
import { isTrustedMutationRequest } from "@/lib/request-security";
import { isValidNovelRouteId } from "@/lib/studio-routes";

type SyncBody = { novelId?: unknown; force?: unknown };

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) {
    return NextResponse.json(
      { ok: false, code: "UNTRUSTED_ORIGIN", message: "Cross-origin mutation rejected." },
      { status: 403 }
    );
  }

  let body: SyncBody;

  try {
    body = (await request.json()) as SyncBody;
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_JSON", message: "The request body must be valid JSON." },
      { status: 400 }
    );
  }

  if (typeof body.novelId !== "string" || !isValidNovelRouteId(body.novelId)) {
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
      lastNotionSync: result.lastNotionSync?.toISOString() ?? null,
      operationId: undefined
    }, { status: result.operationStatus === "syncing" ? 202 : 200 });
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
