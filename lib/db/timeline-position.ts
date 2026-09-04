import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { readTimelinePosition, validTimelineOrder, type TimelinePosition } from "@/lib/timeline-position";
import { TimelinePlaceError } from "./timeline-places";

export async function resolveStoryPosition(tx: Prisma.TransactionClient, novelId: string, input: Pick<TimelinePosition, "volumeId" | "chapterId" | "sceneId">) {
  let { volumeId, chapterId } = input;
  const { sceneId } = input;
  if (sceneId) {
    const scene = await tx.scene.findFirst({ where: { id: sceneId, chapter: { volume: { novelId } } }, select: { chapterId: true } });
    if (!scene || (chapterId && chapterId !== scene.chapterId)) throw new TimelinePlaceError("Scene must belong to the same novel and chapter");
    chapterId = scene.chapterId;
  }
  if (chapterId) {
    const chapter = await tx.chapter.findFirst({ where: { id: chapterId, volume: { novelId } }, select: { volumeId: true } });
    if (!chapter || (volumeId && volumeId !== chapter.volumeId)) throw new TimelinePlaceError("Chapter must belong to the same novel and volume");
    volumeId = chapter.volumeId;
  }
  if (volumeId && !await tx.volume.findFirst({ where: { id: volumeId, novelId }, select: { id: true } })) throw new TimelinePlaceError("Volume must belong to the same novel");
  return { volumeId, chapterId, sceneId };
}

export async function positionForCreate(tx: Prisma.TransactionClient, novelId: string, input: unknown) {
  const parsed = readTimelinePosition(input);
  if (!parsed.ok) throw new TimelinePlaceError(parsed.error, 400);
  const position = parsed.data;
  const sortIndex = position.sortIndex ?? ((await tx.timelineEvent.aggregate({ where: { novelId }, _max: { sortIndex: true } }))._max.sortIndex ?? 0) + 1024;
  if (!validTimelineOrder(sortIndex)) throw new TimelinePlaceError("No room to append: choose a manual order", 409);
  return { ...position, sortIndex, ...await resolveStoryPosition(tx, novelId, position) };
}

export async function updateTimelinePosition(novelId: string, eventId: string, revision: number, input: unknown) {
  const parsed = readTimelinePosition(input);
  if (!parsed.ok) throw new TimelinePlaceError(parsed.error, 400);
  if (parsed.data.sortIndex === undefined) throw new TimelinePlaceError("Order is required", 400);
  return prisma.$transaction(async (tx) => {
    if (!(await tx.novel.updateMany({ where: { id: novelId }, data: { updatedAt: new Date() } })).count) throw new TimelinePlaceError("Novel not found", 404);
    const event = await tx.timelineEvent.findFirst({ where: { id: eventId, novelId, positionRevision: revision }, select: { id: true } });
    if (!event) throw new TimelinePlaceError("Event position changed or is unavailable. Reload before saving.");
    const story = await resolveStoryPosition(tx, novelId, parsed.data);
    return tx.timelineEvent.update({ where: { id: eventId }, data: { ...parsed.data, ...story, positionRevision: { increment: 1 } },
      select: { id: true, novelId: true, sortIndex: true, internalDate: true, chronologyKind: true, relativeDay: true, relativeMinute: true, positionRevision: true, volumeId: true, chapterId: true, sceneId: true } });
  });
}
