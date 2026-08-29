import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { composeChapterPreview, orderChapterPreviewScenes } from "@/lib/chapter-preview";
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
  Character,
  ChapterStatus,
  Location,
  Note,
  NovelStatus,
  Relationship as StoryRelationship
} from "@/lib/studio-domain";

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
  locationId: string | null;
  sortOrder: number;
  wordCount: number;
  objective: string;
  revision: number;
}) {
  return {
    ...scene,
    content: scene.content ?? "",
    status: scene.status as ChapterStatus,
    locationId: scene.locationId ?? ""
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
  firstAppearance: string;
  status: string;
  image: string;
  scenesCount: number;
}) {
  return {
    ...character,
    status: character.status as Character["status"],
    scenes: character.scenesCount
  };
}

function serializeLocation(location: {
  id: string;
  novelId: string;
  name: string;
  type: string;
  region: string;
  description: string;
  importance: string;
  visualNotes: string;
  rules: string;
  firstAppearance: string;
  notes: string;
}) {
  return {
    ...location,
    type: location.type as Location["type"]
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

function serializeNote(note: {
  id: string;
  novelId: string;
  linkedType: string;
  linkedId: string;
  title: string;
  content: string;
  tags: string;
  updatedAt: Date;
}) {
  return {
    ...note,
    linkedType: note.linkedType as Note["linkedType"],
    tags: parseList(note.tags),
    updatedAt: dateOnly(note.updatedAt)
  };
}

function serializeRelationship(relationship: {
  id: string;
  novelId: string;
  fromCharacterId: string;
  toCharacterId: string;
  relationshipType: string;
  category: string;
  direction: string;
  description: string;
  isSpoiler: boolean;
  status: string;
  since: string;
  notes: string;
}) {
  return {
    ...relationship,
    category: relationship.category as StoryRelationship["category"],
    direction: relationship.direction as StoryRelationship["direction"]
  };
}

function serializeTimelineEvent(event: {
  id: string;
  novelId: string;
  title: string;
  internalDate: string;
  volumeId: string | null;
  chapterId: string | null;
  sceneId: string | null;
  locationId: string | null;
  characterIds: string;
  description: string;
  isSpoiler: boolean;
}) {
  return {
    ...event,
    volumeId: event.volumeId ?? "",
    chapterId: event.chapterId ?? "",
    sceneId: event.sceneId ?? "",
    locationId: event.locationId ?? "",
    characterIds: parseList(event.characterIds)
  };
}

export async function getStudioSnapshot() {
  const [
    novels,
    volumes,
    chapters,
    scenes,
    characters,
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
        locationId: true,
        sortOrder: true,
        wordCount: true,
        objective: true,
        revision: true,
        archived: true
      },
      orderBy: [{ chapterId: "asc" }, { sortOrder: "asc" }]
    }),
    prisma.character.findMany({ orderBy: [{ novelId: "asc" }, { name: "asc" }] }),
    prisma.location.findMany({ orderBy: [{ novelId: "asc" }, { name: "asc" }] }),
    prisma.relationship.findMany({ orderBy: { id: "asc" } }),
    prisma.timelineEvent.findMany({ orderBy: { id: "asc" } }),
    prisma.note.findMany({ orderBy: { updatedAt: "desc" } }),
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
    characters: characters.map((character) => serializeCharacter(character)),
    locations: locations.map((location) => serializeLocation(location)),
    relationships: relationships.map((relationship) => serializeRelationship(relationship)),
    timelineEvents: timelineEvents.map((event) => serializeTimelineEvent(event)),
    notes: notes.map((note) => serializeNote(note)),
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
  name: string;
  notes?: string;
}) {
  const id = `char-${crypto.randomUUID()}`;

  const character = await prisma.$transaction(async (tx) => {
    const createdCharacter = await tx.character.create({
      data: {
        id,
        novelId: input.novelId,
        name: input.name,
        alias: "",
        age: "",
        role: "Support",
        appearance: "",
        personality: "",
        wayOfSpeaking: "",
        goal: "",
        fear: "",
        secret: "",
        notes: input.notes ?? "",
        firstAppearance: "",
        status: "Active",
        image: "",
        scenesCount: 0
      }
    });

    await tx.novel.update({
      where: { id: input.novelId },
      data: { updatedAt: new Date() }
    });
    await markNotionDirty(tx, input.novelId);

    return createdCharacter;
  });

  return serializeCharacter(character);
}

export async function createLocation(input: {
  novelId: string;
  name: string;
  notes?: string;
}) {
  const id = `place-${crypto.randomUUID()}`;

  const location = await prisma.$transaction(async (tx) => {
    const createdLocation = await tx.location.create({
      data: {
        id,
        novelId: input.novelId,
        name: input.name,
        type: "Other",
        region: "",
        description: input.notes ?? "",
        importance: "",
        visualNotes: "",
        rules: "",
        firstAppearance: "",
        notes: input.notes ?? ""
      }
    });

    await tx.novel.update({
      where: { id: input.novelId },
      data: { updatedAt: new Date() }
    });

    return createdLocation;
  });

  return serializeLocation(location);
}

export async function createRelationship(input: {
  novelId: string;
  fromCharacterId: string;
  toCharacterId: string;
  relationshipType: string;
  category: StoryRelationship["category"];
  direction?: StoryRelationship["direction"];
  description?: string;
  isSpoiler?: boolean;
  status?: string;
  since?: string;
  notes?: string;
}) {
  const id = `rel-${crypto.randomUUID()}`;

  const relationship = await prisma.$transaction(async (tx) => {
    const createdRelationship = await tx.relationship.create({
      data: {
        id,
        novelId: input.novelId,
        fromCharacterId: input.fromCharacterId,
        toCharacterId: input.toCharacterId,
        relationshipType: input.relationshipType,
        category: input.category,
        direction: input.direction ?? "Directional",
        description: input.description ?? "",
        isSpoiler: input.isSpoiler ?? false,
        status: input.status ?? "Growing",
        since: input.since ?? "",
        notes: input.notes ?? ""
      }
    });

    await tx.novel.update({
      where: { id: input.novelId },
      data: { updatedAt: new Date() }
    });

    return createdRelationship;
  });

  return serializeRelationship(relationship);
}

export async function createTimelineEvent(input: {
  novelId: string;
  title: string;
  internalDate: string;
  volumeId?: string;
  chapterId?: string;
  sceneId?: string;
  locationId?: string;
  characterIds?: string[];
  description?: string;
  isSpoiler?: boolean;
}) {
  const id = `event-${crypto.randomUUID()}`;

  const event = await prisma.$transaction(async (tx) => {
    const createdEvent = await tx.timelineEvent.create({
      data: {
        id,
        novelId: input.novelId,
        title: input.title,
        internalDate: input.internalDate,
        volumeId: input.volumeId?.trim() || null,
        chapterId: input.chapterId?.trim() || null,
        sceneId: input.sceneId?.trim() || null,
        locationId: input.locationId?.trim() || null,
        characterIds: JSON.stringify(input.characterIds ?? []),
        description: input.description ?? "",
        isSpoiler: input.isSpoiler ?? false
      }
    });

    await tx.novel.update({
      where: { id: input.novelId },
      data: { updatedAt: new Date() }
    });

    return createdEvent;
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
  const id = `note-${crypto.randomUUID()}`;

  const note = await prisma.$transaction(async (tx) => {
    const createdNote = await tx.note.create({
      data: {
        id,
        novelId: input.novelId,
        linkedType: input.linkedType ?? "Novel",
        linkedId: input.linkedId ?? input.novelId,
        title: input.title,
        content: input.content ?? "",
        tags: JSON.stringify(input.tags ?? [])
      }
    });

    await tx.novel.update({
      where: { id: input.novelId },
      data: { updatedAt: new Date() }
    });

    return createdNote;
  });

  return serializeNote(note);
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
        locationId:
          typeof input.locationId === "string"
            ? input.locationId.trim() || null
            : undefined,
        wordCount: nextWordCount,
        revision: { increment: 1 }
      }
    });
    if (update.count === 0) {
      throw new SceneRevisionConflictError();
    }
    const scene = await tx.scene.findUniqueOrThrow({ where: { id: sceneId } });

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
    include: {
      sceneCharacters: { select: { characterId: true } },
      timelineEvents: { select: { id: true }, take: 1 },
      chapter: { include: { volume: { select: { novelId: true } } } }
    }
  });
  const note = await prisma.note.findFirst({
    where: { novelId: scene.chapter.volume.novelId, linkedType: "Scene", linkedId: sceneId },
    select: { content: true }
  });
  return {
    characterIds: scene.sceneCharacters.map((link) => link.characterId),
    timelineEventId: scene.timelineEvents[0]?.id ?? null,
    notes: note?.content ?? ""
  };
}

export async function updateSceneInspector(
  sceneId: string,
  input: { summary: string; objective: string; notes: string; characterIds: string[]; locationId: string | null; timelineEventId: string | null }
) {
  const characterIds = [...new Set(input.characterIds)].slice(0, 50);
  return prisma.$transaction(async (tx) => {
    const scene = await tx.scene.findUniqueOrThrow({
      where: { id: sceneId },
      include: { chapter: { include: { volume: { select: { novelId: true } } } } }
    });
    const novelId = scene.chapter.volume.novelId;
    const [characterCount, location, timeline] = await Promise.all([
      tx.character.count({ where: { id: { in: characterIds }, novelId } }),
      input.locationId ? tx.location.findFirst({ where: { id: input.locationId, novelId }, select: { id: true } }) : Promise.resolve(null),
      input.timelineEventId ? tx.timelineEvent.findFirst({ where: { id: input.timelineEventId, novelId }, select: { id: true } }) : Promise.resolve(null)
    ]);
    if (characterCount !== characterIds.length || (input.locationId && !location) || (input.timelineEventId && !timeline)) {
      throw new SceneInspectorValidationError();
    }
    await tx.scene.update({
      where: { id: sceneId },
      data: { summary: input.summary.trim(), objective: input.objective.trim(), locationId: input.locationId }
    });
    await tx.sceneCharacter.deleteMany({ where: { sceneId } });
    if (characterIds.length) await tx.sceneCharacter.createMany({ data: characterIds.map((characterId) => ({ sceneId, characterId })) });
    await tx.timelineEvent.updateMany({ where: { sceneId }, data: { sceneId: null } });
    if (input.timelineEventId) await tx.timelineEvent.update({ where: { id: input.timelineEventId }, data: { sceneId } });
    const note = await tx.note.findFirst({ where: { novelId, linkedType: "Scene", linkedId: sceneId }, select: { id: true } });
    if (note) await tx.note.update({ where: { id: note.id }, data: { content: input.notes } });
    else if (input.notes) await tx.note.create({ data: { id: `note-${crypto.randomUUID()}`, novelId, linkedType: "Scene", linkedId: sceneId, title: "Scene notes", content: input.notes, tags: "[]" } });
    await tx.novel.update({ where: { id: novelId }, data: { updatedAt: new Date() } });
    await markNotionDirty(tx, novelId);
    return {
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
    const restored = await tx.scene.update({ where: { id: sceneId }, data: { title: version.title, content: version.content, wordCount: version.wordCount, revision: { increment: 1 } } });
    await markNotionDirty(tx, current.chapter.volume.novelId);
    return restored;
  });
  return serializeScene(scene);
}

export async function getScene(sceneId: string) {
  const scene = await prisma.scene.findUniqueOrThrow({ where: { id: sceneId } });
  return serializeScene(scene);
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

