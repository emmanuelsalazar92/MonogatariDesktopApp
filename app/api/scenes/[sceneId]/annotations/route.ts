import { NextResponse } from "next/server";
import { getSceneAnnotationSummaries, NoteError } from "@/lib/db/notes";
import { resolvePlaceNovelId } from "@/lib/place-request";
import { isValidNovelRouteId } from "@/lib/studio-routes";
type Context = { params: Promise<{ sceneId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { sceneId } = await context.params, scope = resolvePlaceNovelId(request);
    if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
    if (!isValidNovelRouteId(sceneId)) return NextResponse.json({ error: "Invalid Scene ID" }, { status: 400 });
    return NextResponse.json(await getSceneAnnotationSummaries(scope.novelId, sceneId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof NoteError ? error.message : "Could not load Scene annotations" }, { status: error instanceof NoteError ? error.status : 500 });
  }
}
