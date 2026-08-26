import { NextResponse } from "next/server";
import { updateAppSettings } from "@/lib/db/studio";

const selectionKeys = new Set([
  "activeNovelId",
  "activeStructureType",
  "activeStructureId",
  "activeChapterId",
  "activeSceneId"
]);

export async function PATCH(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  const entries = Object.entries(body).filter(
    ([key, value]) => selectionKeys.has(key) && typeof value === "string" && value.trim()
  );

  if (entries.length === 0) {
    return NextResponse.json({ error: "at least one selection is required" }, { status: 400 });
  }

  return NextResponse.json(
    await updateAppSettings(Object.fromEntries(entries.map(([key, value]) => [key, String(value).trim()])))
  );
}
