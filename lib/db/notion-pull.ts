import "server-only";

import { prisma } from "@/lib/db/prisma";
import { createRecoveryCheckpoint } from "@/lib/db/scene-recovery";
import type { RemoteSceneUpdate } from "@/lib/notion-pull-safety";

export { type RemoteSceneUpdate } from "@/lib/notion-pull-safety";

export class NotionPullApplyError extends Error {}

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

      for (const [index, scene] of chapter.scenes.entries()) {
        const remote = update.scenes[index];
        if (remote.contentState !== "complete" || remote.localSceneId !== scene.id) {
          throw new NotionPullApplyError("remote scene document is incomplete or mapped to the wrong local scene");
        }
        if (remote.content === "" && scene.content.trim() !== "" && !remote.allowEmptyOverwrite) {
          throw new NotionPullApplyError("remote empty content requires explicit conflict resolution");
        }
        await createRecoveryCheckpoint(tx, scene, remote.content, "notion-pull");
      }

      await Promise.all(
        chapter.scenes.map((scene, index) =>
          tx.scene.update({
            where: { id: scene.id },
            data: {
              title: update.scenes[index].title,
              content: update.scenes[index].content,
              wordCount: countWords(update.scenes[index].content),
              revision: { increment: 1 }
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
