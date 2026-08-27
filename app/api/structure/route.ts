import { NextResponse } from "next/server";
import {
  createStructureItem,
  deleteStructureItem,
  mutateStructureItem,
  updateStructureItem,
  type StructureAction,
  type StructureItemType
} from "@/lib/db/structure";
import type { ChapterStatus } from "@/lib/studio-domain";

const itemTypes = new Set<StructureItemType>(["volume", "chapter", "scene"]);
const actions = new Set<StructureAction>(["move", "duplicate", "archive", "restore"]);
const chapterStatuses = new Set<ChapterStatus>([
  "Idea",
  "Draft",
  "Writing",
  "Revision",
  "Ready",
  "Final",
  "Archived"
]);

function isItemType(value: unknown): value is StructureItemType {
  return typeof value === "string" && itemTypes.has(value as StructureItemType);
}

function isAction(value: unknown): value is StructureAction {
  return typeof value === "string" && actions.has(value as StructureAction);
}

function isChapterStatus(value: unknown): value is ChapterStatus {
  return typeof value === "string" && chapterStatuses.has(value as ChapterStatus);
}

function apiError(error: unknown) {
  if (
    error instanceof Error &&
    (error.message.startsWith("cannot create inside") ||
      error.message.startsWith("cannot create outside"))
  ) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  if (typeof error === "object" && error !== null && "code" in error) {
    if (error.code === "P2025") {
      return NextResponse.json({ error: "structure item not found" }, { status: 404 });
    }
    if (error.code === "P2003") {
      return NextResponse.json(
        { error: "a linked record prevents this operation" },
        { status: 409 }
      );
    }
  }

  throw error;
}

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;

  if (!isItemType(body.type)) {
    return NextResponse.json({ error: "type is invalid" }, { status: 400 });
  }
  if (typeof body.novelId !== "string" || body.novelId.length === 0) {
    return NextResponse.json({ error: "novelId is required" }, { status: 400 });
  }
  if (typeof body.parentId !== "string" || body.parentId.length === 0) {
    return NextResponse.json({ error: "parentId is required" }, { status: 400 });
  }
  if (typeof body.title !== "string" || body.title.trim().length === 0) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (body.status !== undefined && !isChapterStatus(body.status)) {
    return NextResponse.json({ error: "status is invalid" }, { status: 400 });
  }

  try {
    const result = await createStructureItem({
      type: body.type,
      novelId: body.novelId,
      parentId: body.parentId,
      title: body.title.trim(),
      summary: typeof body.summary === "string" ? body.summary.trim() : undefined,
      status: isChapterStatus(body.status) ? body.status : undefined,
      objective: typeof body.objective === "string" ? body.objective.trim() : undefined,
      content: typeof body.content === "string" ? body.content : undefined,
      locationId: typeof body.locationId === "string" ? body.locationId : undefined
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;

  if (!isItemType(body.type) || typeof body.id !== "string" || body.id.length === 0) {
    return NextResponse.json({ error: "type and id are required" }, { status: 400 });
  }

  if (body.action !== undefined) {
    if (!isAction(body.action)) {
      return NextResponse.json({ error: "action is invalid" }, { status: 400 });
    }
    if (
      body.action === "move" &&
      body.direction !== "before" &&
      body.direction !== "after"
    ) {
      return NextResponse.json({ error: "move direction is invalid" }, { status: 400 });
    }

    try {
      const result = await mutateStructureItem(
        body.type,
        body.id,
        body.action,
        body.direction === "before" || body.direction === "after" ? body.direction : undefined
      );
      return NextResponse.json(result);
    } catch (error) {
      return apiError(error);
    }
  }

  if (typeof body.title === "string" && body.title.trim().length === 0) {
    return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
  }
  if (body.status !== undefined && !isChapterStatus(body.status)) {
    return NextResponse.json({ error: "status is invalid" }, { status: 400 });
  }

  try {
    const result = await updateStructureItem(body.type, body.id, {
      title: typeof body.title === "string" ? body.title.trim() : undefined,
      summary: typeof body.summary === "string" ? body.summary.trim() : undefined,
      status: isChapterStatus(body.status) ? body.status : undefined,
      objective: typeof body.objective === "string" ? body.objective.trim() : undefined,
      content: typeof body.content === "string" ? body.content : undefined,
      locationId: typeof body.locationId === "string" ? body.locationId : undefined
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;

  if (!isItemType(body.type) || typeof body.id !== "string" || body.id.length === 0) {
    return NextResponse.json({ error: "type and id are required" }, { status: 400 });
  }

  try {
    return NextResponse.json(await deleteStructureItem(body.type, body.id));
  } catch (error) {
    return apiError(error);
  }
}
