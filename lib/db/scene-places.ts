import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { PlaceSceneSummary } from "@/lib/scene-place";

export const scenePlaceSelect = {
  id: true, title: true, sortOrder: true, archived: true,
  chapter: { select: { id: true, title: true, sortOrder: true, archived: true,
    volume: { select: { id: true, title: true, sortOrder: true, archived: true, novelId: true } }
  } }
} satisfies Prisma.SceneSelect;
export const scenePlaceOrder = [
  { chapter: { volume: { sortOrder: "asc" } } }, { chapter: { volume: { id: "asc" } } },
  { chapter: { sortOrder: "asc" } }, { chapter: { id: "asc" } }, { sortOrder: "asc" }, { id: "asc" }
] satisfies Prisma.SceneOrderByWithRelationInput[];
type NarrativeScene = Prisma.SceneGetPayload<{ select: typeof scenePlaceSelect }>;
export function isActivePlaceScene(scene: NarrativeScene, novelId: string) {
  return scene.chapter.volume.novelId === novelId && !scene.archived && !scene.chapter.archived && !scene.chapter.volume.archived;
}
export function summarizePlaceScene(scene: NarrativeScene): PlaceSceneSummary {
  return { id: scene.id, title: scene.title, volumeId: scene.chapter.volume.id, chapterId: scene.chapter.id,
    volumeOrder: scene.chapter.volume.sortOrder, chapterOrder: scene.chapter.sortOrder, sceneOrder: scene.sortOrder,
    label: `${scene.chapter.volume.title} · ${scene.chapter.title} · ${String(scene.sortOrder).padStart(2, "0")} — ${scene.title}` };
}
export class ScenePlaceError extends Error {
  constructor(message: string, public readonly status = 409) { super(message); }
}

export async function listPlaceSceneOptions(novelId: string, locationId: string) {
  if (!await prisma.location.findFirst({ where: { id: locationId, novelId }, select: { id: true } })) throw new ScenePlaceError("Place not found in this novel", 404);
  const scenes = await prisma.scene.findMany({
    where: { archived: false, chapter: { archived: false, volume: { novelId, archived: false } } },
    select: { ...scenePlaceSelect, placeLinks: { where: { locationId }, select: { locationId: true } } }, orderBy: scenePlaceOrder
  });
  return scenes.map((scene) => ({ ...summarizePlaceScene(scene), linked: scene.placeLinks.length > 0 }));
}

export async function changePlaceScenes(novelId: string, locationId: string, changes: { addSceneIds: string[]; removeSceneIds: string[] }) {
  return prisma.$transaction(async (tx) => {
    // Acquire SQLite's write lock before reading ownership or existing joins.
    const lock = await tx.location.updateMany({ where: { id: locationId, novelId }, data: { revision: { increment: 0 } } });
    if (!lock.count) throw new ScenePlaceError("Place not found in this novel", 404);
    const ids = [...new Set([...changes.addSceneIds, ...changes.removeSceneIds])];
    const scenes = await tx.scene.findMany({ where: { id: { in: ids } }, select: scenePlaceSelect });
    if (scenes.length !== ids.length || scenes.some((scene) => scene.chapter.volume.novelId !== novelId)) throw new ScenePlaceError("Scenes must belong to the same novel");
    if (scenes.some((scene) => changes.addSceneIds.includes(scene.id) && !isActivePlaceScene(scene, novelId))) throw new ScenePlaceError("Archived scenes cannot be linked");
    const removed = await tx.scenePlace.deleteMany({ where: { locationId, sceneId: { in: changes.removeSceneIds } } });
    const existing = await tx.scenePlace.findMany({ where: { locationId, sceneId: { in: changes.addSceneIds } }, select: { sceneId: true } });
    const linked = new Set(existing.map((link) => link.sceneId));
    const additions = changes.addSceneIds.filter((id) => !linked.has(id));
    if (additions.length) await tx.scenePlace.createMany({ data: additions.map((sceneId) => ({ sceneId, locationId })) });
    await tx.novel.update({ where: { id: novelId }, data: { updatedAt: new Date() } });
    return { linked: additions.length, unlinked: removed.count };
  });
}

// Shared by existing Scene/Structure writers; all association writes target the join.
export async function setScenePlaces(tx: Prisma.TransactionClient, novelId: string, sceneId: string, locationIds: string[], expectedLocationIds?: string[]) {
  const ids = [...new Set(locationIds)];
  if (expectedLocationIds) {
    const existing = await tx.scenePlace.findMany({ where: { sceneId }, select: { locationId: true } });
    const expected = [...new Set(expectedLocationIds)].sort();
    if (JSON.stringify(existing.map((link) => link.locationId).sort()) !== JSON.stringify(expected)) throw new ScenePlaceError("Linked places changed elsewhere. Reload before saving.");
  }
  const owned = await tx.location.count({ where: { id: { in: ids }, novelId } });
  if (owned !== ids.length) throw new ScenePlaceError("Places must belong to the same novel");
  await tx.scenePlace.deleteMany({ where: { sceneId } });
  if (ids.length) await tx.scenePlace.createMany({ data: ids.map((locationId) => ({ sceneId, locationId })) });
}

export async function setLegacyScenePlace(tx: Prisma.TransactionClient, novelId: string, sceneId: string, locationId: string) {
  const existing = await tx.scenePlace.findMany({ where: { sceneId }, orderBy: { locationId: "asc" }, select: { locationId: true } });
  if ((existing[0]?.locationId ?? "") === locationId) return;
  if (existing.length > 1) throw new ScenePlaceError("Use Scene Inspector to edit multiple linked places");
  await setScenePlaces(tx, novelId, sceneId, locationId ? [locationId] : []);
}

export const scenePlaceLinksInclude = { placeLinks: { select: { locationId: true }, orderBy: { locationId: "asc" as const } } };
