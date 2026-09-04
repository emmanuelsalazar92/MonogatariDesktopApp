import { NextResponse } from "next/server";
import { getScene, SceneRevisionConflictError, updateScene } from "@/lib/db/studio";
import type { ChapterStatus } from "@/lib/studio-domain";
import { ScenePlaceError } from "@/lib/db/scene-places";
import { isTrustedMutationRequest } from "@/lib/request-security";

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
  if (!isTrustedMutationRequest(request)) return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  const { sceneId } = await context.params;
  const body = (await request.json()) as {
    title?: unknown;
    content?: unknown;
    summary?: unknown;
    status?: unknown;
    objective?: unknown;
    locationId?: unknown;
    expectedRevision?: unknown;
  };

  if (typeof body.title === "string" && body.title.trim().length === 0) {
    return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
  }

  if (body.status !== undefined && !isChapterStatus(body.status)) {
    return NextResponse.json({ error: "status is invalid" }, { status: 400 });
  }
  if (
    body.expectedRevision !== undefined &&
    (typeof body.expectedRevision !== "number" ||
      !Number.isInteger(body.expectedRevision) ||
      body.expectedRevision < 0)
  ) {
    return NextResponse.json({ error: "expectedRevision is invalid" }, { status: 400 });
  }
  if (typeof body.content === "string" && body.content.length > 1_000_000) {
    return NextResponse.json({ error: "content is too large" }, { status: 413 });
  }

  try {
    const scene = await updateScene(sceneId, {
      title: typeof body.title === "string" ? body.title : undefined,
      content: typeof body.content === "string" ? body.content : undefined,
      summary: typeof body.summary === "string" ? body.summary : undefined,
      status: isChapterStatus(body.status) ? body.status : undefined,
      objective: typeof body.objective === "string" ? body.objective : undefined,
      locationId: typeof body.locationId === "string" ? body.locationId : undefined,
      expectedRevision: typeof body.expectedRevision === "number" ? body.expectedRevision : undefined
    });

    return NextResponse.json(scene);
  } catch (error) {
    if (error instanceof ScenePlaceError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SceneRevisionConflictError) {
      return NextResponse.json({ error: "scene changed elsewhere; reload before retrying" }, { status: 409 });
    }
    if (isPrismaNotFound(error)) {
      return NextResponse.json({ error: "scene not found" }, { status: 404 });
    }

    throw error;
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ sceneId: string }> }
) {
  const { sceneId } = await context.params;

  try {
    return NextResponse.json(await getScene(sceneId));
  } catch (error) {
    if (isPrismaNotFound(error)) {
      return NextResponse.json({ error: "scene not found" }, { status: 404 });
    }

    throw error;
  }
}

