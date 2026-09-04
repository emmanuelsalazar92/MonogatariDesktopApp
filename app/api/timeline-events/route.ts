import { NextResponse } from "next/server";
import { createTimelineEvent, listTimelineEventSummaries } from "@/lib/db/studio";
import { isValidNovelRouteId } from "@/lib/studio-routes";
import { resolvePlaceNovelId } from "@/lib/place-request";
import { isTrustedLanMutationRequest } from "@/lib/request-security";
import { readTimelineEvent } from "@/lib/timeline-event";
import { timelineErrorResponse } from "./errors";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams, novelId = params.get("novelId");
  const headers = { "Cache-Control": "private, no-store" };
  if (!novelId || !isValidNovelRouteId(novelId)) return NextResponse.json({ error: "Invalid novel ID" }, { status: 400, headers });
  try {
    // Search/filter locally on safe metadata; no search terms are sent or logged here.
    const selected = params.get("selected");
    return NextResponse.json(await listTimelineEventSummaries(novelId, params.get("spoilers") === "true", params.get("archived") === "true" ? "all" : "active", selected && isValidNovelRouteId(selected) ? selected : undefined), { headers });
  } catch { return NextResponse.json({ error: "Could not load Timeline" }, { status: 500, headers }); }
}

export async function POST(request: Request) {
  if (!isTrustedLanMutationRequest(request)) return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid event body" }, { status: 400 });
    const input = body as Record<string, unknown>;
    const context = resolvePlaceNovelId(request, input.novelId);
    if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
    const eventInput = readTimelineEvent(input);
    if (!eventInput.ok) return NextResponse.json({ error: eventInput.error }, { status: 400 });
    const data = eventInput.data;
    const event = await createTimelineEvent({
      novelId: context.novelId,
      ...data,
      volumeId: data.volumeId ?? undefined, chapterId: data.chapterId ?? undefined, sceneId: data.sceneId ?? undefined
    });
    return NextResponse.json(event, { status: 201 });
  } catch (error) { return timelineErrorResponse(error); }
}
