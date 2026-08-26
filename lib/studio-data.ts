import type {
  Character,
  Chapter,
  Location,
  Novel,
  Relationship,
  Scene,
  TimelineEvent,
  Volume,
  WritingActivity
} from "@/lib/studio-domain";

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
  locations: Location[];
  relationships: Relationship[];
  timelineEvents: TimelineEvent[];
  notes: import("@/lib/studio-domain").Note[];
  backups: StudioBackup[];
  writingActivities: WritingActivity[];
  settings: Record<string, string>;
  notionSyncStates: Array<{
    novelId: string;
    isDirty: boolean;
    revision: number;
    lastNotionSync: string | null;
  }>;
};

export type DataStatus = "loading" | "ready" | "fallback";

export type PersistedStudioSettings = {
  editorFontSize: string;
  readerFontSize: string;
  autosaveInterval: string;
  defaultFocusMode: string;
  defaultReadingMode: string;
  backupRetention: string;
  localServerDisplayName: string;
  exportDefaults: string;
  typewriterFont: boolean;
  notionRootPageId: string;
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
  locations: [],
  relationships: [],
  timelineEvents: [],
  notes: [],
  backups: [],
  writingActivities: [],
  settings: {},
  notionSyncStates: []
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
  summary: "",
  status: "Idea",
  locationId: "",
  sortOrder: 0,
  wordCount: 0,
  objective: "",
  archived: false
};

export const defaultPersistedStudioSettings: PersistedStudioSettings = {
  editorFontSize: "18 px",
  readerFontSize: "18 px",
  autosaveInterval: "30 seconds",
  defaultFocusMode: "Writing",
  defaultReadingMode: "Sepia",
  backupRetention: "30 daily backups",
  localServerDisplayName: "novel.local",
  exportDefaults: "EPUB, include cover and metadata",
  typewriterFont: true,
  notionRootPageId: "",
  notionAutosyncEnabled: false,
  notionAutosyncIntervalMinutes: "5",
  dailyWordGoal: "1500"
};

export function normalizeStudioData(payload: Partial<StudioData>): StudioData {
  return {
    novels: Array.isArray(payload.novels) ? payload.novels : emptyStudioData.novels,
    volumes: Array.isArray(payload.volumes) ? payload.volumes : emptyStudioData.volumes,
    chapters: Array.isArray(payload.chapters) ? payload.chapters : emptyStudioData.chapters,
    scenes: Array.isArray(payload.scenes) ? payload.scenes : emptyStudioData.scenes,
    characters: Array.isArray(payload.characters)
      ? payload.characters
      : emptyStudioData.characters,
    locations: Array.isArray(payload.locations) ? payload.locations : emptyStudioData.locations,
    relationships: Array.isArray(payload.relationships)
      ? payload.relationships
      : emptyStudioData.relationships,
    timelineEvents: Array.isArray(payload.timelineEvents)
      ? payload.timelineEvents
      : emptyStudioData.timelineEvents,
    notes: Array.isArray(payload.notes) ? payload.notes : emptyStudioData.notes,
    backups: Array.isArray(payload.backups) ? payload.backups : emptyStudioData.backups,
    writingActivities: Array.isArray(payload.writingActivities)
      ? payload.writingActivities
      : emptyStudioData.writingActivities,
    settings:
      payload.settings && typeof payload.settings === "object"
        ? payload.settings
        : emptyStudioData.settings,
    notionSyncStates: Array.isArray(payload.notionSyncStates)
      ? payload.notionSyncStates
      : emptyStudioData.notionSyncStates
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
    locations: data.locations.filter((location) => location.novelId === activeNovelId),
    relationships: data.relationships.filter(
      (relationship) => relationship.novelId === activeNovelId
    ),
    timelineEvents: data.timelineEvents.filter((event) => event.novelId === activeNovelId),
    notes: data.notes.filter((note) => note.novelId === activeNovelId),
    backups: data.backups,
    writingActivities: data.writingActivities.filter((activity) => activity.novelId === activeNovelId)
  };
}

export function getCurrentNovel(data: StudioData) {
  const activeNovelId = data.settings.activeNovelId;
  return data.novels.find((novel) => novel.id === activeNovelId) ?? data.novels[0] ?? emptyNovel;
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
