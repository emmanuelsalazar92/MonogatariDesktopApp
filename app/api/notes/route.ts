import { NextResponse } from "next/server";
import { createNote } from "@/lib/db/studio";
import type { Note } from "@/lib/studio-domain";

const linkedTypes = new Set([
  "Novel",
  "Volume",
  "Chapter",
  "Scene",
  "Character",
  "Place"
]);

function isLinkedType(value: unknown): value is Note["linkedType"] {
  return typeof value === "string" && linkedTypes.has(value);
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    novelId?: unknown;
    title?: unknown;
    content?: unknown;
    linkedType?: unknown;
    linkedId?: unknown;
    tags?: unknown;
  };

  if (typeof body.novelId !== "string" || body.novelId.trim().length === 0) {
    return NextResponse.json({ error: "novelId is required" }, { status: 400 });
  }

  if (typeof body.title !== "string" || body.title.trim().length === 0) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const note = await createNote({
    novelId: body.novelId.trim(),
    title: body.title.trim(),
    content: typeof body.content === "string" ? body.content : undefined,
    linkedType: isLinkedType(body.linkedType) ? body.linkedType : undefined,
    linkedId: typeof body.linkedId === "string" ? body.linkedId : undefined,
    tags: Array.isArray(body.tags)
      ? body.tags.filter((tag): tag is string => typeof tag === "string")
      : undefined
  });

  return NextResponse.json(note, { status: 201 });
}

