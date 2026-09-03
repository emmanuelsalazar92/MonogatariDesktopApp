import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { Location } from "@/lib/studio-domain";
import { placeParentError, type PlaceMetadataInput } from "@/lib/place-metadata";
import { normalizePlaceType, normalizePlaceStatus } from "@/lib/place-classification";

export class PlaceError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) { super(message); }
}

const placeInclude = {
  _count: { select: { scenes: true } },
  scenes: {
    where: { archived: false, chapter: { archived: false, volume: { archived: false } } },
    select: {
      id: true, title: true, sortOrder: true,
      chapter: { select: {
        id: true, title: true, sortOrder: true,
        volume: { select: { id: true, title: true, sortOrder: true, novelId: true } }
      } }
    },
    orderBy: [
      { chapter: { volume: { sortOrder: "asc" } } },
      { chapter: { volume: { id: "asc" } } },
      { chapter: { sortOrder: "asc" } },
      { chapter: { id: "asc" } },
      { sortOrder: "asc" }, { id: "asc" }
    ]
  }
} satisfies Prisma.LocationInclude;

function serializePlace(place: Prisma.LocationGetPayload<{ include: typeof placeInclude }>): Location {
  const { scenes, _count, ...metadata } = place;
  const first = scenes.find((scene) => scene.chapter.volume.novelId === place.novelId);
  return {
    ...metadata,
    type: normalizePlaceType(metadata.type),
    status: normalizePlaceStatus(metadata.status),
    firstAppearance: first
      ? `${first.chapter.volume.title} · ${first.chapter.title} · ${String(first.sortOrder).padStart(2, "0")} — ${first.title}`
      : "",
    sceneCount: _count.scenes
  };
}

export async function listPlaces(novelId?: string) {
  const places = await prisma.location.findMany({
    where: novelId ? { novelId } : undefined,
    include: placeInclude,
    orderBy: [{ name: "asc" }, { id: "asc" }]
  });
  return places.map(serializePlace);
}

export async function getPlace(novelId: string, placeId: string) {
  const place = await prisma.location.findFirst({ where: { id: placeId, novelId }, include: placeInclude });
  if (!place) throw new PlaceError("Place was not found in this novel", 404);
  return serializePlace(place);
}

async function checkParent(tx: Prisma.TransactionClient, novelId: string, placeId: string, parentPlaceId: string | null) {
  if (!parentPlaceId) return;
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
    await tx.location.create({ data: { ...metadata, parentPlaceId: null, id, novelId } });
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
      data: { ...metadata, parentPlaceId: undefined, revision: { increment: 1 } }
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
