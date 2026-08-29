import { NextResponse } from "next/server";

import { getReaderOutline } from "@/lib/db/studio";

export async function GET(request: Request) {
  const novelId = new URL(request.url).searchParams.get("novelId");
  if (!novelId) return NextResponse.json({ error: "novelId is required" }, { status: 400 });

  const outline = await getReaderOutline(novelId);
  if (!outline) return NextResponse.json({ error: "novel not found" }, { status: 404 });
  return NextResponse.json(outline);
}
