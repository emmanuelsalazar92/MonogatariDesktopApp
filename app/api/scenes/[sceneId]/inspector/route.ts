import { NextResponse } from "next/server";
import { getSceneInspector, SceneInspectorValidationError, updateSceneInspector } from "@/lib/db/studio";

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
  const body = await request.json() as Record<string, unknown>;
  const characterIds = Array.isArray(body.characterIds) && body.characterIds.every((id) => typeof id === "string") ? body.characterIds : null;
  const locationId = body.locationId === null || typeof body.locationId === "string" ? body.locationId : undefined;
  const timelineEventId = body.timelineEventId === null || typeof body.timelineEventId === "string" ? body.timelineEventId : undefined;
  if (!isString(body.summary) || !isString(body.objective) || !isString(body.notes) || !characterIds || characterIds.length > 50 || locationId === undefined || timelineEventId === undefined) {
    return NextResponse.json({ error: "scene metadata is invalid" }, { status: 400 });
  }
  try {
    return NextResponse.json(await updateSceneInspector((await context.params).sceneId, { summary: body.summary, objective: body.objective, notes: body.notes, characterIds, locationId, timelineEventId }));
  } catch (error) {
    if (error instanceof SceneInspectorValidationError) return NextResponse.json({ error: "scene metadata references are not available in this novel" }, { status: 400 });
    return NextResponse.json({ error: "scene metadata could not be saved" }, { status: 404 });
  }
}
