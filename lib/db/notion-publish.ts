import "server-only";

import { prisma } from "@/lib/db/prisma";

export type NotionPublishSource = Awaited<ReturnType<typeof getNotionPublishSource>>;

export async function getNotionRootPageId() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: "notionRootPageId" }
  });
  return setting?.value.trim() || null;
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
