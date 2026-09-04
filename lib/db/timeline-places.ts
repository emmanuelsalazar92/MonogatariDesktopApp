import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { TimelinePlaceChange } from "@/lib/timeline-place";

export class TimelinePlaceError extends Error {
  constructor(message: string, public readonly status = 409) { super(message); }
}

export const timelineLinksInclude = {
  characterLinks: { select: { characterId: true, character: { select: { novelId: true } } }, orderBy: { characterId: "asc" as const } },
  placeLinks: { select: { locationId: true, location: { select: { novelId: true } } }, orderBy: { locationId: "asc" as const } }
} satisfies Prisma.TimelineEventInclude;

export async function setTimelineLinks(tx: Prisma.TransactionClient, novelId: string, eventId: string, characterIds: string[], locationIds: string[]) {
  if (!await tx.timelineEvent.findFirst({ where: { id: eventId, novelId }, select: { id: true } })) throw new TimelinePlaceError("Event not found in this novel", 404);
  const people = [...new Set(characterIds)], places = [...new Set(locationIds)];
  if (await tx.character.count({ where: { id: { in: people }, novelId } }) !== people.length) throw new TimelinePlaceError("Characters must belong to the same novel");
  if (await tx.location.count({ where: { id: { in: places }, novelId } }) !== places.length) throw new TimelinePlaceError("Places must belong to the same novel");
  await tx.timelineEventCharacter.deleteMany({ where: { eventId, characterId: { notIn: people } } });
  await tx.timelineEventPlace.deleteMany({ where: { eventId, locationId: { notIn: places } } });
  const existingPeople = new Set((await tx.timelineEventCharacter.findMany({ where: { eventId }, select: { characterId: true } })).map(link => link.characterId));
  const existingPlaces = new Set((await tx.timelineEventPlace.findMany({ where: { eventId }, select: { locationId: true } })).map(link => link.locationId));
  if (people.some(id => !existingPeople.has(id))) await tx.timelineEventCharacter.createMany({ data: people.filter(id => !existingPeople.has(id)).map(characterId => ({ eventId, characterId })) });
  if (places.some(id => !existingPlaces.has(id))) await tx.timelineEventPlace.createMany({ data: places.filter(id => !existingPlaces.has(id)).map(locationId => ({ eventId, locationId })) });
}

export async function assertTimelinePlace(tx: Prisma.TransactionClient, novelId: string, locationId: string | null) {
  if (locationId !== null && !await tx.location.findFirst({ where: { id: locationId, novelId }, select: { id: true } })) {
    throw new TimelinePlaceError("Place must belong to the same novel");
  }
}

export async function timelineEventBelongsToNovelForRoute(novelId: string, eventId: string) {
  return Boolean(await prisma.timelineEvent.findFirst({ where: { id: eventId, novelId }, select: { id: true } }));
}

export async function changeTimelinePlace(novelId: string, eventId: string, change: TimelinePlaceChange) {
  return prisma.$transaction(async (tx) => {
    // Acquire SQLite's write lock before checking ownership and stale associations.
    const lock = await tx.novel.updateMany({ where: { id: novelId }, data: { updatedAt: new Date() } });
    if (!lock.count) throw new TimelinePlaceError("Novel not found", 404);
    const event = await tx.timelineEvent.findFirst({ where: { id: eventId, novelId }, select: { id: true, positionRevision: true } });
    if (!event) throw new TimelinePlaceError("Event not found in this novel", 404);
    await assertTimelinePlace(tx, novelId, change.locationId);
    const existing = await tx.timelineEventPlace.findUnique({ where: { eventId_locationId: { eventId, locationId: change.locationId } } });
    if (Boolean(existing) !== change.expectedLinked) {
      throw new TimelinePlaceError("Event place changed elsewhere. Reload before linking or unlinking.");
    }
    if (change.linked && !existing) await tx.timelineEventPlace.create({ data: { eventId, locationId: change.locationId } });
    if (!change.linked && existing) await tx.timelineEventPlace.delete({ where: { eventId_locationId: { eventId, locationId: change.locationId } } });
    const updated = await tx.timelineEvent.update({ where: { id: eventId }, data: { positionRevision: { increment: 1 } }, select: { positionRevision: true } });
    return { id: eventId, novelId, locationId: change.locationId, linked: change.linked, ...updated };
  });
}
