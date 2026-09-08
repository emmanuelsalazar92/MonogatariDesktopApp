import type {
  Character,
  CharacterPlaceLink,
  Chapter,
  PlaceSummary,
  Novel,
  RelationshipSummary,
  Scene,
  TimelineEventSummary,
  Volume,
  WritingActivity,
  RecentActivity
} from "@/lib/studio-domain";
import { relationshipSummary } from "@/lib/character-relationship";

export type StudioBackup = {
  id?: string;
  name: string;
  filename?: string;
  date: string;
  size: string;
  includedNovels: number;
  status: string;
};

export type StudioData = {
  novels: Novel[];
  volumes: Volume[];
  chapters: Chapter[];
  scenes: Scene[];
  characters: Character[];
  characterPlaceLinks: CharacterPlaceLink[];
  locations: PlaceSummary[];
  relationships: RelationshipSummary[];
  timelineEvents: TimelineEventSummary[];
  notes: import("@/lib/studio-domain").Note[];
  overviewNotesCount: number;
  backups: StudioBackup[];
  writingActivities: WritingActivity[];
  recentActivities: RecentActivity[];
  studioSettings: PersistedStudioSettings;
  settings: Record<string, string>;
  notionSyncStates: Array<{
    novelId: string;
    isDirty: boolean;
    revision: number;
    lastSyncedRevision: number;
    syncStatus: "idle" | "syncing" | "error" | "remote-changes";
    syncStartedAt: string | null;
    lastSyncError: string | null;
    mapped?: boolean;
    configured?: boolean;
    lastNotionSync: string | null;
  }>;
  notionSceneStates: Array<{
    sceneId: string;
    state: "synced" | "local-changes" | "not-yet-synced";
    notionPageId: string | null;
  }>;
};

export type DataStatus = "loading" | "ready" | "fallback";

export type PersistedStudioSettings = {
  libraryView: "grid" | "list";
  language: "en" | "es";
  sidebarState: "expanded" | "compact" | "hidden";
  editorFontSize: string;
  readerFontSize: string;
  readerWidth: string;
  autosaveInterval: string;
  editorInspectorOpen: boolean;
  defaultFocusMode: string;
  backupRetention: string;
  exportDefaults: string;
  typewriterFont: boolean;
  notionRootPageId: string;
  notionRootPageTitle: string;
  notionAutosyncEnabled: boolean;
  notionAutosyncIntervalMinutes: string;
  dailyWordGoal: string;
};

export const emptyStudioData: StudioData = {
  novels: [],
  volumes: [],
  chapters: [],
  scenes: [],
  characters: [],
  characterPlaceLinks: [],
  locations: [],
  relationships: [],
  timelineEvents: [],
  notes: [],
  overviewNotesCount: 0,
  backups: [],
  writingActivities: [],
  recentActivities: [],
  studioSettings: {} as PersistedStudioSettings,
  settings: {},
  notionSyncStates: [],
  notionSceneStates: []
};

export const emptyNovel: Novel = {
  id: "",
  title: "No novel loaded",
  synopsis: "Create a novel or reconnect SQLite to continue.",
  status: "Idea",
  coverImage: "",
  genre: "",
  tags: [],
  wordCount: 0,
  createdAt: "",
  updatedAt: ""
};

export const emptyChapter: Chapter = {
  id: "",
  volumeId: "",
  title: "No chapter loaded",
  summary: "",
  status: "Idea",
  sortOrder: 0,
  wordCount: 0,
  archived: false
};

export const emptyScene: Scene = {
  id: "",
  chapterId: "",
  title: "No scene loaded",
  content: "",
  contentLoaded: false,
  summary: "",
  status: "Idea",
  locationId: "",
  sortOrder: 0,
  wordCount: 0,
  objective: "",
  revision: 0,
  archived: false
};

export const defaultPersistedStudioSettings: PersistedStudioSettings = {
  libraryView: "grid",
  language: "en",
  sidebarState: "expanded",
  editorFontSize: "18 px",
  readerFontSize: "18 px",
  readerWidth: "720 px",
  autosaveInterval: "30 seconds",
  editorInspectorOpen: true,
  defaultFocusMode: "Writing",
  backupRetention: "30 daily backups",
  exportDefaults: "{\"format\":\"EPUB\",\"options\":[\"Include cover\",\"Include metadata\"]}",
  typewriterFont: true,
  notionRootPageId: "",
  notionRootPageTitle: "",
  notionAutosyncEnabled: false,
  notionAutosyncIntervalMinutes: "5",
  dailyWordGoal: "1500"
};

const novelStatuses = new Set<Novel["status"]>([
  "Idea",
  "Planning",
  "Writing",
  "Revision",
  "Complete",
  "Archived"
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, fallback = "", limit = 5_000) {
  return typeof value === "string" ? value.slice(0, limit) : fallback;
}

function wholeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function normalizeNovel(value: unknown): Novel | null {
  const source = record(value);
  if (!source || !text(source.id)) return null;

  const status = text(source.status);
  return {
    id: text(source.id, "", 200),
    title: text(source.title, "Untitled novel", 160) || "Untitled novel",
    synopsis: text(source.synopsis),
    status: novelStatuses.has(status as Novel["status"]) ? status as Novel["status"] : "Idea",
    coverImage: text(source.coverImage, "", 2_000),
    genre: text(source.genre, "", 120),
    tags: Array.isArray(source.tags)
      ? source.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.slice(0, 60)).slice(0, 20)
      : [],
    wordCount: wholeNumber(source.wordCount),
    createdAt: text(source.createdAt, "", 80),
    updatedAt: text(source.updatedAt, "", 80)
  };
}

function normalizeRecentActivity(value: unknown): RecentActivity | null {
  const source = record(value);
  const createdAt = text(source?.createdAt, "", 80);
  if (
    !source ||
    !text(source.id) ||
    !text(source.novelId) ||
    !text(source.label) ||
    !Number.isFinite(new Date(createdAt).getTime())
  ) return null;

  return {
    id: text(source.id, "", 200),
    novelId: text(source.novelId, "", 200),
    eventType: text(source.eventType, "activity", 80),
    entityType: text(source.entityType, "", 80),
    entityId: typeof source.entityId === "string" ? source.entityId.slice(0, 200) : null,
    label: text(source.label, "Activity updated", 180),
    createdAt
  };
}

function normalizeSettings(value: unknown) {
  const source = record(value);
  if (!source) return emptyStudioData.settings;
  return Object.fromEntries(
    Object.entries(source).filter(([, setting]) => typeof setting === "string")
  ) as Record<string, string>;
}

function normalizeNotionSyncStates(value: unknown): StudioData["notionSyncStates"] {
  if (!Array.isArray(value)) return [];
  const allowedStatuses = new Set(["idle", "syncing", "error", "remote-changes"]);
  return value.flatMap((item) => {
    const source = record(item);
    const novelId = text(source?.novelId, "", 200);
    if (!source || !novelId) return [];
    const syncStatus = text(source.syncStatus);
    return [{
      novelId,
      isDirty: source.isDirty === true,
      revision: wholeNumber(source.revision),
      lastSyncedRevision: wholeNumber(source.lastSyncedRevision),
      syncStatus: allowedStatuses.has(syncStatus)
        ? syncStatus as StudioData["notionSyncStates"][number]["syncStatus"]
        : "idle",
      syncStartedAt: typeof source.syncStartedAt === "string" ? source.syncStartedAt : null,
      lastSyncError: typeof source.lastSyncError === "string" ? source.lastSyncError.slice(0, 500) : null,
      mapped: source.mapped === true,
      configured: source.configured === true,
      lastNotionSync: typeof source.lastNotionSync === "string" ? source.lastNotionSync : null
    }];
  });
}

function normalizeNotionSceneStates(value: unknown): StudioData["notionSceneStates"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const source = record(item); const sceneId = text(source?.sceneId, "", 200); const state = text(source?.state);
    return sceneId && ["synced", "local-changes", "not-yet-synced"].includes(state)
      ? [{ sceneId, state: state as StudioData["notionSceneStates"][number]["state"], notionPageId: typeof source?.notionPageId === "string" ? source.notionPageId : null }]
      : [];
  });
}

export function normalizeStudioData(payload: Partial<StudioData>): StudioData {
  return {
    novels: Array.isArray(payload.novels)
      ? payload.novels.flatMap((novel) => {
          const normalized = normalizeNovel(novel);
          return normalized ? [normalized] : [];
        })
      : emptyStudioData.novels,
    volumes: Array.isArray(payload.volumes) ? payload.volumes : emptyStudioData.volumes,
    chapters: Array.isArray(payload.chapters) ? payload.chapters : emptyStudioData.chapters,
    scenes: Array.isArray(payload.scenes) ? payload.scenes : emptyStudioData.scenes,
    characters: Array.isArray(payload.characters)
      ? payload.characters
      : emptyStudioData.characters,
    characterPlaceLinks: Array.isArray(payload.characterPlaceLinks)
      ? payload.characterPlaceLinks
      : emptyStudioData.characterPlaceLinks,
    locations: Array.isArray(payload.locations) ? payload.locations : emptyStudioData.locations,
    relationships: Array.isArray(payload.relationships)
      ? payload.relationships.map(relationshipSummary)
      : emptyStudioData.relationships,
    timelineEvents: Array.isArray(payload.timelineEvents)
      ? payload.timelineEvents
      : emptyStudioData.timelineEvents,
    notes: Array.isArray(payload.notes) ? payload.notes : emptyStudioData.notes,
    overviewNotesCount:
      typeof payload.overviewNotesCount === "number" && Number.isFinite(payload.overviewNotesCount)
        ? Math.max(0, Math.floor(payload.overviewNotesCount))
        : 0,
    backups: Array.isArray(payload.backups) ? payload.backups : emptyStudioData.backups,
    writingActivities: Array.isArray(payload.writingActivities)
      ? payload.writingActivities
      : emptyStudioData.writingActivities,
    recentActivities: Array.isArray(payload.recentActivities)
      ? payload.recentActivities.flatMap((activity) => {
          const normalized = normalizeRecentActivity(activity);
          return normalized ? [normalized] : [];
        })
      : emptyStudioData.recentActivities,
    studioSettings:
      payload.studioSettings && typeof payload.studioSettings === "object"
        ? { ...defaultPersistedStudioSettings, ...payload.studioSettings }
        : defaultPersistedStudioSettings,
    settings: normalizeSettings(payload.settings),
    notionSyncStates: normalizeNotionSyncStates(payload.notionSyncStates),
    notionSceneStates: normalizeNotionSceneStates(payload.notionSceneStates)
  };
}

export function getScopedStudioData(data: StudioData): StudioData {
  const activeNovelId = data.settings.activeNovelId;

  if (!activeNovelId) {
    return data;
  }

  const scopedVolumeIds = new Set(
    data.volumes.filter((volume) => volume.novelId === activeNovelId).map((volume) => volume.id)
  );
  const scopedChapterIds = new Set(
    data.chapters
      .filter((chapter) => scopedVolumeIds.has(chapter.volumeId))
      .map((chapter) => chapter.id)
  );
  const scopedSceneIds = new Set(
    data.scenes.filter((scene) => scopedChapterIds.has(scene.chapterId)).map((scene) => scene.id)
  );

  return {
    ...data,
    volumes: data.volumes.filter((volume) => volume.novelId === activeNovelId),
    chapters: data.chapters.filter((chapter) => scopedChapterIds.has(chapter.id)),
    scenes: data.scenes.filter((scene) => scopedSceneIds.has(scene.id)),
    characters: data.characters.filter((character) => character.novelId === activeNovelId),
    characterPlaceLinks: data.characterPlaceLinks.filter((link) =>
      data.characters.some(
        (character) => character.id === link.characterId && character.novelId === activeNovelId
      )
    ),
    locations: data.locations.filter((location) => location.novelId === activeNovelId),
    relationships: data.relationships.filter(
      (relationship) => relationship.novelId === activeNovelId
    ),
    timelineEvents: data.timelineEvents.filter((event) => event.novelId === activeNovelId),
    notes: data.notes.filter((note) => note.novelId === activeNovelId),
    backups: data.backups,
    writingActivities: data.writingActivities.filter((activity) => activity.novelId === activeNovelId),
    recentActivities: data.recentActivities.filter((activity) => activity.novelId === activeNovelId)
  };
}

export function getCurrentNovel(data: StudioData) {
  const activeNovelId = data.settings.activeNovelId;
  const selected = data.novels.find((novel) => novel.id === activeNovelId);
  if (selected && selected.status !== "Archived") return selected;
  return data.novels.find((novel) => novel.status !== "Archived") ?? emptyNovel;
}

export function getActiveChapter(data: StudioData) {
  const currentNovel = getCurrentNovel(data);
  const currentVolumeIds = new Set(
    data.volumes.filter((volume) => volume.novelId === currentNovel.id).map((volume) => volume.id)
  );
  const currentChapters = data.chapters
    .filter((chapter) => currentVolumeIds.has(chapter.volumeId) && !chapter.archived)
    .sort((left, right) => left.sortOrder - right.sortOrder);

  return (
    currentChapters.find((chapter) => chapter.id === data.settings.activeChapterId) ??
    currentChapters[0] ??
    emptyChapter
  );
}

export function getActiveScene(data: StudioData) {
  const activeChapter = getActiveChapter(data);
  const chapterScenes = data.scenes
    .filter((scene) => scene.chapterId === activeChapter.id && !scene.archived)
    .sort((left, right) => left.sortOrder - right.sortOrder);

  return (
    chapterScenes.find((scene) => scene.id === data.settings.activeSceneId) ??
    chapterScenes[0] ??
    emptyScene
  );
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function characterName(id: string, data: StudioData) {
  return data.characters.find((character) => character.id === id)?.name ?? "Unknown";
}

export function placeName(id: string, data: StudioData) {
  return data.locations.find((place) => place.id === id)?.name ?? "Unknown place";
}

export function chapterTitle(id: string, data: StudioData) {
  return data.chapters.find((chapter) => chapter.id === id)?.title ?? "Unknown chapter";
}

export function volumeTitle(id: string, data: StudioData) {
  return data.volumes.find((volume) => volume.id === id)?.title ?? "Unknown volume";
}

export function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
