import { NextResponse } from "next/server";
import { updateScene } from "@/lib/db/studio";
import type { ChapterStatus } from "@/lib/studio-domain";

const chapterStatuses = new Set([
  "Idea",
  "Draft",
  "Writing",
  "Revision",
  "Ready",
  "Final",
  "Archived"
]);

function isChapterStatus(value: unknown): value is ChapterStatus {
  return typeof value === "string" && chapterStatuses.has(value);
}

function isPrismaNotFound(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2025"
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ sceneId: string }> }
) {
  const { sceneId } = await context.params;
  const body = (await request.json()) as {
    title?: unknown;
    content?: unknown;
    summary?: unknown;
    status?: unknown;
    objective?: unknown;
    locationId?: unknown;
  };

  if (typeof body.title === "string" && body.title.trim().length === 0) {
    return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
  }

  if (body.status !== undefined && !isChapterStatus(body.status)) {
    return NextResponse.json({ error: "status is invalid" }, { status: 400 });
  }

  try {
    const scene = await updateScene(sceneId, {
      title: typeof body.title === "string" ? body.title : undefined,
      content: typeof body.content === "string" ? body.content : undefined,
      summary: typeof body.summary === "string" ? body.summary : undefined,
      status: isChapterStatus(body.status) ? body.status : undefined,
      objective: typeof body.objective === "string" ? body.objective : undefined,
      locationId: typeof body.locationId === "string" ? body.locationId : undefined
    });

    return NextResponse.json(scene);
  } catch (error) {
    if (isPrismaNotFound(error)) {
      return NextResponse.json({ error: "scene not found" }, { status: 404 });
    }

    throw error;
  }
}

