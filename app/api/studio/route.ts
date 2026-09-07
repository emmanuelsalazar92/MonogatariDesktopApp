import { NextResponse } from "next/server";
import { getStudioSnapshot } from "@/lib/db/studio";
import { isNotionConfigured } from "@/lib/notion";
import { isValidNovelRouteId, isValidSceneRouteId } from "@/lib/studio-routes";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const librarySurface = params.get("surface") === "library";
  const overviewSurface = params.get("surface") === "overview";
  const sceneId = params.get("sceneId");
  const novelId = params.get("novelId");
  const requestedNovelId = novelId && isValidNovelRouteId(novelId) ? novelId : undefined;
  const requestedRouteScene =
    sceneId && requestedNovelId && isValidSceneRouteId(sceneId)
      ? { activeSceneContentId: sceneId, activeSceneNovelId: requestedNovelId }
      : {};
  const snapshot = await getStudioSnapshot({
    includeActiveSceneContent: !librarySurface && !overviewSurface,
    novelId: overviewSurface ? requestedNovelId : undefined,
    ...requestedRouteScene
  });
  const configured = isNotionConfigured() && Boolean(snapshot.studioSettings.notionRootPageId);
  return NextResponse.json({
    ...snapshot,
    notionSyncStates: snapshot.notionSyncStates.map((state) => ({ ...state, configured }))
  }, { headers: { "Cache-Control": "private, no-store" } });
}
