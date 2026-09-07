import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ExportError, type ExportRequest } from "@/lib/export-contract";
import {
  parseExportTags,
  sanitizeExportText,
  type ExportChapter,
  type ExportModel,
  type ExportScene,
  type ExportVolume
} from "@/lib/export-model";

type ExportDatabase = Pick<typeof prisma, "$transaction">;

const sceneSelect = {
  id: true,
  title: true,
  content: true,
  sortOrder: true
} satisfies Prisma.SceneSelect;

const chapterSelect = {
  id: true,
  title: true,
  summary: true,
  sortOrder: true,
  scenes: {
    where: { archived: false },
    orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
    select: sceneSelect
  }
} satisfies Prisma.ChapterSelect;

const volumeSelect = {
  id: true,
  title: true,
  summary: true,
  sortOrder: true,
  chapters: {
    where: { archived: false },
    orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
    select: chapterSelect
  }
} satisfies Prisma.VolumeSelect;

export async function loadCanonicalExportModel(request: ExportRequest, database: ExportDatabase = prisma) {
  return database.$transaction(async (tx) => {
    const novel = await tx.novel.findFirst({
      where: { id: request.novelId, status: { not: "Archived" } },
      select: { id: true, title: true, synopsis: true, genre: true, tags: true }
    });
    if (!novel) throw new ExportError("NOVEL_NOT_FOUND", "Novel was not found.", 404, false);

    let volumes: ExportVolume[] = [];
    if (request.scope === "novel") {
      const rows = await tx.volume.findMany({
        where: { novelId: request.novelId, archived: false },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: volumeSelect
      });
      volumes = rows.map(mapVolume);
    } else if (request.scope === "volume") {
      const row = await tx.volume.findFirst({
        where: { id: request.scopeId!, novelId: request.novelId, archived: false },
        select: volumeSelect
      });
      if (!row) throw scopeNotFound();
      volumes = [mapVolume(row)];
    } else if (request.scope === "chapter") {
      const row = await tx.chapter.findFirst({
        where: {
          id: request.scopeId!,
          archived: false,
          volume: { novelId: request.novelId, archived: false }
        },
        select: { ...chapterSelect, volume: { select: { id: true, title: true, summary: true, sortOrder: true } } }
      });
      if (!row) throw scopeNotFound();
      volumes = [{ ...mapVolumeMetadata(row.volume), chapters: [mapChapter(row)] }];
    } else {
      const row = await tx.scene.findFirst({
        where: {
          id: request.scopeId!,
          archived: false,
          chapter: { archived: false, volume: { novelId: request.novelId, archived: false } }
        },
        select: {
          ...sceneSelect,
          chapter: {
            select: {
              id: true,
              title: true,
              summary: true,
              sortOrder: true,
              volume: { select: { id: true, title: true, summary: true, sortOrder: true } }
            }
          }
        }
      });
      if (!row) throw scopeNotFound();
      volumes = [{
        ...mapVolumeMetadata(row.chapter.volume),
        chapters: [{ ...mapChapterMetadata(row.chapter), scenes: [mapScene(row)] }]
      }];
    }

    return {
      novel: {
        id: novel.id,
        title: sanitizeExportText(novel.title, 160) || "Untitled novel",
        synopsis: sanitizeExportText(novel.synopsis),
        genre: sanitizeExportText(novel.genre, 120),
        tags: parseExportTags(novel.tags)
      },
      scope: { type: request.scope, id: request.scopeId ?? request.novelId },
      volumes
    } satisfies ExportModel;
  });
}

function scopeNotFound() {
  // Missing and cross-Novel IDs intentionally share one response.
  return new ExportError("SCOPE_NOT_FOUND", "Export scope was not found.", 404, false);
}

function mapScene(row: { id: string; title: string; content: string; sortOrder: number }): ExportScene {
  return {
    id: row.id,
    title: sanitizeExportText(row.title, 300),
    content: sanitizeExportText(row.content),
    sortOrder: row.sortOrder
  };
}

function mapChapterMetadata(row: { id: string; title: string; summary: string; sortOrder: number }) {
  return {
    id: row.id,
    title: sanitizeExportText(row.title, 300),
    summary: sanitizeExportText(row.summary, 5_000),
    sortOrder: row.sortOrder
  };
}

function mapChapter(row: Parameters<typeof mapChapterMetadata>[0] & { scenes: Array<Parameters<typeof mapScene>[0]> }): ExportChapter {
  return { ...mapChapterMetadata(row), scenes: row.scenes.map(mapScene) };
}

function mapVolumeMetadata(row: { id: string; title: string; summary: string; sortOrder: number }) {
  return {
    id: row.id,
    title: sanitizeExportText(row.title, 300),
    summary: sanitizeExportText(row.summary, 5_000),
    sortOrder: row.sortOrder
  };
}

function mapVolume(row: Parameters<typeof mapVolumeMetadata>[0] & { chapters: Array<Parameters<typeof mapChapter>[0]> }): ExportVolume {
  return { ...mapVolumeMetadata(row), chapters: row.chapters.map(mapChapter) };
}
