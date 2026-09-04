import { NextResponse } from "next/server";
import { updateTimelineEvent, getTimelineEventDetail } from "@/lib/db/studio";
import { readTimelineEvent } from "@/lib/timeline-event";
import { resolvePlaceNovelId } from "@/lib/place-request";
import { isValidNovelRouteId } from "@/lib/studio-routes";
import { isTrustedLanMutationRequest } from "@/lib/request-security";
import { timelineErrorResponse } from "../errors";

export async function GET(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await context.params;
  const params = new URL(request.url).searchParams, novelId = params.get("novelId");
  const headers = { "Cache-Control": "private, no-store" };
  if (!novelId || !isValidNovelRouteId(novelId) || !isValidNovelRouteId(eventId)) return NextResponse.json({ error: "Invalid IDs" }, { status: 400, headers });
  try {
    const event = await getTimelineEventDetail(novelId, eventId, params.get("spoilers") === "true");
    return event ? NextResponse.json(event, { headers }) : NextResponse.json({ error: "Event unavailable" }, { status: 404, headers });
  } catch { return NextResponse.json({ error: "Could not load event" }, { status: 500, headers }); }
}

export async function PATCH(request: Request, context: { params: Promise<{ eventId: string }> }) {
  if (!isTrustedLanMutationRequest(request)) return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  try {
    const { eventId } = await context.params;
    const body = await request.json();
    if (!isValidNovelRouteId(eventId) || !body || typeof body !== "object" || Array.isArray(body) || !Number.isSafeInteger(body.positionRevision) || body.positionRevision < 0 || Object.keys(body).some(key => !["novelId", "positionRevision", "title", "description", "isSpoiler", "locationId", "locationIds", "characterIds", "sortIndex", "internalDate", "chronologyKind", "relativeDay", "relativeMinute", "volumeId", "chapterId", "sceneId"].includes(key))) return NextResponse.json({ error: "Invalid event update" }, { status: 400 });
    const scope = resolvePlaceNovelId(request, body.novelId);
    if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
    const parsed = readTimelineEvent(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const data = parsed.data;
    return NextResponse.json(await updateTimelineEvent(eventId, body.positionRevision, { novelId: scope.novelId, ...data,
      characterIds: body.characterIds === undefined ? undefined : data.characterIds,
      locationIds: body.locationIds === undefined && body.locationId === undefined ? undefined : data.locationIds,
      volumeId: data.volumeId ?? undefined, chapterId: data.chapterId ?? undefined, sceneId: data.sceneId ?? undefined }));
  } catch (error) { return timelineErrorResponse(error); }
}
