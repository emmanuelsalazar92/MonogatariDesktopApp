import { NextResponse } from "next/server";
import { getChapterPreview } from "@/lib/db/studio";

function isPrismaNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2025";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ chapterId: string }> }
) {
  const { chapterId } = await context.params;

  try {
    return NextResponse.json(await getChapterPreview(chapterId));
  } catch (error) {
    if (isPrismaNotFound(error)) {
      return NextResponse.json({ error: "chapter not found" }, { status: 404 });
    }

    throw error;
  }
}
