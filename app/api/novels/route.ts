import { NextResponse } from "next/server";
import { createNovel } from "@/lib/db/studio";
import { prisma } from "@/lib/db/prisma";
import { validateNovelMetadata } from "@/lib/novel-metadata";
import { isTrustedMutationRequest } from "@/lib/request-security";
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
  if (!isTrustedMutationRequest(request)) {
    return NextResponse.json({ error: "Cross-origin mutation rejected" }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid novel metadata" }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const validation = validateNovelMetadata({
    title: input.title,
    synopsis: input.synopsis ?? "",
    genre: input.genre ?? "",
    tags: input.tags ?? []
  });
  if (!validation.ok) return NextResponse.json(validation, { status: 400 });

  const novel = await createNovel({
    ...validation.data,
    status: isNovelStatus(input.status) ? input.status : undefined
  });

  return NextResponse.json(novel, { status: 201 });
}

