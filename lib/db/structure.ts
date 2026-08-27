import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { ChapterStatus } from "@/lib/studio-domain";
import { insertStructureItem, type StructureMovePosition } from "@/lib/structure-move";

export type StructureItemType = "volume" | "chapter" | "scene";
export type StructureAction = "move" | "duplicate" | "archive" | "restore";

export type CreateStructureInput = {
  type: StructureItemType;
  novelId: string;
  parentId: string;
  title: string;
  summary?: string;
  status?: ChapterStatus;
  objective?: string;
  content?: string;
  locationId?: string;
};

export type UpdateStructureInput = {
  title?: string;
  summary?: string;
  status?: ChapterStatus;
  objective?: string;
  content?: string;
  locationId?: string;
};

export type StructureSelection = {
  type: StructureItemType;
  id: string;
};

export type MoveStructureInput = {
  type: StructureItemType;
  id: string;
  destinationParentId: string;
  position: StructureMovePosition;
  referenceId?: string;
};

function countWords(content: string) {
  return content.trim().match(/\S+/g)?.length ?? 0;
}

function copyTitle(title: string) {
  return `${title} (copy)`;
}

async function recalculateWordCounts(tx: Prisma.TransactionClient, novelId: string) {
  const chapters = await tx.chapter.findMany({
    where: { volume: { novelId } },
    select: {
      id: true,
      scenes: { select: { wordCount: true } }
    }
  });

  const totals = chapters.map((chapter) => ({
    id: chapter.id,
    wordCount: chapter.scenes.reduce((sum, scene) => sum + scene.wordCount, 0)
  }));

  await Promise.all(
    totals.map((chapter) =>
      tx.chapter.update({
        where: { id: chapter.id },
        data: { wordCount: chapter.wordCount }
      })
    )
  );

  await tx.novel.update({
    where: { id: novelId },
    data: {
      wordCount: totals.reduce((sum, chapter) => sum + chapter.wordCount, 0),
      updatedAt: new Date()
    }
  });

  await tx.notionSyncState.upsert({
    where: { novelId },
    update: { isDirty: true, revision: { increment: 1 } },
    create: { novelId, isDirty: true, revision: 1 }
  });
}

async function clearSelectionSettings(tx: Prisma.TransactionClient, ids: string[]) {
  if (ids.length === 0) return;
  await tx.appSetting.deleteMany({
    where: {
      key: { in: ["activeStructureId", "activeChapterId", "activeSceneId"] },
      value: { in: ids }
    }
  });
}

export async function createStructureItem(input: CreateStructureInput) {
  return prisma.$transaction(async (tx) => {
    if (input.type === "volume") {
      const novel = await tx.novel.findUniqueOrThrow({ where: { id: input.parentId } });
      if (novel.id !== input.novelId) throw new Error("cannot create outside the current novel");
      const last = await tx.volume.aggregate({
        where: { novelId: novel.id },
        _max: { sortOrder: true }
      });
      const id = `vol-${crypto.randomUUID()}`;

      await tx.volume.create({
        data: {
          id,
          novelId: novel.id,
          title: input.title,
          summary: input.summary ?? "",
          sortOrder: (last._max.sortOrder ?? 0) + 1
        }
      });
      await recalculateWordCounts(tx, novel.id);
      return { selection: { type: input.type, id } satisfies StructureSelection };
    }

    if (input.type === "chapter") {
      const volume = await tx.volume.findUniqueOrThrow({ where: { id: input.parentId } });
      if (volume.novelId !== input.novelId) throw new Error("cannot create outside the current novel");
      if (volume.archived) throw new Error("cannot create inside an archived volume");
      const last = await tx.chapter.aggregate({
        where: { volumeId: volume.id },
        _max: { sortOrder: true }
      });
      const id = `ch-${crypto.randomUUID()}`;

      await tx.chapter.create({
        data: {
          id,
          volumeId: volume.id,
          title: input.title,
          summary: input.summary ?? "",
          status: input.status ?? "Idea",
          sortOrder: (last._max.sortOrder ?? 0) + 1
        }
      });
      await recalculateWordCounts(tx, volume.novelId);
      return { selection: { type: input.type, id } satisfies StructureSelection };
    }

    const chapter = await tx.chapter.findUniqueOrThrow({
      where: { id: input.parentId },
      include: { volume: true }
    });
    if (chapter.volume.novelId !== input.novelId) {
      throw new Error("cannot create outside the current novel");
    }
    if (chapter.archived || chapter.volume.archived) {
      throw new Error("cannot create inside an archived chapter");
    }
    const last = await tx.scene.aggregate({
      where: { chapterId: chapter.id },
      _max: { sortOrder: true }
    });
    const id = `scene-${crypto.randomUUID()}`;
    const content = input.content ?? "";

    await tx.scene.create({
      data: {
        id,
        chapterId: chapter.id,
        title: input.title,
        summary: input.summary ?? "",
        status: input.status ?? "Idea",
        objective: input.objective ?? "",
        content,
        locationId: input.locationId?.trim() || null,
        wordCount: countWords(content),
        sortOrder: (last._max.sortOrder ?? 0) + 1
      }
    });
    await recalculateWordCounts(tx, chapter.volume.novelId);
    return { selection: { type: input.type, id } satisfies StructureSelection };
  });
}

export async function updateStructureItem(
  type: StructureItemType,
  id: string,
  input: UpdateStructureInput
) {
  return prisma.$transaction(async (tx) => {
    if (type === "volume") {
      const current = await tx.volume.findUniqueOrThrow({ where: { id } });
      await tx.volume.update({
        where: { id },
        data: {
          title: input.title,
          summary: input.summary
        }
      });
      await recalculateWordCounts(tx, current.novelId);
    } else if (type === "chapter") {
      const current = await tx.chapter.findUniqueOrThrow({
        where: { id },
        include: { volume: true }
      });
      await tx.chapter.update({
        where: { id },
        data: {
          title: input.title,
          summary: input.summary,
          status: input.status
        }
      });
      await recalculateWordCounts(tx, current.volume.novelId);
    } else {
      const current = await tx.scene.findUniqueOrThrow({
        where: { id },
        include: { chapter: { include: { volume: true } } }
      });
      const nextContent = input.content ?? current.content;
      await tx.scene.update({
        where: { id },
        data: {
          title: input.title,
          summary: input.summary,
          status: input.status,
          objective: input.objective,
          content: input.content,
          locationId:
            input.locationId === undefined ? undefined : input.locationId.trim() || null,
          wordCount: countWords(nextContent)
        }
      });
      await recalculateWordCounts(tx, current.chapter.volume.novelId);
    }

    return { selection: { type, id } satisfies StructureSelection };
  });
}

export async function moveStructureItem(input: MoveStructureInput) {
  return prisma.$transaction(async (tx) => {
    if (input.type === "volume") {
      const [source, destination] = await Promise.all([
        tx.volume.findUniqueOrThrow({ where: { id: input.id } }),
        tx.novel.findUniqueOrThrow({ where: { id: input.destinationParentId } })
      ]);
      if (source.archived) throw new Error("cannot move an archived structure item");
      if (source.novelId !== destination.id) throw new Error("cannot move outside the current novel");

      const siblings = await tx.volume.findMany({
        where: { novelId: destination.id, archived: false },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
      });
      const finalOrder = insertStructureItem(siblings.map((item) => item.id), source.id, input.position, input.referenceId);
      await Promise.all(finalOrder.map((id, index) => tx.volume.update({ where: { id }, data: { sortOrder: index + 1 } })));
      await recalculateWordCounts(tx, source.novelId);
      return { selection: { type: input.type, id: source.id } satisfies StructureSelection };
    }

    if (input.type === "chapter") {
      const [source, destination] = await Promise.all([
        tx.chapter.findUniqueOrThrow({ where: { id: input.id }, include: { volume: true } }),
        tx.volume.findUniqueOrThrow({ where: { id: input.destinationParentId } })
      ]);
      if (source.archived || source.volume.archived || destination.archived) {
        throw new Error("cannot move an archived structure item");
      }
      if (source.volume.novelId !== destination.novelId) throw new Error("cannot move outside the current novel");

      const [sourceSiblings, destinationSiblings] = await Promise.all([
        tx.chapter.findMany({ where: { volumeId: source.volumeId, archived: false }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
        tx.chapter.findMany({ where: { volumeId: destination.id, archived: false }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] })
      ]);
      const finalDestination = insertStructureItem(destinationSiblings.map((item) => item.id), source.id, input.position, input.referenceId);
      if (source.volumeId === destination.id) {
        await Promise.all(finalDestination.map((id, index) => tx.chapter.update({ where: { id }, data: { sortOrder: index + 1 } })));
      } else {
        const sourceRemaining = sourceSiblings.filter((item) => item.id !== source.id);
        await Promise.all([
          ...sourceRemaining.map((item, index) => tx.chapter.update({ where: { id: item.id }, data: { sortOrder: index + 1 } })),
          ...finalDestination.map((id, index) => tx.chapter.update({ where: { id }, data: id === source.id ? { volumeId: destination.id, sortOrder: index + 1 } : { sortOrder: index + 1 } }))
        ]);
      }
      await recalculateWordCounts(tx, source.volume.novelId);
      return { selection: { type: input.type, id: source.id } satisfies StructureSelection };
    }

    const [source, destination] = await Promise.all([
      tx.scene.findUniqueOrThrow({ where: { id: input.id }, include: { chapter: { include: { volume: true } } } }),
      tx.chapter.findUniqueOrThrow({ where: { id: input.destinationParentId }, include: { volume: true } })
    ]);
    if (source.archived || source.chapter.archived || source.chapter.volume.archived || destination.archived || destination.volume.archived) {
      throw new Error("cannot move an archived structure item");
    }
    if (source.chapter.volume.novelId !== destination.volume.novelId) throw new Error("cannot move outside the current novel");

    const [sourceSiblings, destinationSiblings] = await Promise.all([
      tx.scene.findMany({ where: { chapterId: source.chapterId, archived: false }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
      tx.scene.findMany({ where: { chapterId: destination.id, archived: false }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] })
    ]);
    const finalDestination = insertStructureItem(destinationSiblings.map((item) => item.id), source.id, input.position, input.referenceId);
    if (source.chapterId === destination.id) {
      await Promise.all(finalDestination.map((id, index) => tx.scene.update({ where: { id }, data: { sortOrder: index + 1 } })));
    } else {
      const sourceRemaining = sourceSiblings.filter((item) => item.id !== source.id);
      await Promise.all([
        ...sourceRemaining.map((item, index) => tx.scene.update({ where: { id: item.id }, data: { sortOrder: index + 1 } })),
        ...finalDestination.map((id, index) => tx.scene.update({ where: { id }, data: id === source.id ? { chapterId: destination.id, sortOrder: index + 1 } : { sortOrder: index + 1 } }))
      ]);
    }
    await recalculateWordCounts(tx, source.chapter.volume.novelId);
    return { selection: { type: input.type, id: source.id } satisfies StructureSelection };
  });
}

export async function mutateStructureItem(
  type: StructureItemType,
  id: string,
  action: StructureAction,
  direction?: "before" | "after"
) {
  return prisma.$transaction(async (tx) => {
    if (action === "move") {
      if (!direction) {
        throw new Error("direction is required for move");
      }

      const item =
        type === "volume"
          ? await tx.volume.findUniqueOrThrow({ where: { id } })
          : type === "chapter"
            ? await tx.chapter.findUniqueOrThrow({ where: { id } })
            : await tx.scene.findUniqueOrThrow({ where: { id } });
      const siblings =
        type === "volume"
          ? await tx.volume.findMany({
              where: { novelId: "novelId" in item ? item.novelId : "", archived: item.archived },
              orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
            })
          : type === "chapter"
            ? await tx.chapter.findMany({
                where: {
                  volumeId: "volumeId" in item ? item.volumeId : "",
                  archived: item.archived
                },
                orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
              })
            : await tx.scene.findMany({
                where: {
                  chapterId: "chapterId" in item ? item.chapterId : "",
                  archived: item.archived
                },
                orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
              });
      const currentIndex = siblings.findIndex((sibling) => sibling.id === id);
      const targetIndex = currentIndex + (direction === "before" ? -1 : 1);
      const target = siblings[targetIndex];

      if (currentIndex >= 0 && target) {
        if (type === "volume") {
          await tx.volume.update({ where: { id: target.id }, data: { sortOrder: item.sortOrder } });
          await tx.volume.update({ where: { id }, data: { sortOrder: target.sortOrder } });
          await recalculateWordCounts(tx, "novelId" in item ? item.novelId : "");
        } else if (type === "chapter") {
          await tx.chapter.update({ where: { id: target.id }, data: { sortOrder: item.sortOrder } });
          await tx.chapter.update({ where: { id }, data: { sortOrder: target.sortOrder } });
          const volume = await tx.volume.findUniqueOrThrow({
            where: { id: "volumeId" in item ? item.volumeId : "" }
          });
          await recalculateWordCounts(tx, volume.novelId);
        } else {
          await tx.scene.update({ where: { id: target.id }, data: { sortOrder: item.sortOrder } });
          await tx.scene.update({ where: { id }, data: { sortOrder: target.sortOrder } });
          const chapter = await tx.chapter.findUniqueOrThrow({
            where: { id: "chapterId" in item ? item.chapterId : "" },
            include: { volume: true }
          });
          await recalculateWordCounts(tx, chapter.volume.novelId);
        }
      }

      return { selection: { type, id } satisfies StructureSelection };
    }

    if (action === "duplicate") {
      if (type === "volume") {
        const source = await tx.volume.findUniqueOrThrow({
          where: { id },
          include: {
            chapters: {
              where: { archived: false },
              orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
              include: {
                scenes: {
                  where: { archived: false },
                  orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
                }
              }
            }
          }
        });
        await tx.volume.updateMany({
          where: { novelId: source.novelId, sortOrder: { gt: source.sortOrder } },
          data: { sortOrder: { increment: 1 } }
        });
        const volumeId = `vol-${crypto.randomUUID()}`;
        await tx.volume.create({
          data: {
            id: volumeId,
            novelId: source.novelId,
            title: copyTitle(source.title),
            summary: source.summary,
            sortOrder: source.sortOrder + 1
          }
        });
        for (const chapter of source.chapters) {
          const chapterId = `ch-${crypto.randomUUID()}`;
          await tx.chapter.create({
            data: {
              id: chapterId,
              volumeId,
              title: chapter.title,
              summary: chapter.summary,
              status: chapter.status,
              sortOrder: chapter.sortOrder
            }
          });
          for (const scene of chapter.scenes) {
            await tx.scene.create({
              data: {
                id: `scene-${crypto.randomUUID()}`,
                chapterId,
                title: scene.title,
                content: scene.content,
                summary: scene.summary,
                status: scene.status,
                locationId: scene.locationId,
                sortOrder: scene.sortOrder,
                wordCount: scene.wordCount,
                objective: scene.objective
              }
            });
          }
        }
        await recalculateWordCounts(tx, source.novelId);
        return { selection: { type, id: volumeId } satisfies StructureSelection };
      }

      if (type === "chapter") {
        const source = await tx.chapter.findUniqueOrThrow({
          where: { id },
          include: {
            volume: true,
            scenes: {
              where: { archived: false },
              orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
            }
          }
        });
        await tx.chapter.updateMany({
          where: { volumeId: source.volumeId, sortOrder: { gt: source.sortOrder } },
          data: { sortOrder: { increment: 1 } }
        });
        const chapterId = `ch-${crypto.randomUUID()}`;
        await tx.chapter.create({
          data: {
            id: chapterId,
            volumeId: source.volumeId,
            title: copyTitle(source.title),
            summary: source.summary,
            status: source.status,
            sortOrder: source.sortOrder + 1
          }
        });
        for (const scene of source.scenes) {
          await tx.scene.create({
            data: {
              id: `scene-${crypto.randomUUID()}`,
              chapterId,
              title: scene.title,
              content: scene.content,
              summary: scene.summary,
              status: scene.status,
              locationId: scene.locationId,
              sortOrder: scene.sortOrder,
              wordCount: scene.wordCount,
              objective: scene.objective
            }
          });
        }
        await recalculateWordCounts(tx, source.volume.novelId);
        return { selection: { type, id: chapterId } satisfies StructureSelection };
      }

      const source = await tx.scene.findUniqueOrThrow({
        where: { id },
        include: { chapter: { include: { volume: true } } }
      });
      await tx.scene.updateMany({
        where: { chapterId: source.chapterId, sortOrder: { gt: source.sortOrder } },
        data: { sortOrder: { increment: 1 } }
      });
      const sceneId = `scene-${crypto.randomUUID()}`;
      await tx.scene.create({
        data: {
          id: sceneId,
          chapterId: source.chapterId,
          title: copyTitle(source.title),
          content: source.content,
          summary: source.summary,
          status: source.status,
          locationId: source.locationId,
          sortOrder: source.sortOrder + 1,
          wordCount: source.wordCount,
          objective: source.objective
        }
      });
      await recalculateWordCounts(tx, source.chapter.volume.novelId);
      return { selection: { type, id: sceneId } satisfies StructureSelection };
    }

    const archived = action === "archive";
    if (type === "volume") {
      const source = await tx.volume.findUniqueOrThrow({ where: { id } });
      await tx.volume.update({ where: { id }, data: { archived } });
      if (archived) {
        await clearSelectionSettings(tx, [id]);
      }
      await recalculateWordCounts(tx, source.novelId);
    } else if (type === "chapter") {
      const source = await tx.chapter.findUniqueOrThrow({
        where: { id },
        include: { volume: true }
      });
      await tx.chapter.update({ where: { id }, data: { archived } });
      if (archived) {
        await clearSelectionSettings(tx, [id]);
      }
      await recalculateWordCounts(tx, source.volume.novelId);
    } else {
      const source = await tx.scene.findUniqueOrThrow({
        where: { id },
        include: { chapter: { include: { volume: true } } }
      });
      await tx.scene.update({ where: { id }, data: { archived } });
      if (archived) await clearSelectionSettings(tx, [id]);
      await recalculateWordCounts(tx, source.chapter.volume.novelId);
    }

    return { selection: { type, id } satisfies StructureSelection };
  });
}

export async function deleteStructureItem(type: StructureItemType, id: string) {
  return prisma.$transaction(async (tx) => {
    if (type === "volume") {
      const volume = await tx.volume.findUniqueOrThrow({
        where: { id },
        include: { chapters: { select: { id: true } } }
      });
      if (volume.chapters.length > 0) {
        throw new Error("cannot delete a non-empty volume; archive it instead");
      }
      await tx.note.deleteMany({
        where: { linkedType: "Volume", linkedId: id }
      });
      await tx.timelineEvent.updateMany({ where: { volumeId: id }, data: { volumeId: null } });
      await clearSelectionSettings(tx, [id]);
      await tx.volume.delete({ where: { id } });
      await recalculateWordCounts(tx, volume.novelId);
    } else if (type === "chapter") {
      const chapter = await tx.chapter.findUniqueOrThrow({
        where: { id },
        include: { volume: true, scenes: { select: { id: true } } }
      });
      if (chapter.scenes.length > 0) {
        throw new Error("cannot delete a non-empty chapter; archive it instead");
      }
      await tx.note.deleteMany({ where: { linkedType: "Chapter", linkedId: id } });
      await clearSelectionSettings(tx, [id]);
      await tx.chapter.delete({ where: { id } });
      await recalculateWordCounts(tx, chapter.volume.novelId);
    } else {
      const scene = await tx.scene.findUniqueOrThrow({
        where: { id },
        include: { chapter: { include: { volume: true } } }
      });
      await tx.note.deleteMany({ where: { linkedType: "Scene", linkedId: id } });
      await clearSelectionSettings(tx, [id]);
      await tx.scene.delete({ where: { id } });
      await recalculateWordCounts(tx, scene.chapter.volume.novelId);
    }

    return { selection: null };
  });
}
