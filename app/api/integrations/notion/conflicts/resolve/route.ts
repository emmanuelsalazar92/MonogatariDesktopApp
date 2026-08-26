import { NextResponse } from "next/server";

import {
  NotionPullError,
  resolveNotionConflict,
  type NotionConflictResolution
} from "@/lib/notion-conflict";
import { NotionApiError } from "@/lib/notion";
import { NotionPublishError } from "@/lib/notion-publish";

type ResolutionBody = { novelId?: unknown; chapterId?: unknown; resolution?: unknown };

export async function POST(request: Request) {
  let body: ResolutionBody;
  try {
    body = (await request.json()) as ResolutionBody;
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_JSON", message: "The request body must be valid JSON." },
      { status: 400 }
    );
  }

  const validResolution =
    body.resolution === "keep-local" || body.resolution === "accept-remote" || body.resolution === "cancel";
  if (
    typeof body.novelId !== "string" ||
    !body.novelId.trim() ||
    typeof body.chapterId !== "string" ||
    !body.chapterId.trim() ||
    !validResolution
  ) {
    return NextResponse.json(
      { ok: false, code: "RESOLUTION_REQUIRED", message: "Select a conflict resolution before continuing." },
      { status: 400 }
    );
  }

  try {
    const result = await resolveNotionConflict({
      novelId: body.novelId,
      chapterId: body.chapterId,
      resolution: body.resolution as NotionConflictResolution
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof NotionPullError) {
      return NextResponse.json(
        { ok: false, code: error.code, message: error.message, conflicts: error.conflicts },
        { status: error.status }
      );
    }
    if (error instanceof NotionApiError || error instanceof NotionPublishError) {
      return NextResponse.json(
        { ok: false, code: error.code, message: error.message },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { ok: false, code: "RESOLUTION_FAILED", message: "Monogatari could not resolve this Notion conflict." },
      { status: 500 }
    );
  }
}
