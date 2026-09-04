import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { Location, PlaceSummary } from "@/lib/studio-domain";
import { placeParentError, type PlaceMetadataInput } from "@/lib/place-metadata";
import { normalizePlaceType, normalizePlaceStatus } from "@/lib/place-classification";
import { scenePlaceSelect, scenePlaceOrder, isActivePlaceScene, summarizePlaceScene } from "@/lib/db/scene-places";
import { canDeletePlace, placeImpactKeys, type PlaceDeleteImpact, type PlaceDeleteConfirmation } from "@/lib/place-lifecycle";

export class PlaceError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string, public readonly impact?: PlaceDeleteImpact) { super(message); }
}

const placeInclude = {
  sceneLinks: {
    where: { scene: { archived: false, chapter: { archived: false, volume: { archived: false } } } },
    select: { scene: { select: scenePlaceSelect } },
    orderBy: scenePlaceOrder.map((scene) => ({ scene }))
  }
} satisfies Prisma.LocationInclude;

function serializePlace(place: Prisma.LocationGetPayload<{ include: typeof placeInclude }>): Location {
  const { sceneLinks, ...metadata } = place;
  const linkedScenes = sceneLinks.map((link) => link.scene).filter((scene) => isActivePlaceScene(scene, place.novelId)).map(summarizePlaceScene);
  return {
    ...metadata,
    updatedAt: metadata.updatedAt?.toISOString() ?? null,
    type: normalizePlaceType(metadata.type),
    status: normalizePlaceStatus(metadata.status),
    firstAppearance: linkedScenes[0]?.label ?? "",
    sceneCount: linkedScenes.length,
    linkedScenes
  };
}

export async function listPlaces(novelId?: string) {
  // Fixed-size query batch, not a query per Place. Read only metadata even on
  // the server, and use one snapshot for counts, parents and narrative order.
  return prisma.$transaction(async (tx) => {
    const places = await tx.location.findMany({
      where: novelId ? { novelId } : undefined,
      select: { id: true, novelId: true, name: true, type: true, status: true, parentPlaceId: true, revision: true, updatedAt: true },
      orderBy: [{ name: "asc" }, { id: "asc" }]
    });
    const byId = new Map<string, PlaceSummary>(places.map((place) => [place.id, {
      ...place, type: normalizePlaceType(place.type), status: normalizePlaceStatus(place.status),
      updatedAt: place.updatedAt?.toISOString() ?? null, parent: null,
      sceneCount: 0, characterCount: 0, eventCount: 0, childCount: 0, firstAppearance: "", firstAppearanceScene: null
    }]));
    const sceneLinks = await tx.scenePlace.findMany({
      where: { location: novelId ? { novelId } : undefined, scene: { archived: false, chapter: { archived: false, volume: { archived: false } } } },
      select: { locationId: true, scene: { select: scenePlaceSelect } },
      orderBy: scenePlaceOrder.map((scene) => ({ scene }))
    });
    for (const link of sceneLinks) {
      const place = byId.get(link.locationId);
      if (!place || !isActivePlaceScene(link.scene, place.novelId)) continue;
      place.sceneCount = (place.sceneCount ?? 0) + 1;
      if (!place.firstAppearanceScene) {
        place.firstAppearanceScene = summarizePlaceScene(link.scene);
        place.firstAppearance = place.firstAppearanceScene.label;
      }
    }
    const characterLinks = await tx.characterPlace.findMany({
      where: { location: novelId ? { novelId } : undefined },
      select: { locationId: true, character: { select: { novelId: true } } }
    });
    for (const link of characterLinks) {
      const place = byId.get(link.locationId);
      if (place?.novelId === link.character.novelId) place.characterCount++;
    }
    const events = await tx.timelineEventPlace.findMany({
      where: { event: { novelId } }, select: { locationId: true, event: { select: { novelId: true } } }
    });
    for (const event of events) {
      const place = event.locationId ? byId.get(event.locationId) : undefined;
      if (place?.novelId === event.event.novelId) place.eventCount++;
    }
    for (const place of byId.values()) {
      const parent = place.parentPlaceId ? byId.get(place.parentPlaceId) : undefined;
      if (parent && parent.id !== place.id && parent.novelId === place.novelId) {
        place.parent = { id: parent.id, name: parent.name };
        parent.childCount++;
      }
    }
    return [...byId.values()];
  });
}

export async function getPlace(novelId: string, placeId: string) {
  const place = await prisma.location.findFirst({ where: { id: placeId, novelId }, include: placeInclude });
  if (!place) throw new PlaceError("Place was not found in this novel", 404);
  return serializePlace(place);
}

async function checkParent(tx: Prisma.TransactionClient, novelId: string, placeId: string, parentPlaceId: string | null) {
  const parents = await tx.location.findMany({ where: { novelId }, select: { id: true, parentPlaceId: true } });
  const error = placeParentError(placeId, parentPlaceId, parents);
  if (error) throw new PlaceError(error, 409);
}

export async function createPlace(novelId: string, metadata: PlaceMetadataInput) {
  const id = `place-${crypto.randomUUID()}`;
  return prisma.$transaction(async (tx) => {
    const novel = await tx.novel.findUnique({ where: { id: novelId }, select: { id: true } });
    if (!novel) throw new PlaceError("Novel was not found", 404);
    // Take the SQLite write lock before validating the hierarchy, then roll back on failure.
    await tx.location.create({ data: { ...metadata, parentPlaceId: null, id, novelId, updatedAt: new Date() } });
    await checkParent(tx, novelId, id, metadata.parentPlaceId);
    const place = await tx.location.update({ where: { id }, data: { parentPlaceId: metadata.parentPlaceId }, include: placeInclude });
    await tx.novel.update({ where: { id: novelId }, data: { updatedAt: new Date() } });
    return serializePlace(place);
  });
}

export async function updatePlace(novelId: string, placeId: string, revision: number, metadata: Partial<PlaceMetadataInput>) {
  return prisma.$transaction(async (tx) => {
    const result = await tx.location.updateMany({
      where: { id: placeId, novelId, revision },
      // Parent validation is performed under the write lock before changing the FK.
      data: { ...metadata, parentPlaceId: undefined, revision: { increment: 1 }, updatedAt: new Date() }
    });
    if (!result.count) {
      const exists = await tx.location.findFirst({ where: { id: placeId, novelId }, select: { id: true } });
      throw new PlaceError(exists ? "Place changed since it was opened. Reload before saving." : "Place was not found in this novel", exists ? 409 : 404, exists ? "STALE_REVISION" : undefined);
    }
    if (Object.hasOwn(metadata, "parentPlaceId")) {
      await checkParent(tx, novelId, placeId, metadata.parentPlaceId ?? null);
      await tx.location.update({ where: { id: placeId }, data: { parentPlaceId: metadata.parentPlaceId } });
    }
    const place = await tx.location.findUniqueOrThrow({ where: { id: placeId }, include: placeInclude });
    await tx.novel.update({ where: { id: novelId }, data: { updatedAt: new Date() } });
    return serializePlace(place);
  });
}

async function readPlaceDeleteImpact(tx: Prisma.TransactionClient, novelId: string, placeId: string): Promise<PlaceDeleteImpact> {
  const place = await tx.location.findFirst({
    where: { id: placeId, novelId },
    select: { id: true, novelId: true, name: true, status: true, revision: true,
      _count: { select: { childPlaces: true, sceneLinks: true, characterLinks: true, eventLinks: true } }
    }
  });
  if (!place) throw new PlaceError("Place was not found in this novel", 404);
  // The ignored legacy Scene FK still exists on disk. Count it too so deleting a
  // Place never silently SET NULLs a historical Scene, even after join migration.
  const legacy = await tx.$queryRaw<Array<{ count: bigint | number }>>`
    SELECT COUNT(*) AS count FROM Scene s WHERE s.locationId = ${placeId}
    AND NOT EXISTS (SELECT 1 FROM ScenePlace sp WHERE sp.sceneId = s.id AND sp.locationId = ${placeId})`;
  const counts = { children: place._count.childPlaces, scenes: place._count.sceneLinks + Number(legacy[0].count),
    characters: place._count.characterLinks, events: place._count.eventLinks };
  return { id: place.id, novelId: place.novelId, name: place.name, status: normalizePlaceStatus(place.status), revision: place.revision,
    ...counts, canDelete: canDeletePlace(counts) };
}

export async function getPlaceDeleteImpact(novelId: string, placeId: string) {
  return prisma.$transaction((tx) => readPlaceDeleteImpact(tx, novelId, placeId));
}

export async function setPlaceArchived(novelId: string, placeId: string, revision: number, archived: boolean) {
  return updatePlace(novelId, placeId, revision, { status: archived ? "archived" : "active" });
}

export async function deletePlace(novelId: string, placeId: string, expected: PlaceDeleteConfirmation) {
  return prisma.$transaction(async (tx) => {
    // Serialize with relation writers before reading any impact or revision.
    const lock = await tx.location.updateMany({ where: { id: placeId, novelId }, data: { revision: { increment: 0 } } });
    if (!lock.count) throw new PlaceError("Place was not found in this novel", 404);
    const impact = await readPlaceDeleteImpact(tx, novelId, placeId);
    if (impact.revision !== expected.revision || placeImpactKeys.some((key) => impact[key] !== expected.impact[key])) {
      throw new PlaceError("Place or references changed. Review the current impact before deleting.", 409, "STALE_IMPACT", impact);
    }
    if (!impact.canDelete) throw new PlaceError("This place is referenced and cannot be permanently deleted. Archive it instead.", 409, "PLACE_REFERENCED", impact);
    await tx.location.delete({ where: { id: placeId } });
    await tx.novel.update({ where: { id: novelId }, data: { updatedAt: new Date() } });
    return { id: placeId };
  });
}
