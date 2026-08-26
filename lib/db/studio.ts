import { prisma } from "@/lib/db/prisma";
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

function serializeScene(scene: {
  id: string;
  chapterId: string;
  title: string;
  content: string;
  summary: string;
  status: string;
  locationId: string | null;
  sortOrder: number;
  wordCount: number;
  objective: string;
}) {
  return {
    ...scene,
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
    settings
  ] = await Promise.all([
    prisma.novel.findMany({ orderBy: { updatedAt: "desc" } }),
    prisma.volume.findMany({ orderBy: [{ novelId: "asc" }, { sortOrder: "asc" }] }),
    prisma.chapter.findMany({ orderBy: [{ volumeId: "asc" }, { sortOrder: "asc" }] }),
    prisma.scene.findMany({ orderBy: [{ chapterId: "asc" }, { sortOrder: "asc" }] }),
    prisma.character.findMany({ orderBy: [{ novelId: "asc" }, { name: "asc" }] }),
    prisma.location.findMany({ orderBy: [{ novelId: "asc" }, { name: "asc" }] }),
    prisma.relationship.findMany({ orderBy: { id: "asc" } }),
    prisma.timelineEvent.findMany({ orderBy: { id: "asc" } }),
    prisma.note.findMany({ orderBy: { updatedAt: "desc" } }),
    prisma.backup.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.appSetting.findMany({ orderBy: { key: "asc" } })
  ]);

  return {
    novels: novels.map((novel) => serializeNovel(novel)),
    volumes,
    chapters: chapters.map((chapter) => ({
      ...chapter,
      status: chapter.status as ChapterStatus
    })),
    scenes: scenes.map((scene) => serializeScene(scene)),
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
    settings: Object.fromEntries(settings.map((setting) => [setting.key, setting.value]))
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
    const scene = await tx.scene.update({
      where: { id: sceneId },
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
        wordCount: nextWordCount
      }
    });

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

    return scene;
  });

  return serializeScene(updatedScene);
}

