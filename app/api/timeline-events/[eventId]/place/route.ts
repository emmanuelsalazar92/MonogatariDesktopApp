import { NextResponse } from "next/server";
import { changeTimelinePlace } from "@/lib/db/timeline-places";
import { readTimelinePlaceChange } from "@/lib/timeline-place";
import { resolvePlaceNovelId } from "@/lib/place-request";
import { isTrustedLanMutationRequest } from "@/lib/request-security";
import { isValidNovelRouteId } from "@/lib/studio-routes";
import { timelineErrorResponse } from "../../errors";

export async function PATCH(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  if (!isTrustedLanMutationRequest(request)) return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  const { eventId } = await params;
  if (!isValidNovelRouteId(eventId)) return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });
  try {
    const body: unknown = await request.json();
    const change = readTimelinePlaceChange(body);
    if (!change) return NextResponse.json({ error: "locationId, linked and expectedLinked are required" }, { status: 400 });
    const context = resolvePlaceNovelId(request, (body as Record<string, unknown>).novelId);
    if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
    return NextResponse.json(await changeTimelinePlace(context.novelId, eventId, change));
  } catch (error) { return timelineErrorResponse(error); }
}
