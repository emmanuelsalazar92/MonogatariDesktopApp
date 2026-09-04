import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { TimelinePlaceError } from "./timeline-places";
import type { TimelineAction, TimelineImpact } from "@/lib/timeline-lifecycle";

async function impact(tx: Prisma.TransactionClient, novelId: string, eventId: string, spoilers: boolean): Promise<TimelineImpact> {
  const event = await tx.timelineEvent.findFirst({ where: { id: eventId, novelId, ...(!spoilers ? { isSpoiler: false } : {}) }, select: {
    positionRevision: true, archivedAt: true, description: true, volumeId: true, chapterId: true, sceneId: true,
    characterLinks: { select: { characterId: true }, orderBy: { characterId: "asc" } },
    placeLinks: { select: { locationId: true }, orderBy: { locationId: "asc" } },
    noteLinks: { select: { noteId: true }, orderBy: { noteId: "asc" } }
  } });
  if (!event) throw new TimelinePlaceError("Event unavailable", 404);
  // Notes are independent entities: require explicit unlink before deleting their target.
  return { revision: event.positionRevision, archived: Boolean(event.archivedAt), characters: event.characterLinks.length,
    places: event.placeLinks.length, notes: event.noteLinks.length, structure: [event.volumeId, event.chapterId, event.sceneId].filter(Boolean).length,
    hasDescription: Boolean(event.description.trim()), token: createHash("sha256").update(JSON.stringify({ novelId, eventId, ...event })).digest("hex") };
}
export async function getTimelineImpact(novelId: string, eventId: string, spoilers = false) {
  return prisma.$transaction(tx => impact(tx, novelId, eventId, spoilers));
}
export async function changeTimelineLifecycle(novelId: string, eventId: string, expected: { action: TimelineAction; revision: number; token: string }, spoilers = false) {
  return prisma.$transaction(async tx => {
    const lock = await tx.novel.updateMany({ where: { id: novelId }, data: { updatedAt: new Date() } });
    if (!lock.count) throw new TimelinePlaceError("Novel unavailable", 404);
    const current = await impact(tx, novelId, eventId, spoilers);
    if (current.revision !== expected.revision || current.token !== expected.token) throw new TimelinePlaceError("Event changed. Reload impact and confirm again.");
    if (expected.action === "delete") {
      if (current.notes) throw new TimelinePlaceError("Notes reference this event. Archive it or unlink those Notes first.");
      await tx.timelineEventCharacter.deleteMany({ where: { eventId } });
      await tx.timelineEventPlace.deleteMany({ where: { eventId } });
      await tx.timelineEvent.delete({ where: { id: eventId } });
    } else {
      if ((expected.action === "archive") === current.archived) throw new TimelinePlaceError("Lifecycle changed. Reload impact.");
      await tx.timelineEvent.update({ where: { id: eventId }, data: { archivedAt: expected.action === "archive" ? new Date() : null, positionRevision: { increment: 1 } } });
    }
    return { id: eventId, action: expected.action };
  });
}
