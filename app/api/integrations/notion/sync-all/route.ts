import { NextResponse } from "next/server";

import { syncAllConnectedNovels } from "@/lib/notion-sync";
import { notionDiagnostic } from "@/lib/notion-diagnostics";
import { isTrustedMutationRequest } from "@/lib/request-security";
import { SchemaCompatibilityError } from "@/lib/schema-compatibility";
import { logNotionOperation } from "@/lib/notion-operation-log";
import { randomUUID } from "node:crypto";
import { recordNotionHistory } from "@/lib/notion-history";

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return NextResponse.json({ ok: false, code: "UNTRUSTED_ORIGIN", message: "Cross-origin mutation rejected." }, { status: 403 });
  const operationId = randomUUID();
  logNotionOperation("started", { operationId, operation: "SYNC_ALL", direction: "BIDIRECTIONAL" });
  try {
    const results = await syncAllConnectedNovels();
    for (const result of results) if (result.diagnostic) { logNotionOperation("failed", { operationId: result.diagnostic.operationId, operation: "SYNC_ALL", direction: "BIDIRECTIONAL", novelId: result.novelId, diagnostic: result.diagnostic }); await recordNotionHistory({ operationId: result.diagnostic.operationId, operation: "SYNC_ALL", outcome: "failed", novelId: result.novelId, diagnostic: result.diagnostic }).catch(() => undefined); }
    logNotionOperation("completed", { operationId, operation: "SYNC_ALL", direction: "BIDIRECTIONAL" });
    await recordNotionHistory({ operationId, operation: "SYNC_ALL", outcome: "completed" }).catch(() => undefined);
    return NextResponse.json({ ok: true, operationId, results, message: results.length ? `Synced ${results.filter((result) => result.ok).length} of ${results.length} connected novels.` : "No novels are connected to Notion." });
  } catch (error) {
    const diagnostic = notionDiagnostic(error, "SYNC_ALL", "BIDIRECTIONAL", undefined, operationId);
    logNotionOperation("failed", { operationId, operation: "SYNC_ALL", direction: "BIDIRECTIONAL", diagnostic });
    await recordNotionHistory({ operationId, operation: "SYNC_ALL", outcome: "failed", diagnostic }).catch(() => undefined);
    if (error instanceof SchemaCompatibilityError) return NextResponse.json({ ok: false, code: error.code, message: error.message, diagnostic }, { status: 503 });
    return NextResponse.json({ ok: false, code: "SYNC_ALL_FAILED", message: "Monogatari could not run the requested sync." }, { status: 500 });
  }
}
