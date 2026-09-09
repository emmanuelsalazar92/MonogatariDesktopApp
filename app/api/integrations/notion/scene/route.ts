import { NextResponse } from "next/server";
import { isTrustedMutationRequest } from "@/lib/request-security";
import { reconcileSceneWithNotion, resolveNotionSceneConflict, runNotionSceneOperation, NotionSyncError } from "@/lib/notion-sync";
import { NotionPullError } from "@/lib/notion-pull";
import { NotionApiError } from "@/lib/notion";
import { NotionPublishError } from "@/lib/notion-publish";
import { isValidNovelRouteId, isValidSceneRouteId } from "@/lib/studio-routes";
import { recordNotionHistory } from "@/lib/notion-history";
import { notionDiagnostic } from "@/lib/notion-diagnostics";
import { randomUUID } from "node:crypto";

type SceneMode = "pull" | "push" | "reconcile" | "keep-monogatari" | "keep-notion";

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return NextResponse.json({ ok: false, code: "UNTRUSTED_ORIGIN", message: "Cross-origin mutation rejected." }, { status: 403 });
  const body = await request.json().catch(() => null) as { novelId?: unknown; sceneId?: unknown; mode?: unknown } | null;
  const mode = body?.mode as SceneMode;
  if (!body || typeof body.novelId !== "string" || !isValidNovelRouteId(body.novelId) || typeof body.sceneId !== "string" || !isValidSceneRouteId(body.sceneId) || !["push", "pull", "reconcile", "keep-monogatari", "keep-notion"].includes(mode)) return NextResponse.json({ ok: false, code: "SCENE_OPERATION_REQUIRED", message: "Select a valid Scene operation." }, { status: 400 });
  try {
    const result = mode === "reconcile"
      ? await reconcileSceneWithNotion(body.novelId, body.sceneId)
      : mode === "keep-monogatari" || mode === "keep-notion"
        ? await resolveNotionSceneConflict(body.novelId, body.sceneId, mode === "keep-monogatari" ? "KEEP_MONOGATARI" : "KEEP_NOTION")
        : await runNotionSceneOperation(body.novelId, body.sceneId, mode === "push" ? "PUSH" : "PULL");
    const operation = mode === "pull" || mode === "keep-notion" ? "PULL_SCENE" : mode === "push" || mode === "keep-monogatari" ? "PUSH_SCENE" : "RECONCILE_SCENE";
    const direction = operation === "PULL_SCENE" ? "PULL" as const : operation === "PUSH_SCENE" ? "PUSH" as const : "BIDIRECTIONAL" as const;
    await recordNotionHistory({ operationId: result.operationId ?? randomUUID(), operation, outcome: "completed", direction, novelId: body.novelId, sceneId: body.sceneId }).catch(() => undefined);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const operationId = randomUUID();
    const diagnostic = notionDiagnostic(error, mode === "pull" || mode === "keep-notion" ? "PULL_NOVEL" : "SYNC_NOVEL", mode === "pull" || mode === "keep-notion" ? "PULL" : mode === "push" || mode === "keep-monogatari" ? "PUSH" : "BIDIRECTIONAL", { novelId: body.novelId, sceneId: body.sceneId }, operationId);
    await recordNotionHistory({ operationId, operation: mode === "pull" || mode === "keep-notion" ? "PULL_SCENE" : mode === "push" || mode === "keep-monogatari" ? "PUSH_SCENE" : "RECONCILE_SCENE", outcome: "failed", direction: diagnostic.direction, novelId: body.novelId, sceneId: body.sceneId, diagnostic }).catch(() => undefined);
    if (error instanceof NotionPullError || error instanceof NotionSyncError) return NextResponse.json({ ok: false, code: error.code, message: error.message, operationId, diagnostic, ...(error instanceof NotionPullError ? { results: error.results, conflicts: error.conflicts } : {}) }, { status: error.status });
    if (error instanceof NotionApiError || error instanceof NotionPublishError) return NextResponse.json({ ok: false, code: error.code, message: error.message, operationId, diagnostic }, { status: error.status });
    return NextResponse.json({ ok: false, code: "SCENE_OPERATION_FAILED", message: "The Scene operation could not complete.", operationId, diagnostic }, { status: 500 });
  }
}
