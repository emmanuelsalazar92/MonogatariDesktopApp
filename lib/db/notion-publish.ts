import "server-only";

import { prisma } from "@/lib/db/prisma";
import { getStudioSettings } from "@/lib/db/studio";

export type NotionPublishSource = Awaited<ReturnType<typeof getNotionPublishSource>>;

export async function getNotionRootPageId() {
  const settings = await getStudioSettings();
  return settings.notionRootPageId.trim() || null;
}

export async function getNotionPublishSource(novelId: string) {
  const novel = await prisma.novel.findUnique({ where: { id: novelId } });
  if (!novel) return null;

  const volumes = await prisma.volume.findMany({
    where: { novelId, archived: false },
    orderBy: { sortOrder: "asc" }
  });
  const volumeIds = volumes.map((volume) => volume.id);
  const chapters = await prisma.chapter.findMany({
    where: { volumeId: { in: volumeIds }, archived: false },
    orderBy: [{ volumeId: "asc" }, { sortOrder: "asc" }]
  });
  const chapterIds = chapters.map((chapter) => chapter.id);
  const [scenes, characters] = await Promise.all([
    prisma.scene.findMany({
      where: { chapterId: { in: chapterIds }, archived: false },
      orderBy: [{ chapterId: "asc" }, { sortOrder: "asc" }]
    }),
    prisma.character.findMany({ where: { novelId }, orderBy: { name: "asc" } })
  ]);

  return { novel, volumes, chapters, scenes, characters };
}

export async function getNotionMappings(novelId: string) {
  return prisma.notionMapping.findMany({ where: { novelId } });
}

/** A novel is connected only when its own root page has been recorded. */
export async function isNotionNovelConnected(novelId: string) {
  const mapping = await prisma.notionMapping.findUnique({
    where: { localId: `novel:${novelId}` },
    select: { novelId: true, entityType: true }
  });
  return mapping?.novelId === novelId && mapping.entityType === "novel";
}

/** Disconnect is deliberately local-only: neither Notion pages nor manuscript data are deleted. */
export async function disconnectNotionNovel(novelId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.notionMapping.deleteMany({ where: { novelId } });
    return tx.notionSyncState.upsert({
      where: { novelId },
      update: {
        isDirty: true,
        syncStatus: "idle",
        syncOperationId: null,
        syncStartedAt: null,
        syncLeaseExpiresAt: null,
        syncSnapshotRevision: null,
        lastSyncError: null
      },
      create: { novelId, isDirty: true }
    });
  });
}

export async function upsertNotionMapping(input: {
  localId: string;
  entityType: string;
  novelId: string;
  notionPageId: string;
}) {
  return prisma.notionMapping.upsert({
    where: { localId: input.localId },
    update: {
      entityType: input.entityType,
      novelId: input.novelId,
      notionPageId: input.notionPageId
    },
    create: input
  });
}
