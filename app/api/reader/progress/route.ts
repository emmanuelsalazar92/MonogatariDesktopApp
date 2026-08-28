import { NextResponse } from "next/server";
import {
  getReadingProgress,
  ReadingProgressValidationError,
  saveReadingProgress
} from "@/lib/db/studio";
import type { ReaderScope } from "@/lib/reader-document";

const scopes = new Set<ReaderScope>(["scene", "chapter", "volume", "novel"]);

export async function GET(request: Request) {
  const novelId = new URL(request.url).searchParams.get("novelId")?.trim() || "";
  if (!novelId) return NextResponse.json({ error: "novelId is required" }, { status: 400 });
  return NextResponse.json(await getReadingProgress(novelId));
}

export async function PUT(request: Request) {
  const body = (await request.json()) as {
    novelId?: unknown;
    preferredScope?: unknown;
    sceneId?: unknown;
    positionRatio?: unknown;
  };
  if (
    typeof body.novelId !== "string" ||
    !body.novelId.trim() ||
    typeof body.sceneId !== "string" ||
    !body.sceneId.trim() ||
    typeof body.preferredScope !== "string" ||
    !scopes.has(body.preferredScope as ReaderScope) ||
    typeof body.positionRatio !== "number" ||
    !Number.isFinite(body.positionRatio)
  ) {
    return NextResponse.json({ error: "invalid reading progress" }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await saveReadingProgress(body.novelId.trim(), {
        preferredScope: body.preferredScope as ReaderScope,
        sceneId: body.sceneId.trim(),
        positionRatio: body.positionRatio
      })
    );
  } catch (error) {
    if (error instanceof ReadingProgressValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
