import { NextResponse } from "next/server";
import { updateTimelinePosition } from "@/lib/db/timeline-position";
import { resolvePlaceNovelId } from "@/lib/place-request";
import { isValidNovelRouteId } from "@/lib/studio-routes";
import { isTrustedLanMutationRequest } from "@/lib/request-security";
import { timelineErrorResponse } from "../../errors";

export async function PATCH(request: Request, context: { params: Promise<{ eventId: string }> }) {
  if (!isTrustedLanMutationRequest(request)) return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  try {
    const { eventId } = await context.params;
    if (!isValidNovelRouteId(eventId)) return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body) || !Number.isSafeInteger(body.positionRevision) || body.positionRevision < 0 || Object.keys(body).some(key => !["novelId", "positionRevision", "sortIndex", "internalDate", "chronologyKind", "relativeDay", "relativeMinute", "volumeId", "chapterId", "sceneId"].includes(key))) return NextResponse.json({ error: "Invalid position update" }, { status: 400 });
    const scope = resolvePlaceNovelId(request, body.novelId);
    if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
    return NextResponse.json(await updateTimelinePosition(scope.novelId, eventId, body.positionRevision, body));
  } catch (error) { return timelineErrorResponse(error); }
}
