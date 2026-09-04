import { NextResponse } from "next/server";
import { getSceneInspector, SceneInspectorValidationError, updateSceneInspector } from "@/lib/db/studio";
import { isTrustedMutationRequest } from "@/lib/request-security";
import { isValidPlaceRouteId } from "@/lib/studio-routes";
import { ScenePlaceError } from "@/lib/db/scene-places";

function isString(value: unknown, maximum = 20_000): value is string {
  return typeof value === "string" && value.length <= maximum;
}

export async function GET(_request: Request, context: { params: Promise<{ sceneId: string }> }) {
  try {
    return NextResponse.json(await getSceneInspector((await context.params).sceneId));
  } catch {
    return NextResponse.json({ error: "scene not found" }, { status: 404 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ sceneId: string }> }) {
  if (!isTrustedMutationRequest(request)) return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  let body: Record<string, unknown>;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    body = value as Record<string, unknown>;
  } catch { return NextResponse.json({ error: "Invalid metadata body" }, { status: 400 }); }
  const characterIds = Array.isArray(body.characterIds) && body.characterIds.every((id) => typeof id === "string") ? body.characterIds : null;
  const validIds = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 200 && value.every((id) => typeof id === "string" && isValidPlaceRouteId(id));
  const locationIds = validIds(body.locationIds) ? body.locationIds : undefined;
  const expectedLocationIds = validIds(body.expectedLocationIds) ? body.expectedLocationIds : undefined;
  const timelineEventId = body.timelineEventId === null || typeof body.timelineEventId === "string" ? body.timelineEventId : undefined;
  if (!isString(body.summary) || !isString(body.objective) || !isString(body.notes) || !characterIds || characterIds.length > 50 || !locationIds || !expectedLocationIds || timelineEventId === undefined) {
    return NextResponse.json({ error: "scene metadata is invalid" }, { status: 400 });
  }
  try {
    return NextResponse.json(await updateSceneInspector((await context.params).sceneId, { summary: body.summary, objective: body.objective, notes: body.notes, characterIds, locationIds, expectedLocationIds, timelineEventId }));
  } catch (error) {
    if (error instanceof ScenePlaceError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SceneInspectorValidationError) return NextResponse.json({ error: "scene metadata references are not available in this novel" }, { status: 400 });
    return NextResponse.json({ error: "scene metadata could not be saved" }, { status: 404 });
  }
}
