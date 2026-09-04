import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { composeChapterPreview, orderChapterPreviewScenes } from "@/lib/chapter-preview";
import { deriveCharacterFirstAppearanceDetails } from "@/lib/character-first-appearance";
import { listPlaces } from "@/lib/db/places";
import { writeNote } from "@/lib/db/notes";
import { parseCharacterPlaceRelationshipType } from "@/lib/character-place";
import { timelineLinksInclude, setTimelineLinks, TimelinePlaceError } from "@/lib/db/timeline-places";
import { positionForCreate } from "@/lib/db/timeline-position";
import { readTimelineEvent } from "@/lib/timeline-event";
import { scenePlaceLinksInclude, setScenePlaces, setLegacyScenePlace } from "@/lib/db/scene-places";
import type { ReaderOutline, ReaderScope } from "@/lib/reader-document";
import {
  clampReadingRatio,
  resolveReadingProgress,
  type StoredReadingProgress
} from "@/lib/reader-progress";
import {
  applyStudioSettings,
  parseStudioSettings,
  STUDIO_CONFIGURATION_ID,
  STUDIO_CONFIGURATION_VERSION,
  validateStudioSettingsUpdate
} from "@/lib/studio-settings";
import type {
  ChapterStatus,
  CharacterPlaceRelationshipType,
  Note,
  NovelStatus
} from "@/lib/studio-domain";
import {
  normalizeStoredCharacterRole,
  parseStoredAliases,
  parseStoredCharacterStatus,
  serializeCharacterStatus,
  type CharacterMetadataInput
} from "@/lib/character-metadata";
import {
  getRelationshipDefinition,
  charactersBelongToNovel,
  relationshipIdentity,
  canonicalRelationship,
  resolveRelationshipSemantics,
  readRelationshipSince,
  relationshipIsVisible,
  type RelationshipSince,
  type RelationshipTypeKey
} from "@/lib/character-relationship";

function parseList(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function countWords(value: string) {
  const words = value.trim().match(/\S+/g);
  return words?.length ?? 0;
}

async function markNotionDirty(tx: Prisma.TransactionClient, novelId: string) {
  await tx.notionSyncState.upsert({
    where: { novelId },
    update: { isDirty: true, revision: { increment: 1 } },
    create: { novelId, isDirty: true, revision: 1 }
  });
}

function serializeScene(scene: {
  id: string;
  chapterId: string;
  title: string;
  content?: string;
  summary: string;
  status: string;
  placeLinks?: Array<{ locationId: string }>;
  sortOrder: number;
  wordCount: number;
  objective: string;
  revision: number;
}) {
  const { placeLinks, ...metadata } = scene;
  const locationIds = placeLinks?.map((link) => link.locationId) ?? [];
  return {
    ...metadata,
    content: scene.content ?? "",
    status: scene.status as ChapterStatus,
    locationId: locationIds[0] ?? "",
    locationIds
  };
}

function serializeCharacter(character: {
  id: string;
  novelId: string;
  name: string;
  alias: string;
  age: string;
  role: string;
  appearance: string;
  personality: string;
  wayOfSpeaking: string;
  goal: string;
  fear: string;
  secret: string;
  notes: string;
  status: string;
  image: string;
  updatedAt: Date;
  archivedAt: Date | null;
  _count?: {
    sceneLinks: number;
    placeLinks?: number;
    outgoingRelationships?: number;
    incomingRelationships?: number;
  };
}, firstAppearance = "", firstAppearanceOrder: number | null = null) {
  const aliases = parseStoredAliases(character.alias);
  const storedStatus = parseStoredCharacterStatus(character.status);
  return {
    ...character,
    alias: aliases[0] ?? "",
    aliases,
    role: normalizeStoredCharacterRole(character.role),
    status: character.archivedAt || storedStatus.lifecycle === "Archived"
      ? "Archived"
      : storedStatus.lifecycle,
    narrativeStatus: storedStatus.narrative,
    firstAppearance,
    firstAppearanceOrder,
    updatedAt: character.updatedAt.toISOString(),
    archivedAt: character.archivedAt?.toISOString() ?? null,
    scenes: character._count?.sceneLinks ?? 0,
    places: character._count?.placeLinks ?? 0,
    relationships:
      (character._count?.outgoingRelationships ?? 0) +
      (character._count?.incomingRelationships ?? 0)
  };
}

function serializeCharacterSummary(character: {
  id: string;
  novelId: string;
  name: string;
  role: string;
  status: string;
  updatedAt: Date;
  archivedAt: Date | null;
  _count: {
    sceneLinks: number;
    placeLinks: number;
    outgoingRelationships: number;
    incomingRelationships: number;
  };
}, firstAppearance = "", firstAppearanceOrder: number | null = null, visibleRelationshipCount = 0) {
  const storedStatus = parseStoredCharacterStatus(character.status);
  return {
    id: character.id,
    novelId: character.novelId,
    name: character.name,
    isSpoiler: storedStatus.narrative === "Spoiler",
    role: normalizeStoredCharacterRole(character.role),
    status: character.archivedAt || storedStatus.lifecycle === "Archived"
      ? "Archived"
      : storedStatus.lifecycle,
    updatedAt: character.updatedAt.toISOString(),
    archivedAt: character.archivedAt?.toISOString() ?? null,
    firstAppearance,
    firstAppearanceOrder,
    scenes: character._count.sceneLinks,
    places: character._count.placeLinks,
    relationships: visibleRelationshipCount
  };
}

function serializeNovel(novel: {
  id: string;
  title: string;
  synopsis: string;
  status: string;
  coverImage: string;
  genre: string;
  tags: string;
  wordCount: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...novel,
    status: novel.status as NovelStatus,
    tags: parseList(novel.tags),
    createdAt: dateOnly(novel.createdAt),
    updatedAt: dateOnly(novel.updatedAt)
  };
}

function serializeRelationship(relationship: {
  id: string;
  revision?: number;
  archivedAt?: Date | null;
  novelId: string;
  fromCharacterId: string;
  toCharacterId: string;
  relationshipType: string;
  category: string;
  direction: string;
  description?: string;
  isSpoiler: boolean;
  status?: string;
  since?: string;
  sinceKind?: string;
  sinceTargetId?: string | null;
  notes?: string;
}) {
  const semantics = resolveRelationshipSemantics(relationship.relationshipType, relationship.direction);
  return {
    ...relationship,
    archivedAt: relationship.archivedAt?.toISOString() ?? null,
    category: semantics.category,
    direction: semantics.direction,
    labelFromTo: semantics.labelFromTo,
    labelToFrom: semantics.labelToFrom
  };
}

const relationshipCatalogSelect = {
  id: true, novelId: true, revision: true, archivedAt: true, fromCharacterId: true, toCharacterId: true,
  relationshipType: true, category: true, direction: true, isSpoiler: true
} satisfies Prisma.RelationshipSelect;

async function relationshipPeople(ids: string[]) {
  const rows = await prisma.character.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, novelId: true, status: true } });
  return new Map(rows.map((person) => [person.id, { novelId: person.novelId, isSpoiler: parseStoredCharacterStatus(person.status).narrative === "Spoiler" }]));
}

function readableRelationship(row: { novelId: string; isSpoiler: boolean; fromCharacterId: string; toCharacterId: string },
  people: Map<string, { novelId: string; isSpoiler: boolean }>, showSpoilers: boolean) {
  return row.fromCharacterId !== row.toCharacterId && relationshipIsVisible(row,
    people.get(row.fromCharacterId), people.get(row.toCharacterId), showSpoilers);
}

export async function listRelationshipSummaries(novelId?: string, showSpoilers = false, lifecycle: "active" | "archived" | "all" = "active") {
  const rows = await prisma.relationship.findMany({
    where: { ...(novelId ? { novelId } : {}), ...(!showSpoilers ? { isSpoiler: false } : {}),
      ...(lifecycle === "all" ? {} : { archivedAt: lifecycle === "active" ? null : { not: null } }) },
    select: relationshipCatalogSelect, orderBy: { id: "asc" }
  });
  const people = await relationshipPeople(rows.flatMap((row) => [row.fromCharacterId, row.toCharacterId]));
  return rows.filter((row) => readableRelationship(row, people, showSpoilers)).map(serializeRelationship);
}

export async function getRelationshipDetail(novelId: string, id: string, showSpoilers = false) {
  const row = await prisma.relationship.findFirst({ where: { id, novelId, ...(!showSpoilers ? { isSpoiler: false } : {}) } });
  if (!row) return null;
  const people = await relationshipPeople([row.fromCharacterId, row.toCharacterId]);
  return readableRelationship(row, people, showSpoilers) ? serializeRelationship(row) : null;
}

export async function getTimelineEventDetail(novelId: string, id: string, showSpoilers = false) {
  const event = await prisma.timelineEvent.findFirst({ where: { id, novelId, ...(!showSpoilers ? { isSpoiler: false } : {}) }, include: timelineLinksInclude });
  return event ? serializeTimelineEvent(event) : null;
}

export async function listTimelineEventSummaries(novelId?: string, showSpoilers = false, lifecycle: "active" | "archived" | "all" = "active", selectedId?: string) {
  const rows = await prisma.timelineEvent.findMany({ select: {
    id: true, novelId: true, title: true, internalDate: true, sortIndex: true,
    chronologyKind: true, relativeDay: true, relativeMinute: true, positionRevision: true,
    volumeId: true, chapterId: true, sceneId: true, isSpoiler: true, archivedAt: true, ...timelineLinksInclude
  }, where: { ...(novelId ? { novelId } : {}), ...(!showSpoilers ? { isSpoiler: false } : {}), ...(lifecycle === "all" ? {} : { OR: [{ archivedAt: lifecycle === "archived" ? { not: null } : null }, ...(novelId && selectedId ? [{ id: selectedId }] : [])] }) },
    orderBy: [{ novelId: "asc" }, { sortIndex: "asc" }, { id: "asc" }] });
  return rows.map(serializeTimelineEvent);
}

function serializeTimelineEvent(event: {
  id: string;
  novelId: string;
  title: string;
  internalDate: string;
  sortIndex: number;
  chronologyKind: string;
  relativeDay: number | null;
  relativeMinute: number | null;
  positionRevision: number;
  volumeId: string | null;
  chapterId: string | null;
  sceneId: string | null;
  characterLinks: Array<{ characterId: string; character: { novelId: string } }>;
  placeLinks: Array<{ locationId: string; location: { novelId: string } }>;
  description?: string;
  archivedAt?: Date | null;
  isSpoiler: boolean;
}) {
  const { characterLinks, placeLinks, ...metadata } = event;
  return {
    ...metadata,
    archivedAt: event.archivedAt?.toISOString() ?? null,
    chronologyKind: event.chronologyKind === "relative" ? "relative" as const : "manual" as const,
    volumeId: event.volumeId ?? "",
    chapterId: event.chapterId ?? "",
    sceneId: event.sceneId ?? "",
    locationIds: placeLinks.filter(link => link.location.novelId === event.novelId).map(link => link.locationId),
    characterIds: characterLinks.filter(link => link.character.novelId === event.novelId).map(link => link.characterId)
  };
}

export async function getStudioSnapshot() {
  const [
    novels,
    volumes,
    chapters,
    scenes,
    characters,
    characterSceneLinks,
    characterPlaceLinks,
    locations,
    relationships,
    timelineEvents,
    notes,
    backups,
    writingActivities,
    settings,
    configuration,
    notionSyncStates
  ] = await Promise.all([
    prisma.novel.findMany({ orderBy: { updatedAt: "desc" } }),
    prisma.volume.findMany({ orderBy: [{ novelId: "asc" }, { sortOrder: "asc" }] }),
    prisma.chapter.findMany({ orderBy: [{ volumeId: "asc" }, { sortOrder: "asc" }] }),
    prisma.scene.findMany({
      select: {
        id: true,
        chapterId: true,
        title: true,
        summary: true,
        status: true,
        ...scenePlaceLinksInclude,
        sortOrder: true,
        wordCount: true,
        objective: true,
        revision: true,
        archived: true
      },
      orderBy: [{ chapterId: "asc" }, { sortOrder: "asc" }]
    }),
    prisma.character.findMany({
      select: {
        id: true,
        novelId: true,
        name: true,
        role: true,
        status: true,
        updatedAt: true,
        archivedAt: true,
        _count: {
          select: {
            sceneLinks: true,
            placeLinks: true,
            outgoingRelationships: true,
            incomingRelationships: true
          }
        }
      },
      orderBy: [{ novelId: "asc" }, { name: "asc" }]
    }),
    prisma.sceneCharacter.findMany({
      select: { characterId: true, sceneId: true },
      orderBy: [{ characterId: "asc" }, { sceneId: "asc" }]
    }),
    prisma.characterPlace.findMany({ orderBy: [{ characterId: "asc" }, { locationId: "asc" }] }),
    listPlaces(),
    listRelationshipSummaries(),
    listTimelineEventSummaries(),
    Promise.resolve([]), // Notes catalog/detail are fetched on demand, scoped to the active Novel.
    prisma.backup.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.writingActivity.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.appSetting.findMany({ orderBy: { key: "asc" } }),
    prisma.studioConfiguration.findUnique({ where: { id: STUDIO_CONFIGURATION_ID } }),
    prisma.notionSyncState.findMany({ orderBy: { novelId: "asc" } })
  ]);
  const studioSettings = configuration && configuration.version === STUDIO_CONFIGURATION_VERSION
    ? parseStudioSettings(configuration.values)
    : applyStudioSettings(parseStudioSettings(null), Object.fromEntries(settings.map((item) => [item.key, item.value])));
  const activeSceneId = settings.find((setting) => setting.key === "activeSceneId")?.value;
  const activeScene = activeSceneId
    ? await prisma.scene.findUnique({ where: { id: activeSceneId }, select: { id: true, content: true } })
    : null;
  const characterFirstAppearances = deriveCharacterFirstAppearanceDetails(
    characters,
    volumes,
    chapters,
    scenes,
    characterSceneLinks
  );
  const visibleRelationshipCounts = new Map<string, number>();
  for (const relationship of relationships) for (const id of [relationship.fromCharacterId, relationship.toCharacterId]) {
    visibleRelationshipCounts.set(id, (visibleRelationshipCounts.get(id) ?? 0) + 1);
  }

  return {
    novels: novels.map((novel) => serializeNovel(novel)),
    volumes,
    chapters: chapters.map((chapter) => ({
      ...chapter,
      status: chapter.status as ChapterStatus
    })),
    scenes: scenes.map((scene) => serializeScene({
      ...scene,
      content: scene.id === activeScene?.id ? activeScene.content : ""
    })),
    characters: characters.map((character) =>
      serializeCharacterSummary(
        character,
        characterFirstAppearances.get(character.id)?.label ?? "",
        characterFirstAppearances.get(character.id)?.order ?? null,
        visibleRelationshipCounts.get(character.id) ?? 0
      )
    ),
    characterPlaceLinks: characterPlaceLinks.map((link) => ({
      ...link,
      relationshipType: link.relationshipType as CharacterPlaceRelationshipType
    })),
    locations,
    relationships,
    timelineEvents,
    notes,
    backups: backups.map((backup) => ({
      ...backup,
      date: dateOnly(backup.createdAt),
      name: backup.filename
    })),
    writingActivities: writingActivities.map((activity) => ({
      ...activity,
      createdAt: activity.createdAt.toISOString()
    })),
    studioSettings,
    settings: Object.fromEntries(settings.map((setting) => [setting.key, setting.value])),
    notionSyncStates: notionSyncStates.map((state) => ({
      novelId: state.novelId,
      isDirty: state.isDirty,
      revision: state.revision,
      lastNotionSync: state.lastNotionSync?.toISOString() ?? null
    }))
  };
}

export async function createNovel(input: {
  title: string;
  synopsis?: string;
  genre?: string;
  status?: NovelStatus;
  tags?: string[];
}) {
  const id = `novel-${crypto.randomUUID()}`;
  const volumeId = `vol-${crypto.randomUUID()}`;
  const chapterId = `ch-${crypto.randomUUID()}`;
  const sceneId = `scene-${crypto.randomUUID()}`;

  const novel = await prisma.$transaction(async (tx) => {
    const createdNovel = await tx.novel.create({
      data: {
        id,
        title: input.title,
        synopsis: input.synopsis ?? "",
        genre: input.genre ?? "",
        status: input.status ?? "Idea",
        tags: JSON.stringify(input.tags ?? []),
        wordCount: 0
      }
    });

    await tx.volume.create({
      data: {
        id: volumeId,
        novelId: id,
        title: "Volume 1",
        sortOrder: 1,
        summary: "Starter volume for the new novel."
      }
    });

    await tx.chapter.create({
      data: {
        id: chapterId,
        volumeId,
        title: "Chapter 1",
        summary: "Opening chapter.",
        status: "Draft",
        sortOrder: 1,
        wordCount: 0
      }
    });

    await tx.scene.create({
      data: {
        id: sceneId,
        chapterId,
        title: "Opening scene",
        content: "",
        summary: "Start drafting here.",
        status: "Draft",
        sortOrder: 1,
        wordCount: 0,
        objective: "Introduce the story promise."
      }
    });

    await markNotionDirty(tx, id);

    return createdNovel;
  });

  return serializeNovel(novel);
}

export async function createCharacter(input: {
  novelId: string;
  metadata: CharacterMetadataInput;
  markExternalDirty?: boolean;
}) {
  const id = `char-${crypto.randomUUID()}`;

  const character = await prisma.$transaction(async (tx) => {
    const createdCharacter = await tx.character.create({
      data: {
        id,
        novelId: input.novelId,
        name: input.metadata.name,
        alias: JSON.stringify(input.metadata.aliases),
        age: input.metadata.age,
        role: input.metadata.role,
        appearance: input.metadata.appearance,
        personality: input.metadata.personality,
        wayOfSpeaking: input.metadata.wayOfSpeaking,
        goal: input.metadata.goal,
        fear: input.metadata.fear,
        secret: input.metadata.secret,
        notes: input.metadata.notes,
        status: serializeCharacterStatus(input.metadata.status),
        image: ""
      }
    });

    await tx.novel.update({
      where: { id: input.novelId },
      data: { updatedAt: new Date() }
    });
    if (input.markExternalDirty !== false) await markNotionDirty(tx, input.novelId);

    return createdCharacter;
  });

  return serializeCharacter({ ...character, _count: { sceneLinks: 0 } });
}

export async function updateCharacter(characterId: string, metadata: CharacterMetadataInput) {
  const character = await prisma.$transaction(async (tx) => {
    const existing = await tx.character.findUniqueOrThrow({ where: { id: characterId } });
    const updated = await tx.character.update({
      where: { id: characterId },
      data: {
        name: metadata.name,
        alias: JSON.stringify(metadata.aliases),
        age: metadata.age,
        role: metadata.role,
        appearance: metadata.appearance,
        personality: metadata.personality,
        wayOfSpeaking: metadata.wayOfSpeaking,
        goal: metadata.goal,
        fear: metadata.fear,
        secret: metadata.secret,
        notes: metadata.notes,
        status: serializeCharacterStatus(metadata.status, parseStoredCharacterStatus(existing.status).narrative)
      }
    });
    await tx.novel.update({ where: { id: existing.novelId }, data: { updatedAt: new Date() } });
    await markNotionDirty(tx, existing.novelId);
    return {
      ...updated,
      _count: { sceneLinks: await tx.sceneCharacter.count({ where: { characterId } }) }
    };
  });
  return serializeCharacter(character);
}

export type CharacterDeleteImpact = {
  characterId: string;
  name: string;
  linkedScenes: number;
  linkedPlaces: number;
  relationships: number;
  linkedEvents: number;
  canDelete: boolean;
};

export class CharacterLifecycleConflictError extends Error {
  constructor(message: string, public readonly impact?: CharacterDeleteImpact) {
    super(message);
    this.name = "CharacterLifecycleConflictError";
  }
}

async function readCharacterDeleteImpact(
  tx: Prisma.TransactionClient,
  characterId: string
): Promise<CharacterDeleteImpact> {
  const character = await tx.character.findUnique({
    where: { id: characterId },
    select: { id: true, name: true }
  });
  if (!character) throw new CharacterLifecycleConflictError("Character was not found");

  const [linkedScenes, linkedPlaces, relationships, linkedEvents] = await Promise.all([
    tx.sceneCharacter.count({ where: { characterId } }),
    tx.characterPlace.count({ where: { characterId } }),
    tx.relationship.count({
      where: { OR: [{ fromCharacterId: characterId }, { toCharacterId: characterId }] }
    }),
    tx.timelineEventCharacter.count({ where: { characterId } })
  ]);
  return {
    characterId: character.id,
    name: character.name,
    linkedScenes,
    linkedPlaces,
    relationships,
    linkedEvents,
    canDelete: linkedScenes + linkedPlaces + relationships + linkedEvents === 0
  };
}

export async function getCharacterDetail(novelId: string, characterId: string) {
  const character = await prisma.character.findFirst({
    where: { id: characterId, novelId },
    include: {
      _count: {
        select: {
          sceneLinks: true,
          placeLinks: true,
          outgoingRelationships: true,
          incomingRelationships: true
        }
      },
      sceneLinks: {
        select: {
          scene: {
            select: {
              id: true,
              chapterId: true,
              title: true,
              sortOrder: true,
              archived: true,
              chapter: {
                select: {
                  id: true,
                  volumeId: true,
                  title: true,
                  sortOrder: true,
                  volume: {
                    select: { id: true, novelId: true, title: true, sortOrder: true }
                  }
                }
              }
            }
          }
        }
      }
    }
  });
  if (!character) return null;

  const volumes = character.sceneLinks.map(({ scene }) => scene.chapter.volume);
  const chapters = character.sceneLinks.map(({ scene }) => scene.chapter);
  const scenes = character.sceneLinks.map(({ scene }) => scene);
  const sceneLinks = character.sceneLinks.map(({ scene }) => ({
    characterId: character.id,
    sceneId: scene.id
  }));
  const firstAppearance = deriveCharacterFirstAppearanceDetails(
    [character],
    volumes,
    chapters,
    scenes,
    sceneLinks
  ).get(character.id);
  const { sceneLinks: _sceneLinks, ...detail } = character;
  void _sceneLinks;

  return serializeCharacter(
    detail,
    firstAppearance?.label ?? "",
    firstAppearance?.order ?? null
  );
}

export async function getCharacterDeleteImpact(characterId: string) {
  return prisma.$transaction((tx) => readCharacterDeleteImpact(tx, characterId));
}

export async function archiveCharacter(characterId: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.character.findUniqueOrThrow({ where: { id: characterId } });
    const character = existing.archivedAt
      ? existing
      : await tx.character.update({
          where: { id: characterId },
          data: { archivedAt: new Date() }
        });
    return serializeCharacter({
      ...character,
      _count: { sceneLinks: await tx.sceneCharacter.count({ where: { characterId } }) }
    });
  });
}

export async function restoreCharacter(characterId: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.character.findUniqueOrThrow({ where: { id: characterId } });
    const storedStatus = parseStoredCharacterStatus(existing.status);
    const character = await tx.character.update({
      where: { id: characterId },
      data: {
        archivedAt: null,
        status: storedStatus.lifecycle === "Archived"
          ? serializeCharacterStatus("Active", storedStatus.narrative)
          : existing.status
      }
    });
    return serializeCharacter({
      ...character,
      _count: { sceneLinks: await tx.sceneCharacter.count({ where: { characterId } }) }
    });
  });
}

export async function deleteCharacter(
  characterId: string,
  expectedImpact: Pick<CharacterDeleteImpact, "linkedScenes" | "linkedPlaces" | "relationships">
) {
  return prisma.$transaction(async (tx) => {
    // Acquire a write lock before counting so a new reference cannot race the final delete.
    await tx.character.update({
      where: { id: characterId },
      data: { updatedAt: new Date() }
    });
    const impact = await readCharacterDeleteImpact(tx, characterId);
    const stale =
      impact.linkedScenes !== expectedImpact.linkedScenes ||
      impact.linkedPlaces !== expectedImpact.linkedPlaces ||
      impact.relationships !== expectedImpact.relationships;
    if (stale) {
      throw new CharacterLifecycleConflictError(
        "Character references changed; review the current impact before deleting",
        impact
      );
    }
    if (!impact.canDelete) {
      throw new CharacterLifecycleConflictError(
        "Referenced characters cannot be permanently deleted; archive this character instead",
        impact
      );
    }
    await tx.character.delete({ where: { id: characterId } });
    return { deleted: true, characterId };
  });
}

export class SceneCharacterConflictError extends Error {}

export async function listCharacterScenes(characterId: string) {
  const character = await prisma.character.findUniqueOrThrow({
    where: { id: characterId },
    select: {
      id: true,
      novelId: true,
      sceneLinks: {
        select: {
          scene: {
            select: {
              id: true,
              title: true,
              sortOrder: true,
              archived: true,
              chapter: {
                select: {
                  id: true,
                  title: true,
                  sortOrder: true,
                  volume: {
                    select: { id: true, title: true, sortOrder: true, novelId: true }
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  return character.sceneLinks
    .filter(
      ({ scene }) =>
        !scene.archived && scene.chapter.volume.novelId === character.novelId
    )
    .map(({ scene }) => ({
      sceneId: scene.id,
      sceneTitle: scene.title,
      sceneOrder: scene.sortOrder,
      chapterId: scene.chapter.id,
      chapterTitle: scene.chapter.title,
      chapterOrder: scene.chapter.sortOrder,
      volumeId: scene.chapter.volume.id,
      volumeTitle: scene.chapter.volume.title,
      volumeOrder: scene.chapter.volume.sortOrder,
      novelId: scene.chapter.volume.novelId
    }))
    .sort(
      (left, right) =>
        left.volumeOrder - right.volumeOrder ||
        left.volumeId.localeCompare(right.volumeId) ||
        left.chapterOrder - right.chapterOrder ||
        left.chapterId.localeCompare(right.chapterId) ||
        left.sceneOrder - right.sceneOrder ||
        left.sceneId.localeCompare(right.sceneId)
    );
}

export async function linkCharacterScene(characterId: string, sceneId: string) {
  return prisma.$transaction(async (tx) => {
    const [character, scene] = await Promise.all([
      tx.character.findUnique({ where: { id: characterId }, select: { novelId: true } }),
      tx.scene.findUnique({
        where: { id: sceneId },
        select: { chapter: { select: { volume: { select: { novelId: true } } } } }
      })
    ]);
    if (!character || !scene) throw new SceneCharacterConflictError("Character or scene was not found");
    if (character.novelId !== scene.chapter.volume.novelId) {
      throw new SceneCharacterConflictError("Character and scene must belong to the same novel");
    }

    const existing = await tx.sceneCharacter.findUnique({
      where: { sceneId_characterId: { sceneId, characterId } },
      select: { sceneId: true }
    });
    await tx.sceneCharacter.upsert({
      where: { sceneId_characterId: { sceneId, characterId } },
      update: {},
      create: { characterId, sceneId }
    });
    if (!existing) await markNotionDirty(tx, character.novelId);
    return { created: !existing, count: await tx.sceneCharacter.count({ where: { characterId } }) };
  });
}

export async function unlinkCharacterScene(characterId: string, sceneId: string) {
  return prisma.$transaction(async (tx) => {
    const character = await tx.character.findUnique({ where: { id: characterId }, select: { novelId: true } });
    if (!character) throw new SceneCharacterConflictError("Character was not found");
    const result = await tx.sceneCharacter.deleteMany({ where: { characterId, sceneId } });
    if (result.count > 0) await markNotionDirty(tx, character.novelId);
    return { removed: result.count > 0, count: await tx.sceneCharacter.count({ where: { characterId } }) };
  });
}

export class CharacterPlaceConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CharacterPlaceConflictError";
  }
}

export async function listCharacterPlaces(characterId: string, novelId?: string) {
  const character = await prisma.character.findUnique({
    where: { id: characterId, ...(novelId ? { novelId } : {}) },
    select: {
      novelId: true,
      placeLinks: {
        select: {
          relationshipType: true,
          location: { select: { id: true, name: true, type: true, region: true, novelId: true } }
        }
      }
    }
  });
  if (!character) throw new CharacterPlaceConflictError("Character was not found");

  return character.placeLinks
    .filter(({ location }) => location.novelId === character.novelId)
    .map(({ location, relationshipType }) => ({
      locationId: location.id,
      name: location.name,
      type: location.type,
      region: location.region,
      novelId: location.novelId,
      relationshipType: parseCharacterPlaceRelationshipType(relationshipType) ?? "Associated with"
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function linkCharacterPlace(
  characterId: string,
  locationId: string,
  relationshipType: CharacterPlaceRelationshipType,
  novelId?: string
) {
  if (!parseCharacterPlaceRelationshipType(relationshipType)) throw new CharacterPlaceConflictError("relationshipType is invalid");
  return prisma.$transaction(async (tx) => {
    const lock = await tx.location.updateMany({ where: { id: locationId, ...(novelId ? { novelId } : {}) }, data: { revision: { increment: 0 } } });
    if (!lock.count) throw new CharacterPlaceConflictError("Place was not found in this novel");
    const [character, location] = await Promise.all([
      tx.character.findUnique({ where: { id: characterId }, select: { novelId: true } }),
      tx.location.findUnique({ where: { id: locationId }, select: { novelId: true } })
    ]);
    if (!character || !location) {
      throw new CharacterPlaceConflictError("Character or place was not found");
    }
    if (character.novelId !== location.novelId) {
      throw new CharacterPlaceConflictError("Character and place must belong to the same novel");
    }

    const existing = await tx.characterPlace.findUnique({
      where: { characterId_locationId: { characterId, locationId } },
      select: { characterId: true }
    });
    await tx.characterPlace.upsert({
      where: { characterId_locationId: { characterId, locationId } },
      update: {},
      create: { characterId, locationId, relationshipType }
    });
    return {
      created: !existing,
      count: await tx.characterPlace.count({ where: { characterId } })
    };
  });
}

export async function unlinkCharacterPlace(characterId: string, locationId: string, novelId?: string) {
  return prisma.$transaction(async (tx) => {
    const lock = await tx.location.updateMany({ where: { id: locationId, ...(novelId ? { novelId } : {}) }, data: { revision: { increment: 0 } } });
    if (!lock.count) throw new CharacterPlaceConflictError("Place was not found in this novel");
    const [character, location] = await Promise.all([
      tx.character.findUnique({ where: { id: characterId }, select: { novelId: true } }),
      tx.location.findUnique({ where: { id: locationId }, select: { novelId: true } })
    ]);
    if (!character || !location) {
      throw new CharacterPlaceConflictError("Character or place was not found");
    }
    if (character.novelId !== location.novelId) {
      throw new CharacterPlaceConflictError("Character and place must belong to the same novel");
    }
    const result = await tx.characterPlace.deleteMany({ where: { characterId, locationId } });
    return {
      removed: result.count > 0,
      count: await tx.characterPlace.count({ where: { characterId } })
    };
  });
}

export class RelationshipConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RelationshipConflictError";
  }
}

type RelationshipWriteInput = {
  novelId: string;
  fromCharacterId: string;
  toCharacterId: string;
  relationshipType: RelationshipTypeKey;
  description?: string;
  isSpoiler?: boolean;
  status?: string;
  since?: string;
  sinceKind?: RelationshipSince["sinceKind"];
  sinceTargetId?: string | null;
  notes?: string;
};

export async function createRelationship(input: RelationshipWriteInput) {
  return writeRelationship(input);
}

export async function updateRelationship(id: string, revision: number, input: RelationshipWriteInput) {
  return writeRelationship(input, { id, revision });
}

async function writeRelationship(input: RelationshipWriteInput, previous?: { id: string; revision: number }) {
  const definition = getRelationshipDefinition(input.relationshipType);
  if (!definition?.active) throw new RelationshipConflictError("Relationship type is invalid");
  const canonical = canonicalRelationship(input.fromCharacterId, input.toCharacterId, input.relationshipType);
  const since = readRelationshipSince(input);
  if (!since) throw new RelationshipConflictError("Since must be an explicit text fallback or a valid Structure reference");
  const identity = relationshipIdentity(input.novelId, input.fromCharacterId, input.toCharacterId, input.relationshipType);
  // Identity survives edits. Logical uniqueness is checked under SQLite's write lock.
  const id = previous?.id ?? `rel-${crypto.randomUUID()}`;

  const relationship = await prisma.$transaction(async (tx) => {
    // Acquire SQLite's write lock before validating Structure and character ownership.
    if (!(await tx.novel.updateMany({ where: { id: input.novelId }, data: { updatedAt: new Date() } })).count) throw new RelationshipConflictError("Novel was not found");
    const existing = previous ? await tx.relationship.findFirst({ where: { id, novelId: input.novelId, revision: previous.revision } }) : null;
    if (previous && !existing) throw new RelationshipConflictError("Relationship changed or is unavailable. Reload before saving.");
    if (since.sinceTargetId) {
      const id = since.sinceTargetId;
      const owned = since.sinceKind === "volume"
        ? await tx.volume.count({ where: { id, novelId: input.novelId, archived: false } })
        : since.sinceKind === "chapter"
          ? await tx.chapter.count({ where: { id, archived: false, volume: { novelId: input.novelId, archived: false } } })
          : await tx.scene.count({ where: { id, archived: false, chapter: { archived: false, volume: { novelId: input.novelId, archived: false } } } });
      // An unchanged historical Since reference may remain archived, but never foreign/missing.
      const retained = !owned && existing?.sinceKind === since.sinceKind && existing.sinceTargetId === id
        ? since.sinceKind === "volume" ? await tx.volume.count({ where: { id, novelId: input.novelId } })
          : since.sinceKind === "chapter" ? await tx.chapter.count({ where: { id, volume: { novelId: input.novelId } } })
            : await tx.scene.count({ where: { id, chapter: { volume: { novelId: input.novelId } } } }) : 0;
      if (!owned && !retained) throw new RelationshipConflictError("Since target must be active Structure in the same novel");
    }
    const characters = await tx.character.findMany({
      where: { id: { in: [input.fromCharacterId, input.toCharacterId] } },
      select: { id: true, novelId: true }
    });
    if (!charactersBelongToNovel(characters, input.novelId, [input.fromCharacterId, input.toCharacterId])) {
      throw new RelationshipConflictError("Both characters must belong to the active novel");
    }
    // Include aliases/inverse legacy rows before migration; never equate two
    // opposite directional edges (e.g. independently reciprocated love).
    const candidates = await tx.relationship.findMany({
      where: {
        novelId: input.novelId,
        id: { not: id },
        OR: [
          { fromCharacterId: input.fromCharacterId, toCharacterId: input.toCharacterId },
          { fromCharacterId: input.toCharacterId, toCharacterId: input.fromCharacterId }
        ]
      },
      select: { fromCharacterId: true, toCharacterId: true, relationshipType: true }
    });
    const duplicate = candidates.some((candidate) => relationshipIdentity(input.novelId, candidate.fromCharacterId, candidate.toCharacterId, candidate.relationshipType) === identity);
    if (duplicate) throw new RelationshipConflictError("An equivalent relationship already exists; edit it instead");
    const data = {
        novelId: input.novelId,
        ...canonical,
        category: definition.category,
        direction: definition.direction,
        description: input.description ?? "",
        isSpoiler: input.isSpoiler ?? false,
        status: input.status ?? "",
        ...since,
        notes: input.notes ?? ""
    };
    const createdRelationship = previous
      ? await tx.relationship.update({ where: { id }, data: { ...data, revision: { increment: 1 } } })
      : await tx.relationship.create({ data: { id, ...data } });

    await markNotionDirty(tx, input.novelId);

    return createdRelationship;
  });

  return serializeRelationship(relationship);
}

export async function changeRelationshipLifecycle(relationshipId: string, novelId: string, revision: number, action: "archive" | "restore" | "delete") {
  return prisma.$transaction(async (tx) => {
    if (!(await tx.novel.updateMany({ where: { id: novelId }, data: { updatedAt: new Date() } })).count) throw new RelationshipConflictError("Novel was not found");
    const existing = await tx.relationship.findFirst({ where: { id: relationshipId, novelId, revision } });
    if (!existing) throw new RelationshipConflictError("Relationship changed or is unavailable. Reload before continuing.");
    const result = action === "delete"
      ? await tx.relationship.delete({ where: { id: relationshipId } })
      : await tx.relationship.update({ where: { id: relationshipId }, data: { archivedAt: action === "archive" ? new Date() : null, revision: { increment: 1 } } });
    await markNotionDirty(tx, existing.novelId);
    return action === "delete" ? { id: relationshipId } : serializeRelationship(result);
  });
}

type TimelineEventWrite = {
  novelId: string;
  title: string;
  internalDate?: string;
  sortIndex?: number;
  chronologyKind?: "manual" | "relative";
  relativeDay?: number | null;
  relativeMinute?: number | null;
  volumeId?: string;
  chapterId?: string;
  sceneId?: string;
  locationId?: string;
  locationIds?: string[];
  characterIds?: string[];
  description?: string;
  isSpoiler?: boolean;
};

export async function createTimelineEvent(input: TimelineEventWrite) {
  return writeTimelineEvent(input);
}

export async function updateTimelineEvent(id: string, revision: number, input: TimelineEventWrite) {
  return writeTimelineEvent(input, id, revision);
}

async function writeTimelineEvent(input: TimelineEventWrite, existingId?: string, revision?: number) {
  const validation = readTimelineEvent(input);
  if (!validation.ok) throw new TimelinePlaceError(validation.error, 400);
  const metadata = validation.data;
  if (existingId && metadata.sortIndex === undefined) throw new TimelinePlaceError("Order is required", 400);
  const id = existingId ?? `event-${crypto.randomUUID()}`;

  const event = await prisma.$transaction(async (tx) => {
    const lock = await tx.novel.updateMany({ where: { id: input.novelId }, data: { updatedAt: new Date() } });
    if (!lock.count) throw new TimelinePlaceError("Novel not found", 404);
    const existing = existingId ? await tx.timelineEvent.findFirst({ where: { id, novelId: input.novelId, positionRevision: revision }, include: timelineLinksInclude }) : null;
    if (existingId && !existing) throw new TimelinePlaceError("Event changed or is unavailable. Reload before saving.");
    const position = await positionForCreate(tx, input.novelId, metadata);
    const data = { ...position, title: metadata.title, description: metadata.description, isSpoiler: metadata.isSpoiler };
    if (existingId) await tx.timelineEvent.update({ where: { id }, data: { ...data, positionRevision: { increment: 1 } } });
    else await tx.timelineEvent.create({ data: { id, novelId: input.novelId, ...data } });
    await setTimelineLinks(tx, input.novelId, id,
      existing && input.characterIds === undefined ? existing.characterLinks.map(link => link.characterId) : metadata.characterIds,
      existing && input.locationIds === undefined && input.locationId === undefined ? existing.placeLinks.map(link => link.locationId) : metadata.locationIds);
    return tx.timelineEvent.findUniqueOrThrow({ where: { id }, include: timelineLinksInclude });
  });

  return serializeTimelineEvent(event);
}

export async function createNote(input: {
  novelId: string;
  title: string;
  content?: string;
  linkedType?: Note["linkedType"];
  linkedId?: string;
  tags?: string[];
}) {
  return writeNote(input.novelId, input);
}

export async function createBackupRecord(input: {
  filename: string;
  size: string;
  includedNovels: number;
  novelId?: string | null;
  status?: string;
}) {
  const backup = await prisma.backup.create({
    data: {
      id: `backup-${crypto.randomUUID()}`,
      novelId: input.novelId ?? null,
      filename: input.filename,
      size: input.size,
      includedNovels: input.includedNovels,
      status: input.status ?? "Complete"
    }
  });

  return {
    ...backup,
    date: dateOnly(backup.createdAt),
    name: backup.filename
  };
}

async function persistStudioSettings(input: Record<string, unknown>) {
  const validatedInput = validateStudioSettingsUpdate(input);
  if (!validatedInput) {
    throw new StudioSettingsValidationError();
  }

  return prisma.$transaction(async (tx) => {
    const stored = await tx.studioConfiguration.findUnique({
      where: { id: STUDIO_CONFIGURATION_ID }
    });
    const next = applyStudioSettings(parseStudioSettings(stored?.values), validatedInput);
    await tx.studioConfiguration.upsert({
      where: { id: STUDIO_CONFIGURATION_ID },
      update: { version: STUDIO_CONFIGURATION_VERSION, values: JSON.stringify(next) },
      create: {
        id: STUDIO_CONFIGURATION_ID,
        version: STUDIO_CONFIGURATION_VERSION,
        values: JSON.stringify(next)
      }
    });
    return next;
  });
}

export class StudioSettingsValidationError extends Error {
  constructor() {
    super("Settings validation failed");
  }
}

export async function updateStudioSettings(input: Record<string, unknown>) {
  if ("notionRootPageId" in input || "notionRootPageTitle" in input) {
    throw new Error("Notion connection settings must be verified by the server");
  }

  return persistStudioSettings(input);
}

export async function saveValidatedNotionConnection(pageId: string, pageTitle: string) {
  return persistStudioSettings({ notionRootPageId: pageId, notionRootPageTitle: pageTitle });
}

export async function getStudioSettings() {
  const configuration = await prisma.studioConfiguration.findUnique({
    where: { id: STUDIO_CONFIGURATION_ID }
  });
  if (configuration) {
    return configuration.version === STUDIO_CONFIGURATION_VERSION
      ? parseStudioSettings(configuration.values)
      : parseStudioSettings(null);
  }

  const legacy = await prisma.appSetting.findMany({ orderBy: { key: "asc" } });
  const settings = applyStudioSettings(
    parseStudioSettings(null),
    Object.fromEntries(legacy.map((item) => [item.key, item.value]))
  );
  await prisma.studioConfiguration.upsert({
    where: { id: STUDIO_CONFIGURATION_ID },
    update: {},
    create: {
      id: STUDIO_CONFIGURATION_ID,
      version: STUDIO_CONFIGURATION_VERSION,
      values: JSON.stringify(settings)
    }
  });
  return settings;
}

export async function novelExistsForRoute(id: string) {
  return Boolean(
    await prisma.novel.findUnique({
      where: { id },
      select: { id: true }
    })
  );
}

export async function sceneBelongsToNovelForRoute(novelId: string, sceneId: string) {
  return Boolean(
    await prisma.scene.findFirst({
      where: {
        id: sceneId,
        chapter: { volume: { novelId } }
      },
      select: { id: true }
    })
  );
}

export async function characterBelongsToNovelForRoute(novelId: string, characterId: string) {
  return Boolean(
    await prisma.character.findFirst({
      where: { id: characterId, novelId },
      select: { id: true }
    })
  );
}

export async function placeBelongsToNovelForRoute(novelId: string, placeId: string) {
  return Boolean(
    await prisma.location.findFirst({
      where: { id: placeId, novelId },
      select: { id: true }
    })
  );
}

export async function updateAppSettings(input: Record<string, string>) {
  const entries = Object.entries(input).filter(([, value]) => value.length > 0);

  if (entries.length === 0) {
    const settings = await prisma.appSetting.findMany({ orderBy: { key: "asc" } });
    return Object.fromEntries(settings.map((setting) => [setting.key, setting.value]));
  }

  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.appSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value }
      })
    )
  );

  return Object.fromEntries(entries);
}

export async function updateScene(
  sceneId: string,
  input: {
    title?: string;
    content?: string;
    summary?: string;
    status?: ChapterStatus;
    objective?: string;
    locationId?: string;
    expectedRevision?: number;
  }
) {
  const updatedScene = await prisma.$transaction(async (tx) => {
    const existing = await tx.scene.findUniqueOrThrow({
      where: { id: sceneId },
      include: {
        chapter: {
          include: {
            volume: true
          }
        }
      }
    });
    const nextWordCount =
      typeof input.content === "string" ? countWords(input.content) : existing.wordCount;
    const wordDelta = nextWordCount - existing.wordCount;
    const expectedRevision = input.expectedRevision ?? existing.revision;
    const update = await tx.scene.updateMany({
      where: { id: sceneId, revision: expectedRevision },
      data: {
        title: typeof input.title === "string" ? input.title.trim() : undefined,
        content: typeof input.content === "string" ? input.content : undefined,
        summary: typeof input.summary === "string" ? input.summary.trim() : undefined,
        status: input.status,
        objective: typeof input.objective === "string" ? input.objective.trim() : undefined,
        wordCount: nextWordCount,
        revision: { increment: 1 }
      }
    });
    if (update.count === 0) {
      throw new SceneRevisionConflictError();
    }
    if (typeof input.locationId === "string") await setLegacyScenePlace(tx, existing.chapter.volume.novelId, sceneId, input.locationId.trim());
    const scene = await tx.scene.findUniqueOrThrow({ where: { id: sceneId }, include: scenePlaceLinksInclude });

    const chapterWords = await tx.scene.aggregate({
      where: { chapterId: existing.chapterId },
      _sum: { wordCount: true }
    });
    await tx.chapter.update({
      where: { id: existing.chapterId },
      data: { wordCount: chapterWords._sum.wordCount ?? 0 }
    });

    const novelChapters = await tx.chapter.findMany({
      where: { volume: { novelId: existing.chapter.volume.novelId } },
      select: { id: true }
    });
    const novelWords = await tx.scene.aggregate({
      where: { chapterId: { in: novelChapters.map((chapter) => chapter.id) } },
      _sum: { wordCount: true }
    });

    await tx.novel.update({
      where: { id: existing.chapter.volume.novelId },
      data: {
        updatedAt: new Date(),
        wordCount: novelWords._sum.wordCount ?? 0
      }
    });
    if (typeof input.content === "string" && wordDelta !== 0) {
      await tx.writingActivity.create({
        data: {
          novelId: existing.chapter.volume.novelId,
          sceneId: existing.id,
          wordDelta
        }
      });
    }
    await markNotionDirty(tx, existing.chapter.volume.novelId);

    return scene;
  });

  return serializeScene(updatedScene);
}

export class SceneInspectorValidationError extends Error {
  constructor() {
    super("scene inspector references are invalid");
  }
}

export async function getSceneInspector(sceneId: string) {
  const scene = await prisma.scene.findUniqueOrThrow({
    where: { id: sceneId },
    select: {
      ...scenePlaceLinksInclude,
      sceneCharacters: { select: { characterId: true } },
      timelineEvents: { select: { id: true }, take: 1 },
      chapter: { include: { volume: { select: { novelId: true } } } }
    }
  });
  const note = await prisma.note.findFirst({
    where: { novelId: scene.chapter.volume.novelId, sceneLinks: { some: { sceneId } }, archivedAt: null },
    select: { content: true }
  });
  return {
    locationIds: scene.placeLinks.map((link) => link.locationId),
    characterIds: scene.sceneCharacters.map((link) => link.characterId),
    timelineEventId: scene.timelineEvents[0]?.id ?? null,
    notes: note?.content ?? ""
  };
}

export async function updateSceneInspector(
  sceneId: string,
  input: { summary: string; objective: string; notes: string; characterIds: string[]; locationIds: string[]; expectedLocationIds?: string[]; timelineEventId: string | null }
) {
  const characterIds = [...new Set(input.characterIds)].slice(0, 50);
  return prisma.$transaction(async (tx) => {
    const scene = await tx.scene.findUniqueOrThrow({
      where: { id: sceneId },
      include: { chapter: { include: { volume: { select: { novelId: true } } } } }
    });
    const novelId = scene.chapter.volume.novelId;
    const [characterCount, timeline] = await Promise.all([
      tx.character.count({ where: { id: { in: characterIds }, novelId } }),
      input.timelineEventId ? tx.timelineEvent.findFirst({ where: { id: input.timelineEventId, novelId }, select: { id: true } }) : Promise.resolve(null)
    ]);
    if (characterCount !== characterIds.length || (input.timelineEventId && !timeline)) {
      throw new SceneInspectorValidationError();
    }
    await tx.scene.update({
      where: { id: sceneId },
      data: { summary: input.summary.trim(), objective: input.objective.trim() }
    });
    await setScenePlaces(tx, novelId, sceneId, input.locationIds, input.expectedLocationIds);
    await tx.sceneCharacter.deleteMany({ where: { sceneId } });
    if (characterIds.length) await tx.sceneCharacter.createMany({ data: characterIds.map((characterId) => ({ sceneId, characterId })) });
    await tx.timelineEvent.updateMany({ where: { sceneId, ...(input.timelineEventId ? { id: { not: input.timelineEventId } } : {}) }, data: { sceneId: null, positionRevision: { increment: 1 } } });
    if (input.timelineEventId) await tx.timelineEvent.update({ where: { id: input.timelineEventId }, data: { sceneId, chapterId: scene.chapterId, volumeId: scene.chapter.volumeId, positionRevision: { increment: 1 } } });
    const note = await tx.note.findFirst({ where: { novelId, sceneLinks: { some: { sceneId } }, archivedAt: null }, select: { id: true, title: true } });
    if (note) await tx.note.update({ where: { id: note.id }, data: { content: input.notes, searchText: `${note.title}\n${input.notes}`.normalize("NFC").toLowerCase(), revision: { increment: 1 } } });
    else if (input.notes) await tx.note.create({ data: { id: `note-${crypto.randomUUID()}`, novelId, linkedType: "Novel", linkedId: novelId, title: "Scene notes", workflowStatus: "informational", content: input.notes, searchText: `Scene notes\n${input.notes}`.normalize("NFC").toLowerCase(), tags: "[]", createdAt: new Date(), sceneLinks: { create: { sceneId } } } });
    await tx.novel.update({ where: { id: novelId }, data: { updatedAt: new Date() } });
    await markNotionDirty(tx, novelId);
    return {
      locationIds: input.locationIds,
      characterIds,
      timelineEventId: input.timelineEventId,
      notes: input.notes
    };
  });
}

export class SceneRevisionConflictError extends Error {
  constructor() {
    super("scene revision is stale");
  }
}

export class SceneVersionValidationError extends Error {
  constructor() { super("scene version is not available"); }
}

function serializeSceneVersion(version: { id: string; sceneId: string; title: string; content: string; wordCount: number; label: string; origin: string; createdAt: Date }) {
  return { ...version, createdAt: version.createdAt.toISOString() };
}

export async function listSceneVersions(sceneId: string) {
  const versions = await prisma.sceneVersion.findMany({ where: { sceneId }, orderBy: { createdAt: "desc" }, take: 100 });
  return versions.map(serializeSceneVersion);
}

export async function createSceneVersion(sceneId: string, label = "") {
  const version = await prisma.$transaction(async (tx) => {
    const scene = await tx.scene.findUniqueOrThrow({ where: { id: sceneId }, include: { chapter: { include: { volume: true } } } });
    const created = await tx.sceneVersion.create({ data: { id: `scene-version-${crypto.randomUUID()}`, sceneId, title: scene.title, content: scene.content, wordCount: scene.wordCount, label: label.trim().slice(0, 120), origin: "manual" } });
    await markNotionDirty(tx, scene.chapter.volume.novelId);
    return created;
  });
  return serializeSceneVersion(version);
}

export async function restoreSceneVersion(sceneId: string, versionId: string) {
  const scene = await prisma.$transaction(async (tx) => {
    const current = await tx.scene.findUniqueOrThrow({ where: { id: sceneId }, include: { chapter: { include: { volume: true } } } });
    const version = await tx.sceneVersion.findFirst({ where: { id: versionId, sceneId } });
    if (!version) throw new SceneVersionValidationError();
    await tx.sceneVersion.create({ data: { id: `scene-version-${crypto.randomUUID()}`, sceneId, title: current.title, content: current.content, wordCount: current.wordCount, label: "", origin: "before restore" } });
    const restored = await tx.scene.update({ where: { id: sceneId }, data: { title: version.title, content: version.content, wordCount: version.wordCount, revision: { increment: 1 } }, include: scenePlaceLinksInclude });
    await markNotionDirty(tx, current.chapter.volume.novelId);
    return restored;
  });
  return serializeScene(scene);
}

export async function getScene(sceneId: string) {
  const scene = await prisma.scene.findUniqueOrThrow({ where: { id: sceneId }, include: scenePlaceLinksInclude });
  return serializeScene(scene);
}

export async function sceneBelongsToNovel(sceneId: string, novelId: string) {
  return Boolean(await prisma.scene.findFirst({ where: { id: sceneId, chapter: { volume: { novelId } } }, select: { id: true } }));
}

export async function getChapterPreview(chapterId: string) {
  const chapter = await prisma.chapter.findUniqueOrThrow({
    where: { id: chapterId },
    include: {
      volume: { select: { novelId: true } },
      scenes: {
        where: { archived: false },
        select: { id: true, chapterId: true, title: true, content: true, sortOrder: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
      }
    }
  });
  const scenes = orderChapterPreviewScenes(chapter.id, chapter.scenes);

  return {
    chapter: { id: chapter.id, title: chapter.title, novelId: chapter.volume.novelId },
    scenes,
    content: composeChapterPreview(chapter.id, scenes)
  };
}

function readerVolumeMetadata(volume: {
  id: string;
  novelId: string;
  title: string;
  sortOrder: number;
  archived: boolean;
}) {
  return {
    id: volume.id,
    novelId: volume.novelId,
    title: volume.title,
    sortOrder: volume.sortOrder,
    archived: volume.archived
  };
}

function readerChapterMetadata(chapter: {
  id: string;
  volumeId: string;
  title: string;
  sortOrder: number;
  archived: boolean;
}) {
  return {
    id: chapter.id,
    volumeId: chapter.volumeId,
    title: chapter.title,
    sortOrder: chapter.sortOrder,
    archived: chapter.archived
  };
}

export async function getReaderDocument(novelId: string, scope: ReaderScope, targetId: string) {
  const sceneSelect = {
    id: true,
    chapterId: true,
    title: true,
    content: true,
    sortOrder: true,
    archived: true,
    revision: true
  } as const;

  if (scope === "scene") {
    const scene = await prisma.scene.findFirst({
      where: {
        id: targetId,
        archived: false,
        chapter: { archived: false, volume: { archived: false, novelId } }
      },
      select: {
        ...sceneSelect,
        chapter: {
          select: {
            id: true,
            volumeId: true,
            title: true,
            sortOrder: true,
            archived: true,
            volume: {
              select: {
                id: true,
                novelId: true,
                title: true,
                sortOrder: true,
                archived: true,
                novel: { select: { id: true, title: true } }
              }
            }
          }
        }
      }
    });
    if (!scene) return null;
    const { chapter, ...readerScene } = scene;
    const { volume, ...readerChapter } = chapter;
    const { novel, ...readerVolume } = volume;
    return { novel, scope, targetId, volumes: [readerVolume], chapters: [readerChapter], scenes: [readerScene] };
  }

  if (scope === "chapter") {
    const chapter = await prisma.chapter.findFirst({
      where: { id: targetId, archived: false, volume: { archived: false, novelId } },
      select: {
        id: true,
        volumeId: true,
        title: true,
        sortOrder: true,
        archived: true,
        volume: {
          select: {
            id: true,
            novelId: true,
            title: true,
            sortOrder: true,
            archived: true,
            novel: { select: { id: true, title: true } }
          }
        },
        scenes: {
          where: { archived: false },
          select: sceneSelect,
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
        }
      }
    });
    if (!chapter) return null;
    const { volume, scenes, ...readerChapter } = chapter;
    const { novel, ...readerVolume } = volume;
    return { novel, scope, targetId, volumes: [readerVolume], chapters: [readerChapter], scenes };
  }

  if (scope === "volume") {
    const volume = await prisma.volume.findFirst({
      where: { id: targetId, novelId, archived: false },
      select: {
        id: true,
        novelId: true,
        title: true,
        sortOrder: true,
        archived: true,
        novel: { select: { id: true, title: true } },
        chapters: {
          where: { archived: false },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: {
            id: true,
            volumeId: true,
            title: true,
            sortOrder: true,
            archived: true,
            scenes: {
              where: { archived: false },
              select: sceneSelect,
              orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
            }
          }
        }
      }
    });
    if (!volume) return null;
    const { novel, chapters, ...readerVolume } = volume;
    return {
      novel,
      scope,
      targetId,
      volumes: [readerVolume],
      chapters: chapters.map(readerChapterMetadata),
      scenes: chapters.flatMap((chapter) => chapter.scenes)
    };
  }

  if (targetId !== novelId) return null;
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    select: {
      id: true,
      title: true,
      volumes: {
        where: { archived: false },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: {
          id: true,
          novelId: true,
          title: true,
          sortOrder: true,
          archived: true,
          chapters: {
            where: { archived: false },
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            select: {
              id: true,
              volumeId: true,
              title: true,
              sortOrder: true,
              archived: true,
              scenes: {
                where: { archived: false },
                select: sceneSelect,
                orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
              }
            }
          }
        }
      }
    }
  });
  if (!novel) return null;
  return {
    novel: { id: novel.id, title: novel.title },
    scope,
    targetId,
    volumes: novel.volumes.map(readerVolumeMetadata),
    chapters: novel.volumes.flatMap((volume) => volume.chapters.map(readerChapterMetadata)),
    scenes: novel.volumes.flatMap((volume) => volume.chapters.flatMap((chapter) => chapter.scenes))
  };
}

export async function getReaderOutline(novelId: string): Promise<ReaderOutline | null> {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    select: {
      id: true,
      title: true,
      volumes: {
        where: { archived: false },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: {
          id: true,
          novelId: true,
          title: true,
          sortOrder: true,
          archived: true,
          chapters: {
            where: { archived: false },
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            select: {
              id: true,
              volumeId: true,
              title: true,
              sortOrder: true,
              archived: true,
              scenes: {
                where: { archived: false },
                orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
                select: { id: true, chapterId: true, title: true, sortOrder: true, archived: true }
              }
            }
          }
        }
      }
    }
  });
  if (!novel) return null;
  return {
    novel: { id: novel.id, title: novel.title },
    volumes: novel.volumes.map(readerVolumeMetadata),
    chapters: novel.volumes.flatMap((volume) => volume.chapters.map(readerChapterMetadata)),
    scenes: novel.volumes.flatMap((volume) => volume.chapters.flatMap((chapter) => chapter.scenes))
  };
}

export class ReadingProgressValidationError extends Error {
  constructor() { super("reading progress target is not available"); }
}

function serializeReadingProgress(progress: {
  novelId: string;
  preferredScope: string;
  volumeId: string | null;
  chapterId: string | null;
  sceneId: string | null;
  positionRatio: number;
  contentRevision: number | null;
  lastReadAt: Date;
}): StoredReadingProgress {
  return {
    ...progress,
    preferredScope: progress.preferredScope as ReaderScope,
    lastReadAt: progress.lastReadAt.toISOString()
  };
}

async function getReadingHierarchy(novelId: string) {
  return prisma.novel.findUnique({
    where: { id: novelId },
    select: {
      id: true,
      volumes: {
        select: {
          id: true,
          novelId: true,
          title: true,
          sortOrder: true,
          archived: true,
          chapters: {
            select: {
              id: true,
              volumeId: true,
              title: true,
              sortOrder: true,
              archived: true,
              scenes: {
                select: {
                  id: true,
                  chapterId: true,
                  title: true,
                  content: true,
                  sortOrder: true,
                  archived: true,
                  revision: true
                }
              }
            }
          }
        }
      }
    }
  });
}

export async function getReadingProgress(novelId: string) {
  const [stored, novel] = await Promise.all([
    prisma.readingProgress.findUnique({ where: { novelId } }),
    getReadingHierarchy(novelId)
  ]);
  if (!stored || !novel) return null;
  const volumes = novel.volumes;
  const chapters = volumes.flatMap((volume) => volume.chapters);
  const scenes = chapters.flatMap((chapter) => chapter.scenes);
  return resolveReadingProgress(serializeReadingProgress(stored), novelId, volumes, chapters, scenes);
}

export async function saveReadingProgress(
  novelId: string,
  input: { preferredScope: ReaderScope; sceneId: string; positionRatio: number }
) {
  const novel = await getReadingHierarchy(novelId);
  if (!novel) throw new ReadingProgressValidationError();
  const volumes = novel.volumes.filter((volume) => !volume.archived);
  const chapters = volumes.flatMap((volume) => volume.chapters).filter((chapter) => !chapter.archived);
  const scene = chapters.flatMap((chapter) => chapter.scenes).find((item) => item.id === input.sceneId && !item.archived);
  const chapter = scene ? chapters.find((item) => item.id === scene.chapterId) : null;
  const volume = chapter ? volumes.find((item) => item.id === chapter.volumeId) : null;
  if (!scene || !chapter || !volume) throw new ReadingProgressValidationError();

  const lastReadAt = new Date();
  await prisma.readingProgress.upsert({
    where: { novelId },
    update: {
      preferredScope: input.preferredScope,
      volumeId: volume.id,
      chapterId: chapter.id,
      sceneId: scene.id,
      positionRatio: clampReadingRatio(input.positionRatio),
      contentRevision: scene.revision,
      lastReadAt
    },
    create: {
      novelId,
      preferredScope: input.preferredScope,
      volumeId: volume.id,
      chapterId: chapter.id,
      sceneId: scene.id,
      positionRatio: clampReadingRatio(input.positionRatio),
      contentRevision: scene.revision,
      lastReadAt
    }
  });
  return getReadingProgress(novelId);
}

