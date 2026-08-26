import "server-only";

import { prisma } from "@/lib/db/prisma";

export type RemoteSceneUpdate = { title: string; content: string };

function countWords(value: string) {
  return value.trim().match(/\S+/g)?.length ?? 0;
}

export async function applyNotionChapterUpdates(
  novelId: string,
  updates: Array<{ chapterId: string; title?: string; scenes: RemoteSceneUpdate[] }>
) {
  return prisma.$transaction(async (tx) => {
    for (const update of updates) {
      const chapter = await tx.chapter.findUniqueOrThrow({
        where: { id: update.chapterId },
        include: {
          volume: true,
          scenes: { where: { archived: false }, orderBy: { sortOrder: "asc" } }
        }
      });

      if (chapter.volume.novelId !== novelId) {
        throw new Error("chapter does not belong to the selected novel");
      }
      if (chapter.scenes.length !== update.scenes.length) {
        throw new Error("remote scene structure does not match the local chapter");
      }

      await Promise.all(
        chapter.scenes.map((scene, index) =>
          tx.scene.update({
            where: { id: scene.id },
            data: {
              title: update.scenes[index].title,
              content: update.scenes[index].content,
              wordCount: countWords(update.scenes[index].content)
            }
          })
        )
      );
      if (update.title) {
        await tx.chapter.update({ where: { id: chapter.id }, data: { title: update.title } });
      }
    }

    const chapters = await tx.chapter.findMany({
      where: { volume: { novelId } },
      include: { scenes: { select: { wordCount: true } } }
    });
    await Promise.all(
      chapters.map((chapter) =>
        tx.chapter.update({
          where: { id: chapter.id },
          data: { wordCount: chapter.scenes.reduce((total, scene) => total + scene.wordCount, 0) }
        })
      )
    );
    await tx.novel.update({
      where: { id: novelId },
      data: {
        wordCount: chapters.reduce(
          (total, chapter) => total + chapter.scenes.reduce((sum, scene) => sum + scene.wordCount, 0),
          0
        ),
        updatedAt: new Date()
      }
    });
  });
}
