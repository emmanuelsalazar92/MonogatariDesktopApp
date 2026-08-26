import { NextResponse } from "next/server";

import { NotionApiError } from "@/lib/notion";
import { NotionPublishError, publishNovelToNotion } from "@/lib/notion-publish";

export async function POST(request: Request) {
  let body: { novelId?: unknown };

  try {
    body = (await request.json()) as { novelId?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_JSON", message: "The request body must be valid JSON." },
      { status: 400 }
    );
  }

  if (typeof body.novelId !== "string" || !body.novelId.trim()) {
    return NextResponse.json(
      { ok: false, code: "NOVEL_REQUIRED", message: "Select a novel before publishing to Notion." },
      { status: 400 }
    );
  }

  try {
    const result = await publishNovelToNotion(body.novelId);
    return NextResponse.json({
      ok: true,
      message: `Published ${result.createdPages} new page(s) and updated ${result.updatedPages} existing page(s).`,
      novelPage: result.novelPage,
      createdPages: result.createdPages,
      updatedPages: result.updatedPages
    });
  } catch (error) {
    if (error instanceof NotionPublishError || error instanceof NotionApiError) {
      return NextResponse.json(
        { ok: false, code: error.code, message: error.message },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { ok: false, code: "PUBLISH_FAILED", message: "Monogatari could not publish this novel to Notion." },
      { status: 500 }
    );
  }
}
