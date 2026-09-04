import { NextResponse } from "next/server";
import { listPlaceSceneOptions, changePlaceScenes, ScenePlaceError } from "@/lib/db/scene-places";
import { resolvePlaceNovelId } from "@/lib/place-request";
import { readScenePlaceChanges } from "@/lib/scene-place";
import { isValidPlaceRouteId } from "@/lib/studio-routes";
import { isTrustedMutationRequest } from "@/lib/request-security";
import { placeErrorResponse } from "../../errors";

type Context = { params: Promise<{ placeId: string }> };
const errorResponse = (error: unknown) => error instanceof ScenePlaceError
  ? NextResponse.json({ error: error.message }, { status: error.status }) : placeErrorResponse(error);

export async function GET(request: Request, { params }: Context) {
  const { placeId } = await params;
  if (!isValidPlaceRouteId(placeId)) return NextResponse.json({ error: "Invalid placeId" }, { status: 400 });
  const context = resolvePlaceNovelId(request);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  try { return NextResponse.json(await listPlaceSceneOptions(context.novelId, placeId), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}
export async function PATCH(request: Request, { params }: Context) {
  if (!isTrustedMutationRequest(request)) return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  const { placeId } = await params;
  if (!isValidPlaceRouteId(placeId)) return NextResponse.json({ error: "Invalid placeId" }, { status: 400 });
  try {
    const body: unknown = await request.json();
    const changes = readScenePlaceChanges(body);
    if (!changes) return NextResponse.json({ error: "Invalid Scene–Place changes (maximum 200 per operation)" }, { status: 400 });
    const context = resolvePlaceNovelId(request, (body as Record<string, unknown>).novelId);
    if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
    return NextResponse.json(await changePlaceScenes(context.novelId, placeId, changes));
  } catch (error) { return errorResponse(error); }
}
