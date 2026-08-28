import { NextResponse } from "next/server";
import { restoreSceneVersion, SceneVersionValidationError } from "@/lib/db/studio";

export async function POST(_request: Request, context: { params: Promise<{ sceneId: string; versionId: string }> }) {
  const { sceneId, versionId } = await context.params;
  try { return NextResponse.json(await restoreSceneVersion(sceneId, versionId)); }
  catch (error) { return NextResponse.json({ error: error instanceof SceneVersionValidationError ? "version is not available for this scene" : "scene not found" }, { status: 404 }); }
}
