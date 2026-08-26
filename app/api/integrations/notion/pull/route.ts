import { NextResponse } from "next/server";

import { NotionApiError } from "@/lib/notion";
import { NotionPullError, pullNovelFromNotion } from "@/lib/notion-pull";
import { NotionPublishError } from "@/lib/notion-publish";

type PullBody = { novelId?: unknown; chapterId?: unknown };

export async function POST(request: Request) {
  let body: PullBody;
  try {
    body = (await request.json()) as PullBody;
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_JSON", message: "The request body must be valid JSON." },
      { status: 400 }
    );
  }

  if (typeof body.novelId !== "string" || !body.novelId.trim()) {
    return NextResponse.json(
      { ok: false, code: "NOVEL_REQUIRED", message: "Select a novel before updating from Notion." },
      { status: 400 }
    );
  }

  try {
    const result = await pullNovelFromNotion(
      body.novelId,
      typeof body.chapterId === "string" && body.chapterId.trim() ? body.chapterId : undefined
    );
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
      { ok: false, code: "PULL_FAILED", message: "Monogatari could not update from Notion." },
      { status: 500 }
    );
  }
}
