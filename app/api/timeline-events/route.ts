import { NextResponse } from "next/server";
import { createTimelineEvent } from "@/lib/db/studio";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    novelId?: unknown;
    title?: unknown;
    internalDate?: unknown;
    volumeId?: unknown;
    chapterId?: unknown;
    sceneId?: unknown;
    locationId?: unknown;
    characterIds?: unknown;
    description?: unknown;
    isSpoiler?: unknown;
  };

  if (typeof body.novelId !== "string" || body.novelId.trim().length === 0) {
    return NextResponse.json({ error: "novelId is required" }, { status: 400 });
  }

  if (typeof body.title !== "string" || body.title.trim().length === 0) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  if (typeof body.internalDate !== "string" || body.internalDate.trim().length === 0) {
    return NextResponse.json({ error: "internalDate is required" }, { status: 400 });
  }

  const event = await createTimelineEvent({
    novelId: body.novelId.trim(),
    title: body.title.trim(),
    internalDate: body.internalDate.trim(),
    volumeId: typeof body.volumeId === "string" ? body.volumeId : undefined,
    chapterId: typeof body.chapterId === "string" ? body.chapterId : undefined,
    sceneId: typeof body.sceneId === "string" ? body.sceneId : undefined,
    locationId: typeof body.locationId === "string" ? body.locationId : undefined,
    characterIds: Array.isArray(body.characterIds)
      ? body.characterIds.filter((item): item is string => typeof item === "string")
      : undefined,
    description: typeof body.description === "string" ? body.description : undefined,
    isSpoiler: typeof body.isSpoiler === "boolean" ? body.isSpoiler : undefined
  });

  return NextResponse.json(event, { status: 201 });
}
