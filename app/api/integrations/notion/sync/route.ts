import { NextResponse } from "next/server";

import { NotionApiError, NotionPublishError, NotionSyncError, syncNovelToNotion } from "@/lib/notion-sync";
import { isTrustedMutationRequest } from "@/lib/request-security";
import { isValidNovelRouteId } from "@/lib/studio-routes";
import { notionDiagnostic } from "@/lib/notion-diagnostics";
import { logNotionOperation } from "@/lib/notion-operation-log";
import { SchemaCompatibilityError } from "@/lib/schema-compatibility";
import { randomUUID } from "node:crypto";
import { recordNotionHistory } from "@/lib/notion-history";

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

  const operationId = randomUUID();
  try {
    logNotionOperation("started", { operationId, operation: "SYNC_NOVEL", direction: "BIDIRECTIONAL", novelId: body.novelId });
    const result = await syncNovelToNotion(body.novelId, body.force === true);
    logNotionOperation("completed", { operationId, operation: "SYNC_NOVEL", direction: "BIDIRECTIONAL", novelId: body.novelId });
    await recordNotionHistory({ operationId, operation: "SYNC_NOVEL", outcome: "completed", novelId: body.novelId }).catch(() => undefined);
    return NextResponse.json({
      ok: true,
      ...result,
      lastNotionSync: result.lastNotionSync?.toISOString() ?? null,
      operationId
    }, { status: result.operationStatus === "syncing" ? 202 : 200 });
  } catch (error) {
    const diagnostic = notionDiagnostic(error, "SYNC_NOVEL", "BIDIRECTIONAL", { novelId: body.novelId }, operationId);
    logNotionOperation("failed", { operationId, operation: "SYNC_NOVEL", direction: "BIDIRECTIONAL", novelId: body.novelId, diagnostic });
    await recordNotionHistory({ operationId, operation: "SYNC_NOVEL", outcome: "failed", novelId: body.novelId, diagnostic }).catch(() => undefined);
    if (error instanceof SchemaCompatibilityError) {
      return NextResponse.json({ ok: false, code: error.code, message: error.message, diagnostic }, { status: 503 });
    }
    if (error instanceof NotionPublishError || error instanceof NotionApiError || error instanceof NotionSyncError) {
      return NextResponse.json(
        { ok: false, code: error.code, message: error.message, diagnostic },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { ok: false, code: "SYNC_FAILED", message: "Monogatari could not sync this novel to Notion.", diagnostic },
      { status: 500 }
    );
  }
}
