import { NextResponse } from "next/server";
import { createNovel } from "@/lib/db/studio";
import { prisma } from "@/lib/db/prisma";
import type { NovelStatus } from "@/lib/studio-domain";

const novelStatuses = new Set([
  "Idea",
  "Planning",
  "Writing",
  "Revision",
  "Complete",
  "Archived"
]);

function isNovelStatus(value: unknown): value is NovelStatus {
  return typeof value === "string" && novelStatuses.has(value);
}

export async function GET() {
  const novels = await prisma.novel.findMany({
    orderBy: { updatedAt: "desc" }
  });

  return NextResponse.json(
    novels.map((novel) => ({
      ...novel,
      tags: JSON.parse(novel.tags),
      createdAt: novel.createdAt.toISOString().slice(0, 10),
      updatedAt: novel.updatedAt.toISOString().slice(0, 10)
    }))
  );
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    title?: unknown;
    synopsis?: unknown;
    genre?: unknown;
    status?: unknown;
    tags?: unknown;
  };

  if (typeof body.title !== "string" || body.title.trim().length === 0) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const novel = await createNovel({
    title: body.title.trim(),
    synopsis: typeof body.synopsis === "string" ? body.synopsis : undefined,
    genre: typeof body.genre === "string" ? body.genre : undefined,
    status: isNovelStatus(body.status) ? body.status : undefined,
    tags: Array.isArray(body.tags)
      ? body.tags.filter((tag): tag is string => typeof tag === "string")
      : undefined
  });

  return NextResponse.json(novel, { status: 201 });
}

