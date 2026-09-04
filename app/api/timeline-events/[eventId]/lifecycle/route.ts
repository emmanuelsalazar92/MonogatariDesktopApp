import { NextResponse } from "next/server";
import { getTimelineImpact, changeTimelineLifecycle } from "@/lib/db/timeline-lifecycle";
import { readTimelineLifecycle } from "@/lib/timeline-lifecycle";
import { resolvePlaceNovelId } from "@/lib/place-request";
import { isValidNovelRouteId } from "@/lib/studio-routes";
import { isTrustedLanMutationRequest } from "@/lib/request-security";
import { timelineErrorResponse } from "../../errors";

export async function GET(request: Request, context: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await context.params, scope = resolvePlaceNovelId(request);
    if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
    if (!isValidNovelRouteId(eventId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    return NextResponse.json(await getTimelineImpact(scope.novelId, eventId, new URL(request.url).searchParams.get("spoilers") === "true"), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return timelineErrorResponse(error); }
}
export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  if (!isTrustedLanMutationRequest(request)) return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  try {
    const { eventId } = await context.params, body = await request.json(), change = readTimelineLifecycle(body);
    if (!change || !isValidNovelRouteId(eventId)) return NextResponse.json({ error: "Confirmation and current impact are required" }, { status: 400 });
    const scope = resolvePlaceNovelId(request, body.novelId);
    if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
    return NextResponse.json(await changeTimelineLifecycle(scope.novelId, eventId, change, new URL(request.url).searchParams.get("spoilers") === "true"));
  } catch (error) { return timelineErrorResponse(error); }
}
