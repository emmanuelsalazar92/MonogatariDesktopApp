"use client";

import * as React from "react";
import Link from "next/link";
import { PlaceScenes } from "@/components/studio/place-scenes";
import { PlaceCharacters } from "@/components/studio/place-characters";
import { PlaceStoryEvents } from "@/components/studio/place-story-events";
import { PlaceCatalogEmptyState } from "@/components/studio/place-catalog-empty-state";
import { PlaceLifecycle } from "@/components/studio/place-lifecycle";
import { defaultPlaceCatalogState, filterAndSortPlaces, parsePlaceCatalogState, placeSortLabels, resolvePlaceSelection, routeForPlaceCatalog, serializePlaceCatalogState, type PlaceCatalogState, type PlaceSort } from "@/lib/place-catalog";
import { resolveTimelinePlaces } from "@/lib/timeline-place";
import { TimelineCatalogLoader } from "@/components/studio/timeline-catalog-loader";
import { TimelineEmptyState } from "@/components/studio/timeline-empty-state";
import { TimelineLifecycle } from "@/components/studio/timeline-lifecycle";
import { TimelineStoryLink } from "@/components/studio/timeline-story-link";
import { defaultTimelineCatalog, parseTimelineCatalog, normalizeTimelineCatalog, timelineCatalogQuery, timelineCatalogRoute, filterTimelineEvents, type TimelineCatalogState } from "@/lib/timeline-catalog";
import { TimelineEventDialog } from "@/components/studio/timeline-event-dialog";
import { NoteFormDialog } from "@/components/studio/note-form-dialog";
import { NoteCaptureContext, NoteUpdatesContext, AddStoryNoteButton } from "@/components/studio/note-capture";
import { SelectionCaptureMenu, type ManuscriptSelection } from "@/components/studio/selection-capture-menu";
import { CharacterHighlightPreview } from "@/components/studio/character-highlight-preview";
import { SceneAnnotations } from "@/components/studio/scene-annotations";
import { StoryNotes } from "@/components/studio/story-notes";
import { createNoteCapture, type NoteCaptureDraft, type NoteCaptureTarget } from "@/lib/note-capture";
import { NotesCatalog } from "@/components/studio/notes-catalog";
import { TimelinePositionEditor } from "@/components/studio/timeline-position-editor";
import { TimelineWindow } from "@/components/studio/timeline-window";
import { TimelineDetailPanel, TimelineFilters } from "@/components/studio/timeline-detail-panel";
import { TimelineDetailLoader } from "@/components/studio/timeline-detail-loader";
import { getPlaceHierarchy } from "@/lib/place-hierarchy";
import { placeTypeLabels, placeStatusLabels, placeStatuses } from "@/lib/place-classification";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArchiveRestore,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Circle,
  Download,
  Eye,
  FileArchive,
  History,
  Keyboard,
  ListTree,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  X
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  getReaderAdjacentUnits,
  getReaderScopeUnits,
  type ReaderOutline
} from "@/lib/reader-document";
import { clampReadingRatio, type ResolvedReadingProgress } from "@/lib/reader-progress";
import {
  defaultReaderPreferences,
  normalizeReaderFontSize,
  normalizeReaderWidth,
  parseReaderFontSize,
  parseReaderWidth,
  readerPreferenceRanges
} from "@/lib/reader-preferences";
import { CharactersScreen } from "@/components/studio/characters-screen";
import { CharacterFormDialog } from "@/components/studio/character-form-dialog";
import { PlaceFormDialog } from "@/components/studio/place-form-dialog";
import { PlaceDetailLoader } from "@/components/studio/place-detail-loader";
import { RelationshipFields, type RelationshipFormValues } from "@/components/studio/relationship-fields";
import { relationshipSinceOptions } from "@/lib/relationship-since";
import { RelationshipExplorer } from "@/components/studio/relationship-explorer";
import { RelationshipCatalogLoader } from "@/components/studio/relationship-loaders";
import { RelationshipLibrary } from "@/components/studio/relationship-library";
import { defaultRelationshipCatalog, parseRelationshipCatalog, serializeRelationshipCatalog, relationshipCatalogRoute, filterRelationships, relationshipCategories, type RelationshipCatalogState } from "@/lib/relationship-catalog";
import { visibleGraphCharacters } from "@/lib/relationship-graph";
import {
  characterSortOptions,
  defaultCharacterCatalogState,
  filterAndSortCharacters,
  parseCharacterCatalogState,
  serializeCharacterCatalogState,
  type CharacterCatalogState
} from "@/lib/character-catalog";
import {
  characterRoles as validCharacterRoles,
  characterStatuses as validCharacterStatuses
} from "@/lib/character-metadata";
import {
  relationshipDefinitions,
} from "@/lib/character-relationship";
import { DashboardScreen } from "@/components/studio/dashboard-screen";
import { LibraryScreen } from "@/components/studio/library-screen";
import { MobileNavDialog } from "@/components/studio/mobile-nav-dialog";
import {
  NotionConflictDialog,
  type NotionConflictChoice,
  type NotionConflictPreview
} from "@/components/studio/notion-conflict-dialog";
import { NovelOverviewScreen } from "@/components/studio/novel-overview-screen";
import { SettingsScreen } from "@/components/studio/settings-screen";
import { StructureScreen } from "@/components/studio/structure-screen";
import {
  EmptyState,
  FieldLine,
  MapIcon,
  ProgressBar,
  SectionHeader
} from "@/components/studio/shared";
import { Sidebar } from "@/components/studio/sidebar";
import { TopBar } from "@/components/studio/top-bar";
import {
  DataStatus,
  defaultPersistedStudioSettings,
  emptyStudioData,
  formatNumber,
  getActiveChapter,
  getActiveScene,
  getCurrentNovel,
  getScopedStudioData,
  normalizeStudioData,
  PersistedStudioSettings,
  StudioData
} from "@/lib/studio-data";
import {
  pageLabelsByLanguage,
  translateStudioText,
  type Language,
  uiCopy,
  useLiveLocalization
} from "@/lib/studio-i18n";
import {
  notionAutosyncIntervalMilliseconds,
  parseExportDefaults
} from "@/lib/studio-settings";
import {
  parseStudioRoute,
  routeForCharacter,
  routeForPage,
  routeForPlace
} from "@/lib/studio-routes";
import {
  defaultLibraryNavigationState,
  parseLibraryNavigationState,
  serializeLibraryNavigationState,
  type LibraryNavigationState
} from "@/lib/studio-library-navigation";
import {
  parseReaderNavigationState,
  serializeReaderNavigationState,
  type ReaderNavigationState
} from "@/lib/studio-reader-navigation";
import { cn } from "@/lib/utils";
import { statusAfterSaveConfirmation, type AutosaveStatus } from "@/lib/autosave-state";
import { getAdjacentSceneIds, getNovelSceneNavigation } from "@/lib/editor-scene-navigation";
import type { StructureSelection } from "@/lib/db/structure";
import {
  exportFormats,
  exportOptions,
  exportScopes,
  narrativeStatuses,
  placeTypes,
  type Character,
  type ChapterStatus,
  type FocusMode,
  type Location,
  type PlaceSummary,
  type Note,
  type Novel,
  type PageId,
  type Scene,
  type SidebarState,
} from "@/lib/studio-domain";

type SceneSaveInput = {
  title: string;
  content: string;
  status: ChapterStatus;
};

type SaveStatus = AutosaveStatus;
type SettingsSaveState = "idle" | "saving" | "saved" | "error";
type PendingSaveHandler = () => Promise<boolean>;
type NotionPublishState = "idle" | "publishing" | "success" | "error";
type NotionAutosyncStatus = "idle" | "syncing" | "synced" | "error" | "remote-changes";

type CreateNovelInput = {
  title: string;
  synopsis: string;
};

type CreateRelationshipInput = RelationshipFormValues;

type NovelMetricSummary = {
  volumeCount: number;
  chapterCount: number;
};

const StudioDataContext = React.createContext<StudioData>(emptyStudioData);

function useStudioData() {
  return React.useContext(StudioDataContext);
}

const chapterStatusOptions = narrativeStatuses;

const readerScopes = [
  "Read full novel",
  "Read selected volume",
  "Read selected chapter",
  "Read selected scene"
];

const characterRoles = ["All roles", ...validCharacterRoles];
const characterStatuses = ["All statuses", ...validCharacterStatuses];

type CharacterDeleteImpact = {
  linkedScenes: number;
  linkedPlaces: number;
  relationships: number;
};

function autosaveDelay(value: string) {
  if (value === "Manual only") return null;
  const seconds = Number.parseInt(value, 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

export default function PrivateNovelStudioPage() {
  return (
    <React.Suspense fallback={<main className="min-h-screen bg-background" />}>
      <PrivateNovelStudioContent />
    </React.Suspense>
  );
}

function PrivateNovelStudioContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeRoute = React.useMemo(() => parseStudioRoute(pathname), [pathname]);
  const activePage = activeRoute?.page ?? "dashboard";
  const [sidebarState, setSidebarState] = React.useState<SidebarState>("expanded");
  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false);
  const [language, setLanguage] = React.useState<Language>("en");
  const [focusMode, setFocusMode] = React.useState<FocusMode>("none");
  const [readerFocusOverlayOpen, setReaderFocusOverlayOpen] = React.useState(false);
  const [inspectorOpen, setInspectorOpen] = React.useState(true);
  const [dialog, setDialog] = React.useState<
    null | "novel" | "character" | "place" | "relationship" | "event" | "note" | "export" | "toc"
  >(null);
  const [editingCharacter, setEditingCharacter] = React.useState<Character | null>(null);
  const [editingPlace, setEditingPlace] = React.useState<Location | null>(null);
  const [editingNote, setEditingNote] = React.useState<Note | null>(null);
  const [noteCapture, setNoteCapture] = React.useState<NoteCaptureDraft | null>(null);
  const [noteCatalogVersion, setNoteCatalogVersion] = React.useState(0);
  const [noteTagOptions, setNoteTagOptions] = React.useState<{ novelId: string; tags: string[] }>({ novelId: "", tags: [] });
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("Saved locally");
  const [notionPublishState, setNotionPublishState] = React.useState<NotionPublishState>("idle");
  const [notionPublishMessage, setNotionPublishMessage] = React.useState("");
  const [notionPublishUrl, setNotionPublishUrl] = React.useState("");
  const [notionAutosyncStatus, setNotionAutosyncStatus] =
    React.useState<NotionAutosyncStatus>("idle");
  const [notionAutosyncRetryAt, setNotionAutosyncRetryAt] = React.useState(0);
  const [notionConflict, setNotionConflict] = React.useState<NotionConflictPreview | null>(null);
  const [resolvingNotionConflict, setResolvingNotionConflict] = React.useState(false);
  const [toast, setToast] = React.useState("");
  const [libraryQuery, setLibraryQuery] = React.useState("");
  const relationshipCatalog = React.useMemo(() => parseRelationshipCatalog(searchParams), [searchParams]);
  const [initialRelationshipType, setInitialRelationshipType] = React.useState("");
  const [readerFontSize, setReaderFontSize] = React.useState(defaultReaderPreferences.fontSize);
  const [readerWidth, setReaderWidth] = React.useState(defaultReaderPreferences.width);
  const [exportScope, setExportScope] = React.useState("Full novel");
  const [exportFormat, setExportFormat] = React.useState("EPUB");
  const [studioData, setStudioData] = React.useState<StudioData>(emptyStudioData);
  const [studioSettings, setStudioSettings] = React.useState<PersistedStudioSettings>(
    defaultPersistedStudioSettings
  );
  const [settingsSaveState, setSettingsSaveState] = React.useState<SettingsSaveState>("idle");
  const [settingsSaveMessage, setSettingsSaveMessage] = React.useState("");
  const [dataStatus, setDataStatus] = React.useState<DataStatus>("loading");
  const [creatingBackup, setCreatingBackup] = React.useState(false);
  const [enabledExportOptions, setEnabledExportOptions] = React.useState(
    new Set(["Include cover", "Include table of contents", "Include metadata"])
  );
  const routeContextData = React.useMemo(() => {
    const routeNovelId = activeRoute?.novelId;
    if (!routeNovelId || !studioData.novels.some((novel) => novel.id === routeNovelId)) {
      return studioData;
    }

    const routeSceneId = activeRoute?.sceneId;
    const routeScene = routeSceneId
      ? studioData.scenes.find((scene) => scene.id === routeSceneId)
      : undefined;
    const routeChapter = routeScene
      ? studioData.chapters.find((chapter) => chapter.id === routeScene.chapterId)
      : undefined;
    const routeVolume = routeChapter
      ? studioData.volumes.find((volume) => volume.id === routeChapter.volumeId)
      : undefined;
    const routeSceneBelongsToNovel = routeVolume?.novelId === routeNovelId;

    return {
      ...studioData,
      settings: {
        ...studioData.settings,
        activeNovelId: routeNovelId,
        ...(routeSceneBelongsToNovel && routeScene && routeChapter
          ? {
              activeStructureType: "scene" as const,
              activeStructureId: routeScene.id,
              activeChapterId: routeChapter.id,
              activeSceneId: routeScene.id
            }
          : {})
      }
    };
  }, [activeRoute?.novelId, activeRoute?.sceneId, studioData]);
  const scopedStudioData = React.useMemo(
    () => getScopedStudioData(routeContextData),
    [routeContextData]
  );
  const currentNovel = getCurrentNovel(routeContextData);
  const noteOptions = React.useMemo(() => [
    ...relationshipSinceOptions(currentNovel.id, scopedStudioData.volumes, scopedStudioData.chapters, scopedStudioData.scenes).map(option => ({ type: ({ volume: "Volume", chapter: "Chapter", scene: "Scene" } as const)[option.kind], id: option.id, title: option.label, archived: option.archived, novelId: currentNovel.id })),
    ...scopedStudioData.characters.map(character => ({ type: "Character" as const, id: character.id, title: character.name, novelId: character.novelId, archived: Boolean(character.archivedAt) })),
    ...scopedStudioData.locations.map(place => ({ type: "Place" as const, id: place.id, title: place.name, novelId: place.novelId, archived: place.status === "archived" })),
    ...scopedStudioData.timelineEvents.map(event => ({ type: "TimelineEvent" as const, id: event.id, title: event.title, novelId: event.novelId }))
  ], [currentNovel.id, scopedStudioData]);
  const noteTagsLoaded = React.useCallback((tags: string[]) => setNoteTagOptions({ novelId: currentNovel.id, tags }), [currentNovel.id]);
  const readerFallbackChapter = getActiveChapter(scopedStudioData);
  const readerFallbackNavigation = React.useMemo<ReaderNavigationState>(
    () => readerFallbackChapter.id
      ? { scope: "chapter", targetId: readerFallbackChapter.id }
      : { scope: "novel", targetId: currentNovel.id },
    [currentNovel.id, readerFallbackChapter.id]
  );
  const readerNavigation = React.useMemo(
    () =>
      parseReaderNavigationState(
        searchParams,
        currentNovel.id,
        readerFallbackNavigation,
        scopedStudioData.volumes,
        scopedStudioData.chapters,
        scopedStudioData.scenes
      ),
    [
      currentNovel.id,
      readerFallbackNavigation,
      scopedStudioData.chapters,
      scopedStudioData.scenes,
      scopedStudioData.volumes,
      searchParams
    ]
  );
  const currentNotionSyncState = studioData.notionSyncStates.find(
    (state) => state.novelId === currentNovel.id
  );
  const libraryNavigationState = React.useMemo(
    () => parseLibraryNavigationState(searchParams),
    [searchParams]
  );
  const characterCatalogState = React.useMemo(
    () => parseCharacterCatalogState(searchParams),
    [searchParams]
  );
  const placeCatalogState = React.useMemo(() => parsePlaceCatalogState(searchParams), [searchParams]);
  const pendingSaveHandlerRef = React.useRef<PendingSaveHandler | null>(null);
  const readerFocusToggleHandlerRef = React.useRef<(() => void) | null>(null);
  const editorDirtyRef = React.useRef(false);
  const saveInFlightRef = React.useRef<Promise<boolean> | null>(null);
  const autosyncInFlightRef = React.useRef(false);
  const autosyncRetryAtRef = React.useRef(0);
  const autosyncFailureCountRef = React.useRef(0);
  const autosyncStatusTimerRef = React.useRef<number | null>(null);
  const exportDefaultsAppliedRef = React.useRef(false);
  const settingsSaveInFlightRef = React.useRef(false);
  const readerSettingsSaveInFlightRef = React.useRef(false);
  const pendingReaderSettingsRef = React.useRef<Record<string, string>>({});
  const readerSettingsTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const staleRouteRecoveryRef = React.useRef<string | null>(null);
  const translate = React.useCallback(
    (value: string) => translateStudioText(value, language),
    [language]
  );

  useLiveLocalization(language);

  const updateLibraryNavigation = React.useCallback(
    (changes: Partial<LibraryNavigationState>) => {
      const nextState = { ...libraryNavigationState, ...changes };
      const query = serializeLibraryNavigationState(nextState).toString();
      router.push(query ? `/library?${query}` : "/library");
    },
    [libraryNavigationState, router]
  );

  const updateCharacterCatalog = React.useCallback(
    (changes: Partial<CharacterCatalogState>) => {
      const nextState = { ...characterCatalogState, ...changes };
      const query = serializeCharacterCatalogState(nextState).toString();
      const charactersRoute = routeForCharacter(
        currentNovel.id,
        activeRoute?.page === "characters" ? activeRoute.characterId : undefined
      );
      router.replace(query ? `${charactersRoute}?${query}` : charactersRoute);
    },
    [activeRoute?.characterId, activeRoute?.page, characterCatalogState, currentNovel.id, router]
  );

  const updatePlaceCatalog = React.useCallback((changes: Partial<PlaceCatalogState>) => {
    router.replace(routeForPlaceCatalog(currentNovel.id, { ...placeCatalogState, ...changes }, activeRoute?.placeId), { scroll: false });
  }, [activeRoute?.placeId, currentNovel.id, placeCatalogState, router]);

  const updateRelationshipCatalog = React.useCallback((changes: Partial<RelationshipCatalogState>) => {
    router.replace(relationshipCatalogRoute(currentNovel.id, { ...relationshipCatalog, ...changes }), { scroll: false });
  }, [currentNovel.id, relationshipCatalog, router]);
  React.useEffect(() => {
    if (activePage === "relationships" && searchParams.toString() !== serializeRelationshipCatalog(relationshipCatalog).toString()) {
      router.replace(relationshipCatalogRoute(currentNovel.id, relationshipCatalog), { scroll: false });
    }
  }, [activePage, currentNovel.id, relationshipCatalog, router, searchParams]);

  const showToast = React.useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }, []);

  const refreshStudioData = React.useCallback(async (useFallbackOnError = true) => {
    try {
      if (useFallbackOnError) {
        setDataStatus("loading");
      }

      const response = await fetch("/api/studio", { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`Studio API returned ${response.status}`);
      }

      const payload = (await response.json()) as Partial<StudioData>;
      setStudioData(normalizeStudioData(payload));
      setDataStatus("ready");
      return true;
    } catch {
      setDataStatus("fallback");
      return false;
    }
  }, []);

  React.useEffect(() => {
    if (dataStatus !== "ready") {
      return;
    }

    const nextSettings = studioData.studioSettings;

    setStudioSettings(nextSettings);

    if (nextSettings.language === "en" || nextSettings.language === "es") {
      setLanguage(nextSettings.language);
    }

    if (
      nextSettings.sidebarState === "expanded" ||
      nextSettings.sidebarState === "compact" ||
      nextSettings.sidebarState === "hidden"
    ) {
      setSidebarState(nextSettings.sidebarState);
    }

    setInspectorOpen(nextSettings.editorInspectorOpen);

    setReaderFontSize(parseReaderFontSize(nextSettings.readerFontSize));
    setReaderWidth(parseReaderWidth(nextSettings.readerWidth));
  }, [dataStatus, studioData.studioSettings]);

  React.useEffect(() => {
    void refreshStudioData();
  }, [refreshStudioData]);

  React.useEffect(() => {
    const routeNovelId = activeRoute?.novelId;
    if (!routeNovelId || dataStatus !== "ready") {
      staleRouteRecoveryRef.current = null;
      return;
    }

    if (studioData.novels.some((novel) => novel.id === routeNovelId)) {
      staleRouteRecoveryRef.current = null;
      return;
    }

    if (staleRouteRecoveryRef.current === pathname) return;
    staleRouteRecoveryRef.current = pathname;
    showToast("This novel is no longer available. Returned to Library.");
    router.replace("/library");
  }, [activeRoute?.novelId, dataStatus, pathname, router, showToast, studioData.novels]);

  React.useEffect(() => {
    if (
      activePage !== "reader" ||
      dataStatus !== "ready" ||
      !currentNovel.id ||
      !readerNavigation.targetId
    ) {
      return;
    }

    const canonicalQuery = serializeReaderNavigationState(readerNavigation).toString();
    if (searchParams.toString() === canonicalQuery) return;
    router.replace(`${routeForPage("reader", currentNovel.id)}?${canonicalQuery}`);
  }, [activePage, currentNovel.id, dataStatus, readerNavigation, router, searchParams]);

  React.useEffect(() => {
    if (activePage !== "characters" || !currentNovel.id) return;
    const canonicalQuery = serializeCharacterCatalogState(characterCatalogState).toString();
    if (searchParams.toString() === canonicalQuery) return;
    const charactersRoute = routeForCharacter(currentNovel.id, activeRoute?.characterId);
    router.replace(canonicalQuery ? `${charactersRoute}?${canonicalQuery}` : charactersRoute);
  }, [activePage, activeRoute?.characterId, characterCatalogState, currentNovel.id, router, searchParams]);

  React.useEffect(() => {
    if (activePage !== "places" || !currentNovel.id) return;
    if (searchParams.toString() === serializePlaceCatalogState(placeCatalogState).toString()) return;
    router.replace(routeForPlaceCatalog(currentNovel.id, placeCatalogState, activeRoute?.placeId), { scroll: false });
  }, [activePage, activeRoute?.placeId, currentNovel.id, placeCatalogState, router, searchParams]);

  React.useEffect(() => {
    const desktopMedia = window.matchMedia(
      activePage === "reader" ? "(min-width: 1024px)" : "(min-width: 768px)"
    );
    const closeDrawerOnDesktop = () => {
      if (desktopMedia.matches) setMobileDrawerOpen(false);
    };

    closeDrawerOnDesktop();
    desktopMedia.addEventListener("change", closeDrawerOnDesktop);
    return () => desktopMedia.removeEventListener("change", closeDrawerOnDesktop);
  }, [activePage]);

  React.useEffect(() => {
    if (activePage !== "export") {
      exportDefaultsAppliedRef.current = false;
      return;
    }
    if (dataStatus !== "ready" || exportDefaultsAppliedRef.current) return;

    const defaults = parseExportDefaults(studioSettings.exportDefaults);
    setExportFormat(defaults.format);
    setEnabledExportOptions(new Set(defaults.options));
    exportDefaultsAppliedRef.current = true;
  }, [activePage, dataStatus, studioSettings.exportDefaults]);

  const registerPendingSave = React.useCallback((handler: PendingSaveHandler | null) => {
    pendingSaveHandlerRef.current = handler;
  }, []);

  const registerReaderFocusToggle = React.useCallback((handler: (() => void) | null) => {
    readerFocusToggleHandlerRef.current = handler;
  }, []);

  const setEditorDirty = React.useCallback((dirty: boolean) => {
    editorDirtyRef.current = dirty;
  }, []);

  const flushPendingChanges = React.useCallback(async function flushPendingChanges() {
    if (!editorDirtyRef.current || !pendingSaveHandlerRef.current) {
      return true;
    }

    if (saveInFlightRef.current) {
      const inFlightSucceeded = await saveInFlightRef.current;
      if (!inFlightSucceeded) return false;
      return flushPendingChanges();
    }

    const saveUntilClean = async () => {
      while (editorDirtyRef.current && pendingSaveHandlerRef.current) {
        const succeeded = await pendingSaveHandlerRef.current();
        if (!succeeded) return false;
      }
      return true;
    };

    const request = saveUntilClean();
    saveInFlightRef.current = request;
    try {
      return await request;
    } finally {
      if (saveInFlightRef.current === request) saveInFlightRef.current = null;
    }
  }, []);

  const changeFocusMode = React.useCallback(
    async (nextMode: FocusMode) => {
      if (!(await flushPendingChanges())) {
        showToast("Save failed. Navigation was cancelled to protect your draft.");
        return;
      }
      setFocusMode(nextMode);
    },
    [flushPendingChanges, showToast]
  );

  const persistSettings = React.useCallback(
    async (nextSettings: Record<string, string>) => {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextSettings),
        keepalive: true
      });

      if (!response.ok) {
        throw new Error("Settings could not be saved.");
      }

      return (await response.json()) as PersistedStudioSettings;
    },
    []
  );

  const flushReaderSettings = React.useCallback(
    async function flushReaderSettings() {
      if (readerSettingsTimerRef.current) {
        clearTimeout(readerSettingsTimerRef.current);
        readerSettingsTimerRef.current = null;
      }
      if (readerSettingsSaveInFlightRef.current) return;

      const changes = pendingReaderSettingsRef.current;
      if (Object.keys(changes).length === 0) return;
      pendingReaderSettingsRef.current = {};
      readerSettingsSaveInFlightRef.current = true;
      setSettingsSaveState("saving");
      setSettingsSaveMessage("Saving reading preferences…");

      try {
        const savedSettings = await persistSettings(changes);
        setStudioSettings({ ...savedSettings, ...pendingReaderSettingsRef.current });
        setSettingsSaveState("saved");
        setSettingsSaveMessage("Reading preferences saved.");
      } catch {
        setSettingsSaveState("error");
        setSettingsSaveMessage("Reading preferences could not be saved and were restored.");
        void refreshStudioData(false);
      } finally {
        readerSettingsSaveInFlightRef.current = false;
        if (Object.keys(pendingReaderSettingsRef.current).length > 0) {
          readerSettingsTimerRef.current = setTimeout(() => void flushReaderSettings(), 0);
        }
      }
    },
    [persistSettings, refreshStudioData]
  );

  const updateReaderPreferences = React.useCallback(
    (changes: Partial<{ fontSize: number; width: number }>) => {
      const settingsChanges: Record<string, string> = {};

      if (changes.fontSize !== undefined) {
        const normalized = normalizeReaderFontSize(changes.fontSize);
        if (normalized) {
          setReaderFontSize(Number.parseInt(normalized, 10));
          settingsChanges.readerFontSize = normalized;
        }
      }

      if (changes.width !== undefined) {
        const normalized = normalizeReaderWidth(changes.width);
        if (normalized) {
          setReaderWidth(Number.parseInt(normalized, 10));
          settingsChanges.readerWidth = normalized;
        }
      }

      if (Object.keys(settingsChanges).length === 0) return;
      setStudioSettings((current) => ({ ...current, ...settingsChanges }));
      pendingReaderSettingsRef.current = {
        ...pendingReaderSettingsRef.current,
        ...settingsChanges
      };
      if (readerSettingsTimerRef.current) clearTimeout(readerSettingsTimerRef.current);
      readerSettingsTimerRef.current = setTimeout(() => void flushReaderSettings(), 300);
    },
    [flushReaderSettings]
  );

  React.useEffect(() => {
    const persistPendingReaderSettings = () => {
      const pending = pendingReaderSettingsRef.current;
      if (Object.keys(pending).length === 0) return;
      void fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending),
        keepalive: true
      });
    };

    window.addEventListener("pagehide", persistPendingReaderSettings);
    return () => {
      window.removeEventListener("pagehide", persistPendingReaderSettings);
      if (readerSettingsTimerRef.current) clearTimeout(readerSettingsTimerRef.current);
      persistPendingReaderSettings();
    };
  }, []);

  const saveSettings = React.useCallback(
    async (nextSettings: Record<string, string>, afterSave?: () => void) => {
      if (settingsSaveInFlightRef.current) return;

      settingsSaveInFlightRef.current = true;
      setSettingsSaveState("saving");
      setSettingsSaveMessage("Saving settings…");
      try {
        const savedSettings = await persistSettings(nextSettings);
        setStudioSettings(savedSettings);
        afterSave?.();
        setSettingsSaveState("saved");
        setSettingsSaveMessage("Settings saved.");
      } catch {
        setSettingsSaveState("error");
        setSettingsSaveMessage(
          "Settings could not be saved. Your previous configuration is still active."
        );
      } finally {
        settingsSaveInFlightRef.current = false;
      }
    },
    [persistSettings]
  );

  const updateLanguage = React.useCallback(
    (value: Language) => {
      void saveSettings({ language: value }, () => setLanguage(value));
    },
    [saveSettings]
  );

  const updateSidebarState = React.useCallback(
    (value: SidebarState) => {
      void saveSettings({ sidebarState: value }, () => setSidebarState(value));
    },
    [saveSettings]
  );

  const updateInspectorOpen = React.useCallback(
    (open: boolean) => {
      void saveSettings({ editorInspectorOpen: String(open) }, () => setInspectorOpen(open));
    },
    [saveSettings]
  );

  const cycleSidebar = React.useCallback(() => {
    const nextState =
      sidebarState === "expanded"
        ? "compact"
        : sidebarState === "compact"
          ? "hidden"
          : "expanded";
    updateSidebarState(nextState);
  }, [sidebarState, updateSidebarState]);

  const updateStudioSetting = React.useCallback(
    (key: keyof PersistedStudioSettings, value: string | boolean) => {
      if (key === "readerFontSize") {
        updateReaderPreferences({ fontSize: Number.parseInt(String(value), 10) });
        return;
      }
      if (key === "readerWidth") {
        updateReaderPreferences({ width: Number.parseInt(String(value), 10) });
        return;
      }
      void saveSettings({ [key]: String(value) });
    },
    [saveSettings, updateReaderPreferences]
  );

  const applyVerifiedNotionConnection = React.useCallback((pageId: string, pageTitle: string) => {
    setStudioSettings((current) => ({
      ...current,
      notionRootPageId: pageId,
      notionRootPageTitle: pageTitle
    }));
  }, []);

  const setActiveNovel = React.useCallback(
    async (novelId: string, nextPage?: PageId) => {
      if (!(await flushPendingChanges())) {
        showToast("Save failed. The current novel was not changed.");
        return;
      }
      setStudioData((current) => ({
        ...current,
        settings: { ...current.settings, activeNovelId: novelId }
      }));
      if (nextPage) {
        router.push(routeForPage(nextPage, novelId));
      }
      setMobileDrawerOpen(false);
      setFocusMode("none");
      void fetch("/api/selection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeNovelId: novelId })
      }).catch(() =>
        showToast("Could not save active novel")
      );
    },
    [flushPendingChanges, router, showToast]
  );

  const setActiveStructureItem = React.useCallback(
    async (selection: StructureSelection) => {
      if (!(await flushPendingChanges())) {
        showToast("Save failed. The current scene was not changed.");
        return false;
      }
      let activeChapterId: string | undefined;
      let activeSceneId: string | undefined;

      if (selection.type === "scene") {
        const scene = scopedStudioData.scenes.find((item) => item.id === selection.id);
        activeSceneId = scene?.id;
        activeChapterId = scene?.chapterId;
      } else if (selection.type === "chapter") {
        activeChapterId = selection.id;
        activeSceneId = scopedStudioData.scenes
          .filter((scene) => scene.chapterId === selection.id && !scene.archived)
          .sort((left, right) => left.sortOrder - right.sortOrder)[0]?.id;
      } else {
        activeChapterId = scopedStudioData.chapters
          .filter((chapter) => chapter.volumeId === selection.id && !chapter.archived)
          .sort((left, right) => left.sortOrder - right.sortOrder)[0]?.id;
        activeSceneId = activeChapterId
          ? scopedStudioData.scenes
              .filter((scene) => scene.chapterId === activeChapterId && !scene.archived)
              .sort((left, right) => left.sortOrder - right.sortOrder)[0]?.id
          : undefined;
      }

      const nextSettings = {
        activeStructureType: selection.type,
        activeStructureId: selection.id,
        ...(activeChapterId ? { activeChapterId } : {}),
        ...(activeSceneId ? { activeSceneId } : {})
      };

      setStudioData((current) => ({
        ...current,
        settings: { ...current.settings, ...nextSettings }
      }));

      void fetch("/api/selection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextSettings)
      }).then((response) => {
        if (!response.ok) showToast("Could not save the current structure selection");
      }).catch(() => showToast("Could not save the current structure selection"));

      return true;
    },
    [flushPendingChanges, scopedStudioData.chapters, scopedStudioData.scenes, showToast]
  );

  const openSceneInEditor = React.useCallback(
    async (sceneId: string) => {
      const scene = scopedStudioData.scenes.find((item) => item.id === sceneId);
      if (!scene) return;
      if (!(await setActiveStructureItem({ type: "scene", id: scene.id }))) return;
      try {
        const response = await fetch(`/api/scenes/${encodeURIComponent(scene.id)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load scene content");
        const loadedScene = (await response.json()) as Scene;
        setStudioData((current) => ({
          ...current,
          scenes: current.scenes.map((item) => item.id === loadedScene.id ? loadedScene : item)
        }));
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Could not load scene content");
        return;
      }
      router.push(routeForPage("editor", currentNovel.id, scene.id));
    },
    [currentNovel.id, router, scopedStudioData.scenes, setActiveStructureItem, showToast]
  );

  const saveScene = React.useCallback(
    async (sceneId: string, input: SceneSaveInput, expectedRevision: number): Promise<Scene | null> => {
      if (!sceneId) return null;
      setSaveStatus("Saving…");

      try {
        const response = await fetch(`/api/scenes/${encodeURIComponent(sceneId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, expectedRevision })
        });

        if (!response.ok) {
          const details = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(details?.error ?? `Scene save failed with ${response.status}`);
        }

        const savedScene = (await response.json()) as Scene;
        setStudioData((current) => {
          const scenes = current.scenes.map((scene) =>
            scene.id === savedScene.id ? savedScene : scene
          );
          const chapterWordCount = scenes
            .filter((scene) => scene.chapterId === savedScene.chapterId)
            .reduce((sum, scene) => sum + scene.wordCount, 0);
          const chapters = current.chapters.map((chapter) =>
            chapter.id === savedScene.chapterId
              ? { ...chapter, wordCount: chapterWordCount }
              : chapter
          );
          const volumeId = chapters.find((chapter) => chapter.id === savedScene.chapterId)?.volumeId;
          const novelId = current.volumes.find((volume) => volume.id === volumeId)?.novelId;
          const novelVolumeIds = new Set(
            current.volumes.filter((volume) => volume.novelId === novelId).map((volume) => volume.id)
          );
          const novelWordCount = chapters
            .filter((chapter) => novelVolumeIds.has(chapter.volumeId))
            .reduce((sum, chapter) => sum + chapter.wordCount, 0);

          return {
            ...current,
            scenes,
            chapters,
            novels: current.novels.map((novel) =>
              novel.id === novelId ? { ...novel, wordCount: novelWordCount } : novel
            )
          };
        });
        await refreshStudioData(false);
        showToast("Scene saved to SQLite");
        return savedScene;
      } catch {
        setSaveStatus("Save failed — Retry");
        showToast("Could not save scene");
        return null;
      }
    },
    [refreshStudioData, showToast]
  );

  const publishCurrentNovelToNotion = React.useCallback(async (force = true) => {
    if (!currentNovel.id) return;

    setNotionPublishState("publishing");
    setNotionPublishMessage("");
    setNotionPublishUrl("");

    try {
      const response = await fetch("/api/integrations/notion/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ novelId: currentNovel.id, force })
      });
      const result = (await response.json()) as {
        ok?: boolean;
        code?: string;
        message?: string;
        novelPage?: { url?: string };
        createdPages?: number;
        updatedPages?: number;
        skipped?: boolean;
      };

      if (!response.ok || !result.ok) {
        if (result.code === "REMOTE_CHANGES_DETECTED") {
          setNotionAutosyncStatus("remote-changes");
        }
        throw new Error(result.message ?? "Could not sync this novel to Notion.");
      }

      setNotionPublishState("success");
      setNotionAutosyncStatus("synced");
      autosyncRetryAtRef.current = 0;
      autosyncFailureCountRef.current = 0;
      setNotionAutosyncRetryAt(0);
      setNotionPublishMessage(result.message ?? "Notion sync completed.");
      setNotionPublishUrl(result.novelPage?.url ?? "");
      await refreshStudioData(false);
      showToast(result.skipped ? "Notion is already up to date" : "Notion sync completed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not sync this novel to Notion.";
      setNotionPublishState("error");
      setNotionPublishMessage(message);
      showToast(message);
    }
  }, [currentNovel.id, refreshStudioData, showToast]);

  const runAutomaticNotionSync = React.useCallback(async () => {
    if (
      !currentNovel.id ||
      !currentNotionSyncState?.isDirty ||
      !studioSettings.notionRootPageId ||
      autosyncInFlightRef.current ||
      Date.now() < autosyncRetryAtRef.current ||
      notionAutosyncStatus === "remote-changes"
    ) {
      return;
    }

    autosyncInFlightRef.current = true;
    setNotionAutosyncStatus("syncing");
    try {
      const response = await fetch("/api/integrations/notion/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ novelId: currentNovel.id, force: false })
      });
      const result = (await response.json()) as { ok?: boolean; code?: string; message?: string };

      if (!response.ok || !result.ok) {
        if (result.code === "REMOTE_CHANGES_DETECTED") {
          setNotionAutosyncStatus("remote-changes");
          autosyncRetryAtRef.current = Number.POSITIVE_INFINITY;
          setNotionAutosyncRetryAt(Number.POSITIVE_INFINITY);
          return;
        }
        throw new Error(result.message ?? "Could not sync this novel to Notion.");
      }

      autosyncRetryAtRef.current = 0;
      autosyncFailureCountRef.current = 0;
      setNotionAutosyncRetryAt(0);
      setNotionAutosyncStatus("synced");
      await refreshStudioData(false);
      if (autosyncStatusTimerRef.current) window.clearTimeout(autosyncStatusTimerRef.current);
      autosyncStatusTimerRef.current = window.setTimeout(() => {
        setNotionAutosyncStatus("idle");
      }, 3_000);
    } catch {
      const intervalMs = notionAutosyncIntervalMilliseconds(studioSettings.notionAutosyncIntervalMinutes) ?? 300_000;
      autosyncFailureCountRef.current = Math.min(autosyncFailureCountRef.current + 1, 5);
      const retryDelay = Math.min(
        intervalMs * 2 ** autosyncFailureCountRef.current,
        30 * 60_000
      );
      autosyncRetryAtRef.current = Date.now() + retryDelay;
      setNotionAutosyncRetryAt(autosyncRetryAtRef.current);
      setNotionAutosyncStatus("error");
    } finally {
      autosyncInFlightRef.current = false;
    }
  }, [
    currentNovel.id,
    currentNotionSyncState?.isDirty,
    notionAutosyncStatus,
    refreshStudioData,
    studioSettings.notionAutosyncIntervalMinutes,
    studioSettings.notionRootPageId
  ]);

  React.useEffect(() => {
    if (!studioSettings.notionAutosyncEnabled || !currentNovel.id || !studioSettings.notionRootPageId) {
      return;
    }

    const intervalMs = notionAutosyncIntervalMilliseconds(studioSettings.notionAutosyncIntervalMinutes);
    if (intervalMs === null) return;
    let timer: number | null = null;
    let cancelled = false;

    const schedule = (delay: number) => {
      timer = window.setTimeout(async () => {
        await runAutomaticNotionSync();
        if (!cancelled) schedule(intervalMs);
      }, delay);
    };
    schedule(intervalMs);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [
    currentNovel.id,
    runAutomaticNotionSync,
    studioSettings.notionAutosyncEnabled,
    studioSettings.notionAutosyncIntervalMinutes,
    studioSettings.notionRootPageId
  ]);

  React.useEffect(
    () => () => {
      if (autosyncStatusTimerRef.current) window.clearTimeout(autosyncStatusTimerRef.current);
    },
    []
  );

  const pullCurrentNovelFromNotion = React.useCallback(async () => {
    if (!currentNovel.id) return;

    setNotionPublishState("publishing");
    setNotionPublishMessage("");
    setNotionPublishUrl("");

    try {
      const response = await fetch("/api/integrations/notion/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ novelId: currentNovel.id })
      });
      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
        appliedChapters?: number;
        conflicts?: Array<Partial<NotionConflictPreview> & { message?: string }>;
      };

      if (!response.ok || !result.ok) {
        const conflict = result.conflicts?.find(
          (item) => typeof item.chapterId === "string" && typeof item.localContent === "string" && typeof item.remoteContent === "string"
        );
        if (conflict) {
          setNotionConflict({
            chapterId: conflict.chapterId!,
            chapterTitle: conflict.chapterTitle ?? "Notion chapter",
            localContent: conflict.localContent!,
            remoteContent: conflict.remoteContent!
          });
        }
        const conflictDetails = result.conflicts?.map((conflict) => conflict.message).join(" ");
        throw new Error(conflictDetails || result.message || "Could not update this novel from Notion.");
      }

      setNotionPublishState("success");
      setNotionAutosyncStatus("idle");
      autosyncRetryAtRef.current = 0;
      autosyncFailureCountRef.current = 0;
      setNotionAutosyncRetryAt(0);
      setNotionPublishMessage(result.message ?? "Notion updates were applied locally.");
      await refreshStudioData(false);
      showToast(
        result.appliedChapters ? `Updated ${result.appliedChapters} chapter(s) from Notion` : "Notion is already up to date"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update this novel from Notion.";
      setNotionPublishState("error");
      setNotionPublishMessage(message);
      showToast(message);
    }
  }, [currentNovel.id, refreshStudioData, showToast]);

  const resolveCurrentNotionConflict = React.useCallback(
    async (resolution: NotionConflictChoice) => {
      if (!notionConflict || !currentNovel.id || resolvingNotionConflict) return;

      setResolvingNotionConflict(true);
      try {
        const response = await fetch("/api/integrations/notion/conflicts/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            novelId: currentNovel.id,
            chapterId: notionConflict.chapterId,
            resolution
          })
        });
        const result = (await response.json()) as { ok?: boolean; message?: string };
        if (!response.ok || !result.ok) {
          throw new Error(result.message ?? "Could not resolve this Notion conflict.");
        }

        setNotionConflict(null);
        setNotionAutosyncStatus("idle");
        setNotionPublishState("success");
        setNotionPublishMessage(result.message ?? "Notion conflict resolved.");
        await refreshStudioData(false);
        showToast(result.message ?? "Notion conflict resolved.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not resolve this Notion conflict.";
        setNotionPublishState("error");
        setNotionPublishMessage(message);
        showToast(message);
      } finally {
        setResolvingNotionConflict(false);
      }
    },
    [currentNovel.id, notionConflict, refreshStudioData, resolvingNotionConflict, showToast]
  );

  const createNovelFromDialog = React.useCallback(
    async (input: CreateNovelInput) => {
      const response = await fetch("/api/novels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: input.title,
          synopsis: input.synopsis,
          status: "Planning"
        })
      });

      if (!response.ok) {
        const details = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(details?.error ?? `Novel creation failed with ${response.status}`);
      }

      const createdNovel = (await response.json()) as Novel;
      await refreshStudioData(false);
      await setActiveNovel(createdNovel.id, "overview");
      showToast("Novel created in SQLite");
    },
    [refreshStudioData, setActiveNovel, showToast]
  );

  const createRelationshipFromDialog = React.useCallback(
    async (input: CreateRelationshipInput) => {
      const response = await fetch("/api/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          novelId: currentNovel.id,
          ...input
        })
      });

      if (!response.ok) {
        const details = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(details?.error ?? `Relationship creation failed with ${response.status}`);
      }

      await refreshStudioData(false);
      router.push(relationshipCatalogRoute(currentNovel.id, relationshipCatalog));
      showToast("Relationship saved to SQLite");
    },
    [currentNovel.id, refreshStudioData, relationshipCatalog, router, showToast]
  );

  const archiveCharacter = React.useCallback(async (character: Character) => {
    const response = await fetch(
      `/api/characters/${encodeURIComponent(character.id)}/archive`,
      { method: "POST" }
    );
    if (!response.ok) {
      const details = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(details?.error ?? "Could not archive character");
    }
    await refreshStudioData(false);
    showToast("Character archived; story links were preserved");
  }, [refreshStudioData, showToast]);

  const restoreCharacter = React.useCallback(async (character: Character) => {
    const response = await fetch(
      `/api/characters/${encodeURIComponent(character.id)}/restore`,
      { method: "POST" }
    );
    if (!response.ok) {
      const details = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(details?.error ?? "Could not restore character");
    }
    await refreshStudioData(false);
    updateCharacterCatalog({ status: "All statuses", showArchived: false });
    showToast("Character restored");
  }, [refreshStudioData, showToast, updateCharacterCatalog]);

  const permanentlyDeleteCharacter = React.useCallback(async (
    character: Character,
    impact: CharacterDeleteImpact
  ) => {
    const response = await fetch(`/api/characters/${encodeURIComponent(character.id)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: true, impact })
    });
    if (!response.ok) {
      const details = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(details?.error ?? "Could not delete character");
    }
    await refreshStudioData(false);
    showToast("Character permanently deleted");
  }, [refreshStudioData, showToast]);

  const timelineEventSaved = React.useCallback(
    async () => {
      if (!await refreshStudioData(false)) throw new Error("Event saved. Could not refresh; please retry.");
      router.push(routeForPage("timeline", currentNovel.id));
      showToast("Timeline event saved to SQLite");
    },
    [currentNovel.id, refreshStudioData, router, showToast]
  );

  const createBackup = React.useCallback(async () => {
    setCreatingBackup(true);

    try {
      const response = await fetch("/api/backups", { method: "POST" });

      if (!response.ok) {
        const details = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(details?.error ?? `Backup creation failed with ${response.status}`);
      }

      await refreshStudioData(false);
      showToast("SQLite snapshot created");
    } catch {
      showToast("Could not create backup");
    } finally {
      setCreatingBackup(false);
    }
  }, [refreshStudioData, showToast]);

  React.useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!editorDirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") void flushPendingChanges();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [flushPendingChanges]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void flushPendingChanges();
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "\\") {
        event.preventDefault();
        cycleSidebar();
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        if (activePage === "reader" && readerFocusToggleHandlerRef.current) {
          readerFocusToggleHandlerRef.current();
        } else {
          void changeFocusMode("writing");
        }
      }

      if (event.key === "Escape") {
        if (event.defaultPrevented || document.querySelector('[role="dialog"]')) return;
        if (readerFocusOverlayOpen) return;
        if (focusMode === "reading" && readerFocusToggleHandlerRef.current) {
          readerFocusToggleHandlerRef.current();
        } else if (focusMode !== "none") {
          void changeFocusMode("none");
        }
        setMobileDrawerOpen(false);
        setDialog(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePage, changeFocusMode, cycleSidebar, flushPendingChanges, focusMode, readerFocusOverlayOpen]);

  const novels = studioData.novels;
  const { characters, locations } = scopedStudioData;

  const filteredNovels = novels.filter((novel) => {
    const queryMatch = novel.title.toLowerCase().includes(libraryQuery.toLowerCase());
    const statusMatch =
      libraryNavigationState.status === "All statuses" ||
      novel.status === libraryNavigationState.status;
    const genreMatch =
      libraryNavigationState.genre === "All genres" ||
      novel.genre.toLowerCase().includes(libraryNavigationState.genre.toLowerCase());
    return queryMatch && statusMatch && genreMatch;
  }).sort((left, right) => {
    if (libraryNavigationState.sort === "title") {
      return left.title.localeCompare(right.title);
    }
    if (libraryNavigationState.sort === "created") {
      return right.createdAt.localeCompare(left.createdAt);
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });

  const filteredCharacters = filterAndSortCharacters(characters, characterCatalogState);

  const filteredPlaces = filterAndSortPlaces(locations, placeCatalogState);

  const novelMetrics = React.useMemo<Record<string, NovelMetricSummary>>(
    () =>
      Object.fromEntries(
        studioData.novels.map((novel) => {
          const volumeCount = studioData.volumes.filter((volume) => volume.novelId === novel.id).length;
          const volumeIds = new Set(
            studioData.volumes
              .filter((volume) => volume.novelId === novel.id)
              .map((volume) => volume.id)
          );
          const chapterCount = studioData.chapters.filter((chapter) =>
            volumeIds.has(chapter.volumeId)
          ).length;

          return [novel.id, { volumeCount, chapterCount }];
        })
      ),
    [studioData.chapters, studioData.novels, studioData.volumes]
  );

  const updateReaderNavigation = React.useCallback(
    (nextNavigation: ReaderNavigationState) => {
      if (!currentNovel.id || !nextNavigation.targetId) return;
      const query = serializeReaderNavigationState(nextNavigation).toString();
      router.push(`${routeForPage("reader", currentNovel.id)}?${query}`);
    },
    [currentNovel.id, router]
  );

  const selectPage = async (page: PageId) => {
    if (!(await flushPendingChanges())) {
      showToast("Save failed. Navigation was cancelled to protect your draft.");
      return;
    }
    router.push(routeForPage(page, currentNovel.id));
    setMobileDrawerOpen(false);
    setFocusMode(
      page === "editor" && studioSettings.defaultFocusMode === "Writing"
        ? "writing"
        : page === "reader" && studioSettings.defaultFocusMode === "Reading"
          ? "reading"
          : "none"
    );
  };

  const exportPreviewName = `${currentNovel.title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}-${exportScope
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}.${exportFormat === "ZIP backup" ? "zip" : exportFormat.toLowerCase()}`;

  const captureNote = (target: NoteCaptureTarget, selectedText?: string) => {
    const capture = createNoteCapture(currentNovel.id, target, selectedText);
    if (!capture) { showToast("Choose a valid story target and 1–100,000 characters of selected text."); return; }
    setEditingNote(null); setNoteCapture(capture); setDialog("note");
  };

  const noteDialog = dialog === "note" ? <NoteFormDialog key={`${currentNovel.id}:${editingNote?.id ?? "new"}`} novelId={currentNovel.id} note={editingNote} capture={noteCapture}
    options={noteOptions} availableTags={noteTagOptions.novelId === currentNovel.id ? noteTagOptions.tags : []}
    onClose={() => { setDialog(null); setEditingNote(null); setNoteCapture(null); }}
    onSaved={async () => {
      setNoteCatalogVersion(value => value + 1);
      showToast(editingNote ? "Note updated in SQLite" : "Note created in SQLite");
    }} /> : null;

  if (focusMode === "writing") {
    return (
      <StudioDataContext.Provider value={scopedStudioData}>
        <NoteCaptureContext.Provider value={captureNote}>
        <WritingFocusMode
          editorFontSize={Number.parseInt(studioSettings.editorFontSize, 10) || 18}
          autosaveDelayMs={autosaveDelay(studioSettings.autosaveInterval)}
          saveStatus={saveStatus}
          onSaveScene={saveScene}
          onRequestSave={() => void flushPendingChanges()}
          setSaveStatus={setSaveStatus}
          onRegisterPendingSave={registerPendingSave}
          onDirtyChange={setEditorDirty}
          onRefreshMetadata={() => void refreshStudioData(false)}
          onNotify={showToast}
          onExit={() => void changeFocusMode("none")}
        />
        {noteDialog}
        {toast ? <div role="status" className="fixed bottom-4 right-4 z-50 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-paper">{toast}</div> : null}
        </NoteCaptureContext.Provider>
      </StudioDataContext.Provider>
    );
  }
  return (
    <StudioDataContext.Provider value={scopedStudioData}>
      <NoteCaptureContext.Provider value={captureNote}>
      <NoteUpdatesContext.Provider value={noteCatalogVersion}>
      <main
        className="min-h-screen bg-background text-foreground"
        data-reading-focus={focusMode === "reading" ? "active" : undefined}
      >
        <div className="flex min-h-screen">
          <div className={cn(focusMode === "reading" ? "hidden" : "contents")} aria-hidden={focusMode === "reading" ? true : undefined}>
            <Sidebar
              activePage={activePage}
              sidebarState={sidebarState}
              labels={pageLabelsByLanguage[language]}
              copy={{
                appSubtitle: uiCopy[language].appSubtitle,
                expandedSidebar: uiCopy[language].expandedSidebar,
                compactSidebar: uiCopy[language].compactSidebar,
                hideSidebar: uiCopy[language].hideSidebar
              }}
              hasNovelContext={activePage !== "library" && Boolean(currentNovel.id)}
              readerOptimized={activePage === "reader"}
              onSelectPage={selectPage}
              onSidebarStateChange={updateSidebarState}
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className={cn(focusMode === "reading" ? "hidden" : "contents")} aria-hidden={focusMode === "reading" ? true : undefined}>
              <TopBar
                pageLabel={pageLabelsByLanguage[language][activePage]}
                subtitle={`${currentNovel.title} - ${uiCopy[language].localStudio}`}
                sidebarState={sidebarState}
                mobileNavigationOpen={mobileDrawerOpen}
                novels={studioData.novels}
                activeNovelId={currentNovel.id}
                copy={{
                  openNavigation: uiCopy[language].openNavigation,
                  toggleSidebar: uiCopy[language].toggleSidebar
                }}
                readerOptimized={activePage === "reader"}
                onOpenMobileNav={() => setMobileDrawerOpen(true)}
                onCycleSidebar={cycleSidebar}
                onActiveNovelChange={(novelId) =>
                  void setActiveNovel(
                    novelId,
                    activeRoute?.novelId ? activePage : "overview"
                  )
                }
              />
            </div>

          <div className={cn("min-w-0 flex-1", focusMode !== "reading" && "overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8 lg:py-7")}>
            <div className={cn(focusMode !== "reading" && "mx-auto max-w-[1480px] pb-8")}>
              {activePage === "dashboard" ? (
                <DashboardScreen
                  data={scopedStudioData}
                  translate={translate}
                  dailyWordGoal={studioSettings.dailyWordGoal}
                  onSelectPage={selectPage}
                  onOpenNovel={setActiveNovel}
                />
              ) : null}
              {activePage === "library" ? (
                <LibraryScreen
                  novels={filteredNovels}
                  novelMetrics={novelMetrics}
                  query={libraryQuery}
                  status={libraryNavigationState.status}
                  genre={libraryNavigationState.genre}
                  sort={libraryNavigationState.sort}
                  view={libraryNavigationState.view}
                  translate={translate}
                  onQueryChange={setLibraryQuery}
                  onStatusChange={(status) => updateLibraryNavigation({ status })}
                  onGenreChange={(genre) => updateLibraryNavigation({ genre })}
                  onSortChange={(sort) => updateLibraryNavigation({ sort })}
                  onViewChange={(view) => updateLibraryNavigation({ view })}
                  onClearFilters={() => {
                    setLibraryQuery("");
                    updateLibraryNavigation(defaultLibraryNavigationState);
                  }}
                  onOpenNovel={setActiveNovel}
                  onOpenDialog={() => setDialog("novel")}
                />
              ) : null}
              {activePage === "overview" ? (
                <NovelOverviewScreen
                  data={scopedStudioData}
                  translate={translate}
                  onSelectPage={selectPage}
                  onPublishToNotion={() => void publishCurrentNovelToNotion()}
                  onPullFromNotion={() => void pullCurrentNovelFromNotion()}
                  notionPublishState={notionPublishState}
                  notionPublishMessage={notionPublishMessage}
                  notionPublishUrl={notionPublishUrl}
                  notionRootConfigured={Boolean(studioSettings.notionRootPageId)}
                  notionSyncState={currentNotionSyncState}
                  notionAutosyncStatus={notionAutosyncStatus}
                />
              ) : null}
              {activePage === "structure" ? (
                <StructureScreen
                  data={scopedStudioData}
                  translate={translate}
                  onRefresh={() => refreshStudioData(false)}
                  onSelectItem={setActiveStructureItem}
                  onOpenScene={(sceneId) => void openSceneInEditor(sceneId)}
                  onNotify={showToast}
                />
              ) : null}
              {activePage === "editor" ? (
                <EditorScreen
                  editorFontSize={Number.parseInt(studioSettings.editorFontSize, 10) || 18}
                  autosaveDelayMs={autosaveDelay(studioSettings.autosaveInterval)}
                  saveStatus={saveStatus}
                  onSaveScene={saveScene}
                  onRequestSave={() => void flushPendingChanges()}
                  onRegisterPendingSave={registerPendingSave}
                  onDirtyChange={setEditorDirty}
                  onFocus={() => void changeFocusMode("writing")}
                  onReader={() => void selectPage("reader")}
                  onNavigateScene={(sceneId) => void openSceneInEditor(sceneId)}
                  onRefreshMetadata={() => void refreshStudioData(false)}
                  onNotify={showToast}
                  inspectorOpen={inspectorOpen}
                  setInspectorOpen={updateInspectorOpen}
                  setSaveStatus={setSaveStatus}
                />
              ) : null}
              {activePage === "reader" ? (
                <ReaderScreen
                  navigation={readerNavigation}
                  readerFontSize={readerFontSize}
                  readerWidth={readerWidth}
                  isFocusMode={focusMode === "reading"}
                  onNavigationChange={updateReaderNavigation}
                  onReaderFontSizeChange={(fontSize) => updateReaderPreferences({ fontSize })}
                  onReaderWidthChange={(width) => updateReaderPreferences({ width })}
                  onResetReaderPreferences={() => updateReaderPreferences(defaultReaderPreferences)}
                  onFocus={() => void changeFocusMode("reading")}
                  onExitFocus={() => void changeFocusMode("none")}
                  onFocusOverlayChange={setReaderFocusOverlayOpen}
                  onRegisterFocusToggle={registerReaderFocusToggle}
                  onOpenStructure={() => void selectPage("structure")}
                  onOpenEditor={() => void selectPage("editor")}
                />
              ) : null}
              {activePage === "characters" ? (
                <CharactersScreen
                  data={scopedStudioData}
                  characters={filteredCharacters}
                  query={characterCatalogState.query}
                  role={characterCatalogState.role}
                  status={characterCatalogState.status}
                  sort={characterCatalogState.sort}
                  showArchived={characterCatalogState.showArchived}
                  roleOptions={characterRoles}
                  statusOptions={characterStatuses}
                  sortOptions={characterSortOptions}
                  translate={translate}
                  selectedCharacterId={activeRoute?.characterId ?? null}
                  characterHref={(characterId) => {
                    const query = serializeCharacterCatalogState(characterCatalogState).toString();
                    const route = routeForCharacter(currentNovel.id, characterId);
                    return query ? `${route}?${query}` : route;
                  }}
                  onQueryChange={(query) => updateCharacterCatalog({ query })}
                  onRoleChange={(role) => updateCharacterCatalog({ role })}
                  onStatusChange={(status) =>
                    updateCharacterCatalog({
                      status,
                      ...(status === "Archived" ? { showArchived: true } : {})
                    })
                  }
                  onSortChange={(sort) =>
                    updateCharacterCatalog({ sort: sort as CharacterCatalogState["sort"] })
                  }
                  onClearFilters={() => updateCharacterCatalog(defaultCharacterCatalogState)}
                  onShowArchivedChange={(showArchived) =>
                    updateCharacterCatalog({
                      showArchived,
                      ...(!showArchived && characterCatalogState.status === "Archived"
                        ? { status: "All statuses" }
                        : {})
                    })
                  }
                  onAddCharacter={() => { setEditingCharacter(null); setDialog("character"); }}
                  onEditCharacter={(character) => { setEditingCharacter(character); setDialog("character"); }}
                  onSceneLinksChanged={() => refreshStudioData(false)}
                  onPlaceLinksChanged={() => refreshStudioData(false)}
                  onArchiveCharacter={archiveCharacter}
                  onRestoreCharacter={restoreCharacter}
                  onDeleteCharacter={permanentlyDeleteCharacter}
                />
              ) : null}
              {activePage === "places" ? (
                <PlacesScreen
                  onScenesChanged={async () => { if (!await refreshStudioData(false)) throw new Error("Links saved, but the detail could not refresh. Please retry."); }}
                  places={filteredPlaces}
                  catalogState={placeCatalogState}
                  onCatalogChange={updatePlaceCatalog}
                  onClearFilters={() => updatePlaceCatalog(defaultPlaceCatalogState)}
                  onAddPlace={() => { setEditingPlace(null); setDialog("place"); }}
                  onEditPlace={(place) => { setEditingPlace(place); setDialog("place"); }}
                  selectedPlaceId={activeRoute?.placeId ?? null}
                />
              ) : null}
              {activePage === "relationships" ? (
                <RelationshipsScreen
                  catalog={relationshipCatalog}
                  onCatalogChange={updateRelationshipCatalog}
                  onAddRelationship={(type = "") => { setInitialRelationshipType(type); setDialog("relationship"); }}
                  onChanged={async () => { if (!await refreshStudioData(false)) throw new Error("Changes saved. Could not refresh; please retry."); }}
                />
              ) : null}
              {activePage === "timeline" ? (
                <TimelineScreen
                  ready={dataStatus === "ready"}
                  eventId={activeRoute?.eventId}
                  onAddEvent={() => setDialog("event")}
                  onChanged={async () => { if (!await refreshStudioData(false)) throw new Error("Saved; refresh failed. Please retry."); }}
                />
              ) : null}
              {activePage === "notes" ? (
                <NotesCatalog key={currentNovel.id} novelId={currentNovel.id} selectedNoteId={activeRoute?.noteId} version={noteCatalogVersion} options={noteOptions} onTagsLoaded={noteTagsLoaded} onAddNote={() => { setEditingNote(null); setNoteCapture(null); setDialog("note"); }} onEditNote={note => { setEditingNote(note); setNoteCapture(null); setDialog("note"); }} />
              ) : null}
              {activePage === "export" ? (
                <ExportScreen
                  exportScope={exportScope}
                  exportFormat={exportFormat}
                  exportFilename={exportPreviewName}
                  enabledOptions={enabledExportOptions}
                  onScopeChange={setExportScope}
                  onFormatChange={setExportFormat}
                  onOptionsChange={setEnabledExportOptions}
                  onOpenDialog={() => setDialog("export")}
                />
              ) : null}
              {activePage === "backups" ? (
                <BackupsScreen
                  onCreateBackup={createBackup}
                  creatingBackup={creatingBackup}
                  retentionPolicy={studioSettings.backupRetention}
                />
              ) : null}
              {activePage === "settings" ? (
                <SettingsScreen
                  language={language}
                  sidebarState={sidebarState}
                  settings={studioSettings}
                  translate={translate}
                  onLanguageChange={updateLanguage}
                  onSidebarStateChange={updateSidebarState}
                  onSettingChange={updateStudioSetting}
                  settingsSaveState={settingsSaveState}
                  settingsSaveMessage={settingsSaveMessage}
                  onNotionConnectionVerified={applyVerifiedNotionConnection}
                  notionAutosyncStatus={notionAutosyncStatus}
                  notionAutosyncRetryAt={notionAutosyncRetryAt}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <MobileNavDialog
        open={mobileDrawerOpen}
        activePage={activePage}
        labels={pageLabelsByLanguage[language]}
        description={uiCopy[language].openNavigation}
        hasNovelContext={activePage !== "library" && Boolean(currentNovel.id)}
        readerOptimized={activePage === "reader"}
        onOpenChange={setMobileDrawerOpen}
        onSelectPage={selectPage}
      />

      <PrototypeDialog
        dialog={dialog === "character" || dialog === "place" || dialog === "event" || dialog === "note" ? null : dialog}
        exportFilename={exportPreviewName}
        onCreateNovel={createNovelFromDialog}
        onCreateRelationship={createRelationshipFromDialog}
        initialRelationshipType={initialRelationshipType}
        onNavigateReaderScene={(sceneId) => {
          updateReaderNavigation({ scope: "scene", targetId: sceneId });
          setDialog(null);
        }}
        onClose={() => setDialog(null)}
      />

      {noteDialog}

      {dialog === "event" ? <TimelineEventDialog novelId={currentNovel.id}
        options={relationshipSinceOptions(currentNovel.id, scopedStudioData.volumes, scopedStudioData.chapters, scopedStudioData.scenes)}
        characters={scopedStudioData.characters} places={scopedStudioData.locations} onSaved={timelineEventSaved} onClose={() => setDialog(null)} /> : null}

      {dialog === "place" ? (
        <PlaceFormDialog
          novelId={currentNovel.id}
          place={editingPlace}
          places={scopedStudioData.locations}
          onClose={() => { setDialog(null); setEditingPlace(null); }}
          onSaved={async (place) => {
            // Full saved metadata belongs only in the selected detail, never the catalog.
            await refreshStudioData(false);
            router.push(routeForPlaceCatalog(place.novelId, editingPlace ? placeCatalogState : defaultPlaceCatalogState, place.id));
            showToast(editingPlace ? "Place updated in SQLite" : "Place created in SQLite");
          }}
        />
      ) : null}

      <CharacterFormDialog
        open={dialog === "character"}
        novelId={currentNovel.id}
        character={editingCharacter}
        onOpenChange={(open) => {
          if (!open) { setDialog(null); setEditingCharacter(null); }
        }}
        onSaved={async (_character, mode) => {
          await refreshStudioData(false);
          router.push(routeForPage("characters", currentNovel.id));
          showToast(mode === "edit" ? "Character updated in SQLite" : "Character created in SQLite");
        }}
      />

      <NotionConflictDialog
        conflict={notionConflict}
        translate={translate}
        resolving={resolvingNotionConflict}
        onResolve={(choice) => void resolveCurrentNotionConflict(choice)}
      />

        {toast ? (
          <div role="status" className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-lg border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-paper">
            <Check className="size-4 text-primary" />
            {toast}
          </div>
        ) : null}
      </main>
      </NoteUpdatesContext.Provider>
      </NoteCaptureContext.Provider>
    </StudioDataContext.Provider>
  );
}

function EditorScreen({
  editorFontSize,
  autosaveDelayMs,
  saveStatus,
  inspectorOpen,
  onSaveScene,
  onRequestSave,
  onRegisterPendingSave,
  onDirtyChange,
  onFocus,
  onReader,
  onNavigateScene,
  onRefreshMetadata,
  onNotify,
  setInspectorOpen,
  setSaveStatus
}: {
  editorFontSize: number;
  autosaveDelayMs: number | null;
  saveStatus: SaveStatus;
  inspectorOpen: boolean;
  onSaveScene: (sceneId: string, input: SceneSaveInput, expectedRevision: number) => Promise<Scene | null>;
  onRequestSave: () => void;
  onRegisterPendingSave: (handler: PendingSaveHandler | null) => void;
  onDirtyChange: (dirty: boolean) => void;
  onFocus: () => void;
  onReader: () => void;
  onNavigateScene: (sceneId: string) => void;
  onRefreshMetadata: () => void;
  onNotify: (message: string) => void;
  setInspectorOpen: (open: boolean) => void;
  setSaveStatus: (status: SaveStatus) => void;
}) {
  const data = useStudioData();
  const activeChapter = getActiveChapter(data);
  const activeScene = getActiveScene(data);
  const activeVolume = data.volumes.find((volume) => volume.id === activeChapter.volumeId);
  const manuscriptRef = React.useRef<HTMLTextAreaElement>(null);
  const [manuscriptSelection, setManuscriptSelection] = React.useState<ManuscriptSelection>({ sceneId: "", start: 0, end: 0 });
  const noteTarget: NoteCaptureTarget = { novelId: data.settings.activeNovelId, type: "Scene", id: activeScene.id, title: activeScene.title };
  const navigationScenes = React.useMemo(() => getNovelSceneNavigation(data.settings.activeNovelId, data.volumes, data.chapters, data.scenes), [data.chapters, data.scenes, data.settings.activeNovelId, data.volumes]);
  const adjacentScenes = getAdjacentSceneIds(activeScene.id, navigationScenes.map((scene) => scene.id));
  const [chapterPreviewOpen, setChapterPreviewOpen] = React.useState(false);
  const [chapterPreview, setChapterPreview] = React.useState<{
    chapter: { id: string; title: string };
    scenes: Array<{ id: string; title: string; content: string }>;
  } | null>(null);
  const [chapterPreviewError, setChapterPreviewError] = React.useState<string | null>(null);
  const [chapterPreviewLoading, setChapterPreviewLoading] = React.useState(false);
  const [versionsOpen, setVersionsOpen] = React.useState(false);
  const [versions, setVersions] = React.useState<Array<{ id: string; title: string; content: string; wordCount: number; label: string; origin: string; createdAt: string }>>([]);
  const [versionLabel, setVersionLabel] = React.useState("");
  const [selectedVersion, setSelectedVersion] = React.useState<string | null>(null);
  const [versionError, setVersionError] = React.useState("");
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = React.useState(false);
  const [title, setTitle] = React.useState(activeScene.title);
  const [status, setStatus] = React.useState<ChapterStatus>(activeScene.status);
  const [content, setContent] = React.useState(activeScene.content);
  const [draftVersion, setDraftVersion] = React.useState(0);
  const revisionRef = React.useRef(0);
  const loadedSceneIdRef = React.useRef<string | null>(null);
  const activeSceneRef = React.useRef(activeScene);
  const draftRef = React.useRef({ title, status, content });
  const dirtyRef = React.useRef(false);
  const saveCurrentSceneRef = React.useRef<(() => Promise<boolean>) | null>(null);
  const exitSaveRequestedRef = React.useRef(false);
  activeSceneRef.current = activeScene;
  const dirty =
    title !== activeScene.title ||
    status !== activeScene.status ||
    content !== activeScene.content;
  dirtyRef.current = dirty;
  const draftWordCount = content.trim().match(/\S+/g)?.length ?? 0;
  const estimatedReadingMinutes = Math.max(1, Math.ceil(draftWordCount / 200));

  const markDirty = React.useCallback(() => {
    revisionRef.current += 1;
    setDraftVersion((version) => version + 1);
    onDirtyChange(true);
    setSaveStatus("Unsaved changes");
  }, [onDirtyChange, setSaveStatus]);

  const saveCurrentScene = React.useCallback(async () => {
    const scene = activeSceneRef.current;
    const draft = draftRef.current;
    const hasChanges =
      draft.title !== scene.title ||
      draft.status !== scene.status ||
      draft.content !== scene.content;
    if (!hasChanges) return true;
    const revisionAtStart = revisionRef.current;
    const savedScene = await onSaveScene(scene.id, {
      title: draft.title,
      status: draft.status,
      content: draft.content
    }, scene.revision);
    if (!savedScene) return false;

    activeSceneRef.current = { ...scene, ...draft, revision: savedScene.revision };

    const nextStatus = statusAfterSaveConfirmation(revisionRef.current, revisionAtStart);
    if (nextStatus === "Saved locally") {
      onDirtyChange(false);
    } else {
      onDirtyChange(true);
    }
    setSaveStatus(nextStatus);
    return true;
  }, [onDirtyChange, onSaveScene, setSaveStatus]);
  saveCurrentSceneRef.current = saveCurrentScene;

  const persistDraftBeforeExit = React.useCallback(() => {
    if (!dirtyRef.current || exitSaveRequestedRef.current) return;

    exitSaveRequestedRef.current = true;
    void saveCurrentSceneRef.current?.().finally(() => {
      exitSaveRequestedRef.current = false;
    });
  }, []);

  const openChapterPreview = React.useCallback(async () => {
    setChapterPreviewOpen(true);
    setChapterPreviewLoading(true);
    setChapterPreviewError(null);
    try {
      const response = await fetch(`/api/chapters/${encodeURIComponent(activeChapter.id)}/preview`);
      if (!response.ok) throw new Error("Could not load chapter preview");
      setChapterPreview(await response.json());
    } catch {
      setChapterPreviewError("Could not load chapter preview. Your scene draft remains unchanged.");
    } finally {
      setChapterPreviewLoading(false);
    }
  }, [activeChapter.id]);

  const loadVersions = React.useCallback(async () => {
    const response = await fetch(`/api/scenes/${encodeURIComponent(activeScene.id)}/versions`);
    if (!response.ok) throw new Error("Could not load version history");
    setVersions(await response.json());
  }, [activeScene.id]);

  const openVersions = async () => {
    setVersionsOpen(true); setVersionError(""); setSelectedVersion(null);
    try { await loadVersions(); } catch { setVersionError("Could not load version history."); }
  };
  const createCheckpoint = async () => {
    try { const response = await fetch(`/api/scenes/${encodeURIComponent(activeScene.id)}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: versionLabel }) }); if (!response.ok) throw new Error(); setVersionLabel(""); await loadVersions(); }
    catch { setVersionError("Could not create checkpoint. Your scene remains unchanged."); }
  };
  const restoreSelectedVersion = async () => {
    if (!selectedVersion) return;
    try { const response = await fetch(`/api/scenes/${encodeURIComponent(activeScene.id)}/versions/${encodeURIComponent(selectedVersion)}/restore`, { method: "POST" }); if (!response.ok) throw new Error(); setVersionsOpen(false); onRefreshMetadata(); }
    catch { setVersionError("Could not restore this version. Your current scene remains unchanged."); }
  };

  React.useEffect(() => {
    if (loadedSceneIdRef.current === activeScene.id) return;
    loadedSceneIdRef.current = activeScene.id;
    setTitle(activeScene.title);
    setStatus(activeScene.status);
    setContent(activeScene.content);
    draftRef.current = {
      title: activeScene.title,
      status: activeScene.status,
      content: activeScene.content
    };
    revisionRef.current = 0;
    setDraftVersion(0);
    onDirtyChange(false);
    setSaveStatus("Saved locally");
  }, [activeScene, onDirtyChange, setSaveStatus]);

  React.useEffect(() => {
    onDirtyChange(dirty);
    if (!dirty && saveStatus !== "Saving…" && saveStatus !== "Saved locally") {
      setSaveStatus("Saved locally");
    }
  }, [dirty, onDirtyChange, saveStatus, setSaveStatus]);

  React.useEffect(() => {
    if (!dirty || autosaveDelayMs === null) return;

    const timeout = window.setTimeout(onRequestSave, autosaveDelayMs);
    return () => window.clearTimeout(timeout);
  }, [autosaveDelayMs, dirty, draftVersion, onRequestSave]);

  React.useEffect(() => {
    onRegisterPendingSave(saveCurrentScene);
    return () => onRegisterPendingSave(null);
  }, [onRegisterPendingSave, saveCurrentScene]);

  React.useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      persistDraftBeforeExit();
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("pagehide", persistDraftBeforeExit);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("pagehide", persistDraftBeforeExit);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [persistDraftBeforeExit]);

  React.useEffect(
    () => () => {
      persistDraftBeforeExit();
    },
    [persistDraftBeforeExit]
  );

  return (
    <div className="grid gap-6">
      <SectionHeader
        eyebrow="Editor"
        title={activeChapter.title}
        description="Draft scenes, inspect story links, and keep the assembled chapter close at hand."
        action={
          <>
            <Button variant="outline" aria-label="Previous scene" disabled={!adjacentScenes.previousId} onClick={() => adjacentScenes.previousId && onNavigateScene(adjacentScenes.previousId)}><ChevronLeft className="size-4" />Previous</Button>
            <Button variant="outline" aria-label="Next scene" disabled={!adjacentScenes.nextId} onClick={() => adjacentScenes.nextId && onNavigateScene(adjacentScenes.nextId)}>Next<ChevronRight className="size-4" /></Button>
            <Button onClick={onFocus}>
              <MaximizeIcon />
              Focus mode
            </Button>
            <Button variant="outline" onClick={onReader}>
              <BookOpen className="size-4" />
              Reader preview
            </Button>
            <Button variant="outline" onClick={() => void openChapterPreview()}>
              <Eye className="size-4" />
              Chapter preview
            </Button>
          </>
        }
      />

      <div
        className={cn(
          "grid min-w-0 gap-4",
          inspectorOpen ? "xl:grid-cols-[minmax(0,1fr)_minmax(18rem,360px)]" : "xl:grid-cols-1"
        )}
      >
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="border-b bg-card/70">
            <div className="grid gap-3 xl:grid-cols-[1fr_auto] xl:items-center">
              <div className="grid gap-3 sm:grid-cols-[1fr_190px]">
                <div>
                  <Label htmlFor="chapter-title">Title</Label>
                  <Input
                    id="chapter-title"
                    value={title}
                    className="mt-2"
                    onChange={(event) => {
                      const nextTitle = event.target.value;
                      draftRef.current = { ...draftRef.current, title: nextTitle };
                      setTitle(nextTitle);
                      markDirty();
                    }}
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select
                    value={status}
                    onValueChange={(value) => {
                      const nextStatus = value as ChapterStatus;
                      draftRef.current = { ...draftRef.current, status: nextStatus };
                      setStatus(nextStatus);
                      markDirty();
                    }}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {chapterStatusOptions.map((chapterStatus) => (
                        <SelectItem key={chapterStatus} value={chapterStatus}>
                          {chapterStatus}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={onRequestSave}
                  disabled={!dirty || saveStatus === "Saving…"}
                >
                  <Save className="size-4" />
                  {saveStatus === "Save failed — Retry" ? "Retry save" : "Save"}
                </Button>
                <AddStoryNoteButton target={noteTarget} disabled={!activeScene.id} />
                <Button variant="outline" onClick={() => void openVersions()}>
                  <History className="size-4" />
                  Version history
                </Button>
                <Button variant="ghost" size="icon" aria-label="More editor options" onClick={() => setMoreActionsOpen(true)}>
                  <MoreHorizontal className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={inspectorOpen ? "Close inspector" : "Open inspector"}
                  aria-pressed={inspectorOpen}
                  onClick={() => setInspectorOpen(!inspectorOpen)}
                >
                  {inspectorOpen ? (
                    <PanelRightClose className="size-4" />
                  ) : (
                    <PanelRightOpen className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="p-4">
              <div className="mx-auto mb-3 max-w-4xl text-sm text-muted-foreground">
                {activeVolume?.title} / {activeChapter.title} / <span className="font-medium text-foreground">{activeScene.title}</span>
              </div>
              <div className="mx-auto mb-3 max-w-4xl">
                <Label htmlFor="editor-scene-selector">Scene</Label>
                <Select value={activeScene.id} onValueChange={onNavigateScene}>
                  <SelectTrigger id="editor-scene-selector" className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>{navigationScenes.map((scene) => { const chapter = data.chapters.find((item) => item.id === scene.chapterId); const volume = data.volumes.find((item) => item.id === chapter?.volumeId); return <SelectItem key={scene.id} value={scene.id}>{volume?.title} / {chapter?.title} / {scene.title}</SelectItem>; })}</SelectContent>
                </Select>
              </div>
              <div className="mx-auto max-w-4xl rounded-lg border bg-editor p-4 shadow-inner sm:p-8">
                <Textarea
                  aria-label="Scene manuscript"
                  ref={manuscriptRef}
                  data-scene-id={activeScene.id}
                  onSelect={event => { const input = event.currentTarget; setManuscriptSelection({ sceneId: activeScene.id, start: input.selectionStart, end: input.selectionEnd }); }}
                  value={content}
                  onChange={(event) => {
                    const nextContent = event.target.value;
                    draftRef.current = { ...draftRef.current, content: nextContent };
                    setContent(nextContent);
                    markDirty();
                  }}
                  className="manuscript-editor min-h-[520px] border-0 bg-transparent p-0 font-typewriter text-base leading-8 text-editor-foreground shadow-none focus-visible:ring-0 sm:text-lg"
                  style={{ fontSize: `${editorFontSize}px` }}
                />
              </div>
              {loadedSceneIdRef.current === activeScene.id ? <SelectionCaptureMenu key={`${activeScene.id}:${manuscriptSelection.start}:${manuscriptSelection.end}`} target={noteTarget} manuscriptRef={manuscriptRef} selection={manuscriptSelection} onRefresh={onRefreshMetadata} onNotify={onNotify} /> : null}
              <SceneAnnotations novelId={data.settings.activeNovelId} sceneId={activeScene.id} content={content} manuscriptRef={manuscriptRef} />
              <CharacterHighlightPreview novelId={data.settings.activeNovelId} content={content} characters={data.characters.filter(character => character.novelId === data.settings.activeNovelId && character.status === "Active" && !character.archivedAt).map(character => ({ id: character.id, name: character.name, aliases: character.aliases, role: character.role, personality: character.personality, wayOfSpeaking: character.wayOfSpeaking, goal: character.goal, fear: character.fear }))} />
            </div>
          </CardContent>
          <CardFooter className="flex flex-wrap justify-between gap-3 border-t bg-card/70 p-4">
            <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">{formatNumber(draftWordCount)} words</Badge>
              <Badge variant="outline">{formatNumber(content.length)} characters</Badge>
              <Badge variant="outline">{estimatedReadingMinutes} min read</Badge>
            </div>
            <div aria-live="polite" className="flex items-center gap-2 text-sm">
              <Circle
                className={cn(
                  "size-2 fill-current",
                  saveStatus === "Saved locally" && "text-emerald-600",
                  saveStatus === "Saving…" && "text-accent",
                  saveStatus === "Unsaved changes" && "text-warning",
                  saveStatus === "Save failed — Retry" && "text-destructive"
                )}
              />
              {saveStatus}
            </div>
          </CardFooter>
        </Card>

        <Dialog open={chapterPreviewOpen} onOpenChange={setChapterPreviewOpen}>
          <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Chapter Preview · {activeChapter.title}</DialogTitle>
              <DialogDescription>
                Read-only composition of saved scenes, ordered by the chapter structure.
              </DialogDescription>
            </DialogHeader>
            {chapterPreviewLoading ? <p className="text-sm text-muted-foreground">Loading preview…</p> : null}
            {chapterPreviewError ? <p className="text-sm text-destructive">{chapterPreviewError}</p> : null}
            {chapterPreview ? (
              <article aria-label="Read-only chapter preview" className="grid gap-6 font-typewriter leading-8">
                {chapterPreview.scenes.map((scene, index) => (
                  <React.Fragment key={scene.id}>
                    {index > 0 ? <hr className="border-border" /> : null}
                    <section>
                      <h3 className="mb-3 font-sans text-base font-semibold">{scene.title}</h3>
                      <p className="whitespace-pre-wrap">{scene.content || "(Empty scene)"}</p>
                    </section>
                  </React.Fragment>
                ))}
              </article>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => setChapterPreviewOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={versionsOpen} onOpenChange={setVersionsOpen}>
          <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
            <DialogHeader><DialogTitle>Version history</DialogTitle><DialogDescription>Checkpoints are deliberate snapshots; autosave does not create versions.</DialogDescription></DialogHeader>
            <div className="flex gap-2"><Input value={versionLabel} maxLength={120} onChange={(event) => setVersionLabel(event.target.value)} placeholder="Optional checkpoint label" aria-label="Checkpoint label" /><Button onClick={() => void createCheckpoint()}>Create checkpoint</Button></div>
            {versionError ? <p role="alert" className="text-sm text-destructive">{versionError}</p> : null}
            <div className="grid gap-2">{versions.length ? versions.map((version) => <button key={version.id} type="button" className={cn("rounded-lg border p-3 text-left", selectedVersion === version.id && "border-primary bg-accent/30")} onClick={() => setSelectedVersion(version.id)}><span className="font-medium">{version.label || version.origin}</span><span className="ml-2 text-sm text-muted-foreground">{new Date(version.createdAt).toLocaleString()} · {version.wordCount} words</span></button>) : <p className="text-sm text-muted-foreground">No checkpoints yet.</p>}</div>
            {selectedVersion ? <div className="rounded-lg border bg-muted/30 p-3"><p className="mb-2 text-sm font-medium">Preview — no changes have been made</p><p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm">{versions.find((version) => version.id === selectedVersion)?.content}</p></div> : null}
            <DialogFooter><Button variant="outline" onClick={() => setVersionsOpen(false)}>Cancel</Button><Button variant="destructive" disabled={!selectedVersion} onClick={() => void restoreSelectedVersion()}>Restore selected version</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {inspectorOpen ? <EditorInspector onRefresh={onRefreshMetadata} /> : null}
      </div>

      <StoryNotes target={noteTarget} />
      <Dialog open={moreActionsOpen} onOpenChange={setMoreActionsOpen}>
        <DialogContent><DialogHeader><DialogTitle>More editor actions</DialogTitle><DialogDescription>Less frequent actions stay out of the writing toolbar.</DialogDescription></DialogHeader><Button variant="outline"><Download className="size-4" />Export chapter</Button><Button variant="outline" onClick={() => { setMoreActionsOpen(false); setShortcutsOpen(true); }}><Keyboard className="size-4" />Keyboard shortcuts</Button><DialogFooter><Button variant="outline" onClick={() => setMoreActionsOpen(false)}>Close</Button></DialogFooter></DialogContent>
      </Dialog>
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent><DialogHeader><DialogTitle>Keyboard shortcuts</DialogTitle><DialogDescription>Writing shortcuts remain local to Monogatari.</DialogDescription></DialogHeader><div className="grid gap-2 text-sm"><p><kbd>Ctrl / Cmd + S</kbd> Save scene</p><p><kbd>Ctrl / Cmd + Enter</kbd> Focus mode</p><p><kbd>Ctrl / Cmd + \\</kbd> Cycle sidebar</p><p><kbd>Escape</kbd> Exit focus or close dialogs</p></div><DialogFooter><Button onClick={() => setShortcutsOpen(false)}>Close shortcuts</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}

function MaximizeIcon() {
  return <ChevronsRight className="size-4 rotate-45" />;
}

function EditorInspector({ onRefresh }: { onRefresh: () => void }) {
  const data = useStudioData();
  const activeScene = getActiveScene(data);
  const activeChapter = getActiveChapter(data);
  const activeVolume = data.volumes.find((volume) => volume.id === activeChapter.volumeId);
  const novelId = activeVolume?.novelId ?? "";
  const [summary, setSummary] = React.useState(activeScene.summary);
  const [objective, setObjective] = React.useState(activeScene.objective);
  const [notes, setNotes] = React.useState("");
  const [characterIds, setCharacterIds] = React.useState<string[]>([]);
  const [locationIds, setLocationIds] = React.useState<string[]>([]);
  const [expectedLocationIds, setExpectedLocationIds] = React.useState<string[]>([]);
  const [timelineEventId, setTimelineEventId] = React.useState("none");
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [metadataLoading, setMetadataLoading] = React.useState(true);

  const characters = data.characters.filter((character) => character.novelId === novelId);
  const locations = data.locations.filter((location) => location.novelId === novelId);
  const timelineEvents = data.timelineEvents.filter((event) => event.novelId === novelId);

  React.useEffect(() => {
    let cancelled = false;
    setSummary(activeScene.summary);
    setObjective(activeScene.objective);
    setLocationIds([]);
    setCharacterIds([]);
    setTimelineEventId("none");
    setNotes("");
    setSaveState("idle");
    setMetadataLoading(true);
    void fetch(`/api/scenes/${encodeURIComponent(activeScene.id)}/inspector`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load scene metadata");
        return response.json() as Promise<{ characterIds: string[]; locationIds: string[]; timelineEventId: string | null; notes: string }>;
      })
      .then((inspector) => {
        if (cancelled) return;
        setCharacterIds(inspector.characterIds);
        setLocationIds(inspector.locationIds);
        setExpectedLocationIds(inspector.locationIds);
        setTimelineEventId(inspector.timelineEventId ?? "none");
        setNotes(inspector.notes);
        setMetadataLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setMetadataLoading(false);
        setSaveState("error");
      });
    return () => { cancelled = true; };
  }, [activeScene.id, activeScene.locationId, activeScene.objective, activeScene.summary]);

  const saveMetadata = async () => {
    setSaveState("saving");
    try {
      const response = await fetch(`/api/scenes/${encodeURIComponent(activeScene.id)}/inspector`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary, objective, notes, characterIds, locationIds, expectedLocationIds, timelineEventId: timelineEventId === "none" ? null : timelineEventId })
      });
      if (!response.ok) throw new Error("Could not save scene metadata");
      setExpectedLocationIds(locationIds);
      setSaveState("saved");
      onRefresh();
    } catch {
      setSaveState("error");
    }
  };

  return (
    <Card className="min-w-0 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
      <CardHeader>
        <CardTitle>Scene inspector</CardTitle>
        <CardDescription>Local story metadata for continuity</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2"><Label htmlFor="scene-summary">Scene summary</Label><Textarea id="scene-summary" value={summary} onChange={(event) => setSummary(event.target.value)} /></div>
        <div className="grid gap-2"><Label>Linked characters</Label><div className="flex flex-wrap gap-2">{characterIds.map((id) => { const character = characters.find((item) => item.id === id); return character ? <Badge key={id} variant="outline" className="gap-1">{character.name}<button type="button" aria-label={`Remove ${character.name}`} onClick={() => setCharacterIds((ids) => ids.filter((item) => item !== id))}><X className="size-3" /></button></Badge> : null; })}</div><Select value="" onValueChange={(id) => setCharacterIds((ids) => ids.includes(id) ? ids : [...ids, id])}><SelectTrigger aria-label="Add linked character"><SelectValue placeholder="Add character" /></SelectTrigger><SelectContent>{characters.filter((character) => !characterIds.includes(character.id)).map((character) => <SelectItem key={character.id} value={character.id}>{character.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid gap-2"><Label>Linked places</Label><div className="flex flex-wrap gap-2">{locationIds.map((id) => { const location = locations.find((item) => item.id === id); return <Badge key={id} variant="outline" className="gap-1">{location?.name ?? "Unavailable place"}<button type="button" aria-label={`Remove place ${location?.name ?? id}`} onClick={() => setLocationIds((ids) => ids.filter((item) => item !== id))}><X className="size-3" /></button></Badge>; })}</div><Select value="" onValueChange={(id) => setLocationIds((ids) => ids.includes(id) ? ids : [...ids, id])}><SelectTrigger aria-label="Add linked place"><SelectValue placeholder="Add place" /></SelectTrigger><SelectContent>{locations.filter((location) => !locationIds.includes(location.id)).map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid gap-2"><Label htmlFor="scene-timeline">Timeline moment</Label><Select value={timelineEventId} onValueChange={setTimelineEventId}><SelectTrigger id="scene-timeline"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No timeline moment</SelectItem>{timelineEvents.map((event) => <SelectItem key={event.id} value={event.id}>{event.internalDate ? `${event.internalDate} · ` : ""}{event.title}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid gap-2"><Label htmlFor="scene-objective">Objective</Label><Textarea id="scene-objective" value={objective} onChange={(event) => setObjective(event.target.value)} /></div>
        <div className="grid gap-2"><Label htmlFor="scene-notes">Notes</Label><Textarea id="scene-notes" value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
        {saveState === "error" ? <p role="alert" className="text-sm text-destructive">Metadata could not be saved. Your changes remain here; retry when ready.</p> : null}
        <Button className="w-full" onClick={() => void saveMetadata()} disabled={metadataLoading || saveState === "saving"}>{metadataLoading ? "Loading metadata…" : saveState === "saving" ? "Saving metadata…" : saveState === "saved" ? "Saved metadata" : "Save metadata"}</Button>
      </CardContent>
    </Card>
  );
}

function WritingFocusMode({
  editorFontSize,
  autosaveDelayMs,
  saveStatus,
  onSaveScene,
  onRequestSave,
  setSaveStatus,
  onRegisterPendingSave,
  onDirtyChange,
  onRefreshMetadata,
  onNotify,
  onExit
}: {
  editorFontSize: number;
  autosaveDelayMs: number | null;
  saveStatus: SaveStatus;
  onSaveScene: (sceneId: string, input: SceneSaveInput, expectedRevision: number) => Promise<Scene | null>;
  onRequestSave: () => void;
  setSaveStatus: (status: SaveStatus) => void;
  onRegisterPendingSave: (handler: PendingSaveHandler | null) => void;
  onDirtyChange: (dirty: boolean) => void;
  onRefreshMetadata: () => void;
  onNotify: (message: string) => void;
  onExit: () => void;
}) {
  const data = useStudioData();
  const activeScene = getActiveScene(data);
  const manuscriptRef = React.useRef<HTMLTextAreaElement>(null);
  const [manuscriptSelection, setManuscriptSelection] = React.useState<ManuscriptSelection>({ sceneId: "", start: 0, end: 0 });
  const noteTarget: NoteCaptureTarget = { novelId: data.settings.activeNovelId, type: "Scene", id: activeScene.id, title: activeScene.title };
  const [content, setContent] = React.useState(activeScene.content);
  const [draftVersion, setDraftVersion] = React.useState(0);
  const revisionRef = React.useRef(0);
  const loadedSceneIdRef = React.useRef<string | null>(null);
  const activeSceneRef = React.useRef(activeScene);
  const contentRef = React.useRef(content);
  activeSceneRef.current = activeScene;
  const dirty = content !== activeScene.content;
  const draftWordCount = content.trim().match(/\S+/g)?.length ?? 0;

  const saveCurrentScene = React.useCallback(async () => {
    const scene = activeSceneRef.current;
    const latestContent = contentRef.current;
    if (latestContent === scene.content) return true;
    const revisionAtStart = revisionRef.current;
    const savedScene = await onSaveScene(scene.id, {
      title: scene.title,
      status: scene.status,
      content: latestContent
    }, scene.revision);
    if (!savedScene) return false;
    activeSceneRef.current = { ...scene, content: latestContent, revision: savedScene.revision };
    const nextStatus = statusAfterSaveConfirmation(revisionRef.current, revisionAtStart);
    if (nextStatus === "Saved locally") {
      onDirtyChange(false);
    } else {
      onDirtyChange(true);
    }
    setSaveStatus(nextStatus);
    return true;
  }, [onDirtyChange, onSaveScene, setSaveStatus]);

  React.useEffect(() => {
    if (loadedSceneIdRef.current === activeScene.id) return;
    loadedSceneIdRef.current = activeScene.id;
    setContent(activeScene.content);
    contentRef.current = activeScene.content;
    revisionRef.current = 0;
    setDraftVersion(0);
    onDirtyChange(false);
    setSaveStatus("Saved locally");
  }, [activeScene, onDirtyChange, setSaveStatus]);

  React.useEffect(() => {
    onDirtyChange(dirty);
    if (!dirty && saveStatus !== "Saving…" && saveStatus !== "Saved locally") {
      setSaveStatus("Saved locally");
    }
  }, [dirty, onDirtyChange, saveStatus, setSaveStatus]);

  React.useEffect(() => {
    if (!dirty || autosaveDelayMs === null) return;

    const timeout = window.setTimeout(onRequestSave, autosaveDelayMs);
    return () => window.clearTimeout(timeout);
  }, [autosaveDelayMs, dirty, draftVersion, onRequestSave]);

  React.useEffect(() => {
    onRegisterPendingSave(saveCurrentScene);
    return () => onRegisterPendingSave(null);
  }, [onRegisterPendingSave, saveCurrentScene]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/88 backdrop-blur">
        <div className="mx-auto flex min-h-14 max-w-5xl items-center gap-3 px-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{activeScene.title}</p>
          </div>
          <Badge variant="outline">{saveStatus}</Badge>
          <Badge variant="outline">{formatNumber(draftWordCount)} words</Badge>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRequestSave}
            aria-label={saveStatus === "Save failed — Retry" ? "Retry save" : "Save"}
            disabled={!dirty || saveStatus === "Saving…"}
          >
            <Save className="size-4" />
          </Button>
          <Button variant="outline" onClick={onExit} aria-label="Exit focus mode">
            <X className="size-4" />
            Exit focus
          </Button>
        </div>
      </header>
      <section className="mx-auto max-w-5xl px-4 py-8">
        <div className="mx-auto max-w-3xl rounded-lg border bg-editor p-5 shadow-paper sm:p-10">
          <Textarea
            aria-label="Scene manuscript"
            ref={manuscriptRef}
            data-scene-id={activeScene.id}
            onSelect={event => { const input = event.currentTarget; setManuscriptSelection({ sceneId: activeScene.id, start: input.selectionStart, end: input.selectionEnd }); }}
            value={content}
            onChange={(event) => {
              const nextContent = event.target.value;
              contentRef.current = nextContent;
              setContent(nextContent);
              revisionRef.current += 1;
              setDraftVersion((version) => version + 1);
              onDirtyChange(true);
              setSaveStatus("Unsaved changes");
            }}
            className="manuscript-editor min-h-[calc(100vh-12rem)] border-0 bg-transparent p-0 font-typewriter leading-9 text-editor-foreground shadow-none focus-visible:ring-0"
            style={{ fontSize: `${editorFontSize}px` }}
          />
        </div>
        {loadedSceneIdRef.current === activeScene.id ? <SelectionCaptureMenu key={`${activeScene.id}:${manuscriptSelection.start}:${manuscriptSelection.end}`} target={noteTarget} manuscriptRef={manuscriptRef} selection={manuscriptSelection} onRefresh={onRefreshMetadata} onNotify={onNotify} /> : null}
      </section>
    </main>
  );
}

function ReaderScreen({
  navigation,
  readerFontSize,
  readerWidth,
  isFocusMode,
  onNavigationChange,
  onReaderFontSizeChange,
  onReaderWidthChange,
  onResetReaderPreferences,
  onFocus,
  onExitFocus,
  onFocusOverlayChange,
  onRegisterFocusToggle,
  onOpenStructure,
  onOpenEditor
}: {
  navigation: ReaderNavigationState;
  readerFontSize: number;
  readerWidth: number;
  isFocusMode: boolean;
  onNavigationChange: (navigation: ReaderNavigationState) => void;
  onReaderFontSizeChange: (value: number) => void;
  onReaderWidthChange: (value: number) => void;
  onResetReaderPreferences: () => void;
  onFocus: () => void;
  onExitFocus: () => void;
  onFocusOverlayChange: (open: boolean) => void;
  onRegisterFocusToggle: (handler: (() => void) | null) => void;
  onOpenStructure: () => void;
  onOpenEditor: () => void;
}) {
  const data = useStudioData();
  const activeChapter = getActiveChapter(data);
  const activeScene = getActiveScene(data);
  const activeVolume = data.volumes.find((volume) => volume.id === activeChapter.volumeId);
  const readerScope = navigation.scope;
  const readerTargetId = navigation.targetId;
  const [readerDocument, setReaderDocument] = React.useState<{
    novel?: { id: string; title: string };
    volumes?: Array<{ id: string; title: string }>;
    chapters?: Array<{ id: string; title: string }>;
    scenes: Array<{ id: string; chapterId?: string; title: string; content: string; revision?: number }>;
  } | null>(null);
  const [readerOutline, setReaderOutline] = React.useState<ReaderOutline | null>(null);
  const [savedProgress, setSavedProgress] = React.useState<ResolvedReadingProgress | null>(null);
  const [readerProgressUnavailable, setReaderProgressUnavailable] = React.useState(false);
  const [currentReaderSceneId, setCurrentReaderSceneId] = React.useState(activeScene.id);
  const [readingRatio, setReadingRatio] = React.useState(0);
  const [readerLoadError, setReaderLoadError] = React.useState("");
  const [focusPanel, setFocusPanel] = React.useState<null | "toc" | "preferences">(null);
  const [restoreRequest, setRestoreRequest] = React.useState<{ sceneId: string; ratio: number; nonce: number } | null>(null);
  const readerRootRef = React.useRef<HTMLDivElement | null>(null);
  const readerSectionRefs = React.useRef(new Map<string, HTMLElement>());
  const readerPositionRef = React.useRef({ sceneId: activeScene.id, ratio: 0 });
  const pendingFocusPositionRef = React.useRef<{ sceneId: string; ratio: number } | null>(null);
  const pendingAppearancePositionRef = React.useRef<{ sceneId: string; ratio: number } | null>(null);
  const previousFocusModeRef = React.useRef(isFocusMode);
  const previousAppearanceRef = React.useRef({ fontSize: readerFontSize, width: readerWidth });
  const pendingProgressRef = React.useRef<{ novelId: string; preferredScope: typeof readerScope; sceneId: string; positionRatio: number } | null>(null);
  const progressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReaderScrollIntentRef = React.useRef(0);
  const readerHierarchy = React.useMemo(
    () => readerOutline ?? {
      novel: { id: data.settings.activeNovelId, title: "" },
      volumes: data.volumes,
      chapters: data.chapters,
      scenes: data.scenes.map((scene) => ({
        id: scene.id,
        chapterId: scene.chapterId,
        title: scene.title,
        sortOrder: scene.sortOrder,
        archived: scene.archived
      }))
    },
    [data.chapters, data.scenes, data.settings.activeNovelId, data.volumes, readerOutline]
  );
  const readerScenes = React.useMemo(
    () => readerDocument
      ? readerDocument.scenes
      : activeScene.id
        ? [{ id: activeScene.id, title: activeScene.title, content: activeScene.content }]
        : [],
    [activeScene.content, activeScene.id, activeScene.title, readerDocument]
  );
  const scopeUnits = React.useMemo(
    () => getReaderScopeUnits(
      readerScope,
      data.settings.activeNovelId,
      readerHierarchy.volumes,
      readerHierarchy.chapters,
      readerHierarchy.scenes
    ),
    [data.settings.activeNovelId, readerHierarchy, readerScope]
  );
  const adjacentUnits = getReaderAdjacentUnits(scopeUnits, readerTargetId);
  const currentReaderScene = readerScenes.find((scene) => scene.id === currentReaderSceneId) ?? readerScenes[0];
  const readerTargetTitle = currentReaderScene?.title
    ?? (readerScope === "chapter"
      ? readerDocument?.chapters?.find((chapter) => chapter.id === readerTargetId)?.title
      : readerScope === "volume"
        ? readerDocument?.volumes?.find((volume) => volume.id === readerTargetId)?.title
        : readerScope === "novel"
          ? readerDocument?.novel?.title
          : undefined)
    ?? activeChapter.title
    ?? "Reader";
  const currentReaderSceneIndex = Math.max(
    0,
    readerScenes.findIndex((scene) => scene.id === currentReaderScene?.id)
  );
  const readingProgressPercent = readerScenes.length
    ? Math.round(((currentReaderSceneIndex + readingRatio) / readerScenes.length) * 100)
    : 0;
  readerPositionRef.current = { sceneId: currentReaderSceneId, ratio: readingRatio };

  const navigateToReaderTarget = (targetId: string | null) => {
    if (!targetId) return;
    onNavigationChange({ scope: readerScope, targetId });
    setReadingRatio(0);
  };

  React.useLayoutEffect(() => {
    const sections = readerRootRef.current?.querySelectorAll<HTMLElement>("[data-reader-scene-id]") ?? [];
    readerSectionRefs.current = new Map(
      Array.from(sections, (section) => [section.dataset.readerSceneId ?? "", section])
        .filter(([sceneId]) => Boolean(sceneId)) as Array<[string, HTMLElement]>
    );
  }, [readerScenes]);

  const captureCurrentReaderPosition = React.useCallback(() => {
    const marker = Math.min(window.innerHeight * 0.35, 260);
    const visibleSections = Array.from(
      readerRootRef.current?.querySelectorAll<HTMLElement>("[data-reader-scene-id]") ?? []
    ).map((element) => ({ sceneId: element.dataset.readerSceneId ?? "", element }));
    if (visibleSections.length === 0) return readerPositionRef.current;
    const activeEntry = visibleSections.reduce((closest, entry) =>
      entry.element.getBoundingClientRect().top <= marker ? entry : closest
    , visibleSections[0]);
    const rect = activeEntry.element.getBoundingClientRect();
    return {
      sceneId: activeEntry.sceneId,
      ratio: clampReadingRatio((marker - rect.top) / Math.max(rect.height, 1))
    };
  }, []);

  const restoreReaderPosition = React.useCallback((position: { sceneId: string; ratio: number }) => {
    const section = readerSectionRefs.current.get(position.sceneId);
    if (!section) return;
    const marker = Math.min(window.innerHeight * 0.35, 260);
    section.scrollIntoView({ block: "start" });
    window.scrollBy({
      top: section.getBoundingClientRect().height * clampReadingRatio(position.ratio) - marker,
      behavior: "instant"
    });
  }, []);

  const changeReaderFontSize = (value: number) => {
    pendingAppearancePositionRef.current = captureCurrentReaderPosition();
    onReaderFontSizeChange(value);
  };

  const changeReaderWidth = (value: number) => {
    pendingAppearancePositionRef.current = captureCurrentReaderPosition();
    onReaderWidthChange(value);
  };

  const resetReaderPreferences = () => {
    pendingAppearancePositionRef.current = captureCurrentReaderPosition();
    onResetReaderPreferences();
  };

  const toggleReadingFocus = React.useCallback(() => {
    const position = captureCurrentReaderPosition();
    pendingFocusPositionRef.current = position;
    setFocusPanel(null);
    if (isFocusMode) onExitFocus();
    else onFocus();
  }, [captureCurrentReaderPosition, isFocusMode, onExitFocus, onFocus]);

  React.useEffect(() => {
    onRegisterFocusToggle(toggleReadingFocus);
    return () => onRegisterFocusToggle(null);
  }, [onRegisterFocusToggle, toggleReadingFocus]);

  React.useEffect(() => {
    onFocusOverlayChange(focusPanel !== null);
  }, [focusPanel, onFocusOverlayChange]);

  React.useEffect(
    () => () => onFocusOverlayChange(false),
    [onFocusOverlayChange]
  );

  React.useLayoutEffect(() => {
    if (previousFocusModeRef.current === isFocusMode) return;
    previousFocusModeRef.current = isFocusMode;
    const position = pendingFocusPositionRef.current ?? readerPositionRef.current;
    pendingFocusPositionRef.current = null;
    restoreReaderPosition(position);
  }, [isFocusMode, restoreReaderPosition]);

  React.useLayoutEffect(() => {
    const previous = previousAppearanceRef.current;
    if (previous.fontSize === readerFontSize && previous.width === readerWidth) return;
    previousAppearanceRef.current = { fontSize: readerFontSize, width: readerWidth };
    const position = pendingAppearancePositionRef.current;
    pendingAppearancePositionRef.current = null;
    if (position) restoreReaderPosition(position);
  }, [readerFontSize, readerWidth, restoreReaderPosition]);

  const flushReadingProgress = React.useCallback(() => {
    if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    progressTimerRef.current = null;
    const pending = pendingProgressRef.current;
    pendingProgressRef.current = null;
    if (!pending) return;
    void fetch("/api/reader/progress", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pending),
      keepalive: true
    })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((progress: ResolvedReadingProgress | null) => {
        if (progress) setSavedProgress(progress);
        setReaderProgressUnavailable(false);
      })
      .catch(() => setReaderProgressUnavailable(true));
  }, []);

  const scheduleReadingProgress = React.useCallback((sceneId: string, positionRatio: number) => {
    if (!sceneId || !data.settings.activeNovelId) return;
    pendingProgressRef.current = {
      novelId: data.settings.activeNovelId,
      preferredScope: readerScope,
      sceneId,
      positionRatio: clampReadingRatio(positionRatio)
    };
    if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    progressTimerRef.current = setTimeout(flushReadingProgress, 750);
  }, [data.settings.activeNovelId, flushReadingProgress, readerScope]);

  const changeReaderScope = (scope: "scene" | "chapter" | "volume" | "novel") => {
    const units = getReaderScopeUnits(
      scope,
      data.settings.activeNovelId,
      readerHierarchy.volumes,
      readerHierarchy.chapters,
      readerHierarchy.scenes
    );
    const preferredTarget =
      scope === "scene"
        ? activeScene.id
        : scope === "chapter"
          ? activeChapter.id
          : scope === "volume"
            ? activeVolume?.id || ""
            : data.settings.activeNovelId;
    const targetId = units.includes(preferredTarget) ? preferredTarget : units[0] ?? "";
    if (!targetId) return;
    onNavigationChange({
      scope,
      targetId
    });
    setReadingRatio(0);
  };

  React.useEffect(() => {
    const controller = new AbortController();
    setSavedProgress(null);
    setReaderProgressUnavailable(false);
    if (!data.settings.activeNovelId) return () => controller.abort();
    void fetch(`/api/reader/progress?novelId=${encodeURIComponent(data.settings.activeNovelId)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((progress: ResolvedReadingProgress | null) => {
        setSavedProgress(progress);
        setReaderProgressUnavailable(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setReaderProgressUnavailable(true);
      });
    return () => controller.abort();
  }, [data.settings.activeNovelId]);

  React.useEffect(() => {
    const controller = new AbortController();
    setReaderOutline(null);
    if (!data.settings.activeNovelId) return () => controller.abort();
    void fetch(`/api/reader/outline?novelId=${encodeURIComponent(data.settings.activeNovelId)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((outline: ReaderOutline) => setReaderOutline(outline))
      .catch(() => undefined);
    return () => controller.abort();
  }, [data.settings.activeNovelId]);

  React.useEffect(() => {
    const controller = new AbortController();
    const targetId = readerTargetId;
    if (!targetId || !data.settings.activeNovelId) return () => controller.abort();
    setReaderLoadError("");
    setReaderDocument(null);
    void fetch(`/api/reader?novelId=${encodeURIComponent(data.settings.activeNovelId)}&scope=${readerScope}&targetId=${encodeURIComponent(targetId)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then(setReaderDocument)
      .catch(() => {
        if (controller.signal.aborted) return;
        setReaderDocument(null);
        setReaderLoadError("The selected reading document could not be loaded. The active scene remains visible.");
      });
    return () => controller.abort();
  }, [data.settings.activeNovelId, readerScope, readerTargetId]);

  React.useEffect(() => {
    if (!readerDocument?.scenes.length) return;
    const nextScene =
      readerScope === "scene"
        ? readerDocument.scenes.find((scene) => scene.id === readerTargetId)
        : readerDocument.scenes[0];
    if (!nextScene) return;
    setCurrentReaderSceneId(nextScene.id);
    setReadingRatio(0);
  }, [readerDocument, readerScope, readerTargetId]);

  React.useEffect(() => {
    const markScrollIntent = () => { lastReaderScrollIntentRef.current = Date.now(); };
    const markKeyboardScrollIntent = (event: KeyboardEvent) => {
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) markScrollIntent();
    };
    const onScroll = () => {
      const position = captureCurrentReaderPosition();
      setCurrentReaderSceneId(position.sceneId);
      setReadingRatio(position.ratio);
      if (Date.now() - lastReaderScrollIntentRef.current < 500) {
        scheduleReadingProgress(position.sceneId, position.ratio);
      }
    };
    window.addEventListener("wheel", markScrollIntent, { passive: true });
    window.addEventListener("touchmove", markScrollIntent, { passive: true });
    window.addEventListener("keydown", markKeyboardScrollIntent);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("wheel", markScrollIntent);
      window.removeEventListener("touchmove", markScrollIntent);
      window.removeEventListener("keydown", markKeyboardScrollIntent);
      window.removeEventListener("scroll", onScroll);
    };
  }, [captureCurrentReaderPosition, scheduleReadingProgress]);

  React.useEffect(() => {
    if (!restoreRequest) return;
    const frame = window.requestAnimationFrame(() => {
      const section = readerSectionRefs.current.get(restoreRequest.sceneId);
      if (!section) return;
      const marker = Math.min(window.innerHeight * 0.35, 260);
      section.scrollIntoView({ block: "start" });
      window.scrollBy({ top: section.getBoundingClientRect().height * clampReadingRatio(restoreRequest.ratio) - marker, behavior: "instant" });
      setCurrentReaderSceneId(restoreRequest.sceneId);
      setReadingRatio(clampReadingRatio(restoreRequest.ratio));
      setRestoreRequest(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [readerDocument, restoreRequest]);

  React.useEffect(() => {
    const onBeforeUnload = () => flushReadingProgress();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      flushReadingProgress();
    };
  }, [flushReadingProgress]);

  const continueReading = () => {
    if (!savedProgress) return;
    onNavigationChange({ scope: savedProgress.scope, targetId: savedProgress.targetId });
    setRestoreRequest({
      sceneId: savedProgress.resolvedSceneId,
      ratio: savedProgress.positionRatio,
      nonce: Date.now()
    });
  };

  const openReaderSceneFromFocus = (sceneId: string) => {
    onNavigationChange({ scope: "scene", targetId: sceneId });
    setCurrentReaderSceneId(sceneId);
    setReadingRatio(0);
    setRestoreRequest({ sceneId, ratio: 0, nonce: Date.now() });
    setFocusPanel(null);
  };

  return (
    <div
      ref={readerRootRef}
      className={cn(
        "grid gap-6",
        isFocusMode && "min-h-screen gap-0 bg-background text-foreground"
      )}
    >
      <div className="contents">
        {isFocusMode ? (
          <header
            className="sticky top-0 z-30 border-b border-current/10 bg-inherit/95 backdrop-blur motion-reduce:backdrop-blur-none"
            aria-label="Reading focus controls"
          >
            <div className="mx-auto flex min-h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
              <div className="min-w-0 flex-1">
                <p className="truncate font-serif text-base font-semibold sm:text-lg">
                  {readerTargetTitle}
                </p>
                <p className="text-xs opacity-70" aria-live="polite">
                  {readerProgressUnavailable
                    ? "Progress unavailable · reading remains available"
                    : `${readingProgressPercent}% of ${readerScope} · saved locally`}
                </p>
              </div>
              <Button variant="ghost" size="icon" aria-label={`Previous ${readerScope}`} disabled={!adjacentUnits.previousId} onClick={() => navigateToReaderTarget(adjacentUnits.previousId)} className="size-11 min-h-11 motion-reduce:transition-none">
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label={`Next ${readerScope}`} disabled={!adjacentUnits.nextId} onClick={() => navigateToReaderTarget(adjacentUnits.nextId)} className="size-11 min-h-11 motion-reduce:transition-none">
                <ChevronRight className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Open table of contents" onClick={() => setFocusPanel("toc")} className="size-11 min-h-11 motion-reduce:transition-none">
                <ListTree className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Open reading preferences" onClick={() => setFocusPanel("preferences")} className="size-11 min-h-11 motion-reduce:transition-none">
                <SlidersHorizontal className="size-4" />
              </Button>
              <Button variant="outline" onClick={toggleReadingFocus} aria-label="Exit reading focus" className="min-h-11 motion-reduce:transition-none">
                <X className="size-4" />
                <span className="hidden sm:inline">Exit focus</span>
              </Button>
            </div>
            <ProgressBar value={readingProgressPercent} label={`${readerScope} reading progress`} />
          </header>
        ) : (
          <SectionHeader
            eyebrow="Reader"
            title="Private ebook reader"
            description="Preview the complete novel, a volume, a chapter, or a single scene with local reading controls."
            action={
              <>
                <Button onClick={toggleReadingFocus}>
                  <Eye className="size-4" />
                  Reading focus
                </Button>
                <Button variant="outline" onClick={() => setFocusPanel("toc")}>
                  <ListTree className="size-4" />
                  Table of contents
                </Button>
              </>
            }
          />
        )}
      </div>

      <div className={cn(isFocusMode && "hidden")}>
        <Card>
          <CardContent className="grid min-w-0 gap-3 p-4 lg:grid-cols-[minmax(11rem,220px)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
            <div>
              <Label>Scope</Label>
              <Select value={readerScope} onValueChange={(value) => changeReaderScope(value as typeof readerScope)}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {readerScopes.map((scope, index) => (
                    <SelectItem
                      key={scope}
                      value={["novel", "volume", "chapter", "scene"][index]}
                      disabled={getReaderScopeUnits(
                        ["novel", "volume", "chapter", "scene"][index] as typeof readerScope,
                        data.settings.activeNovelId,
                        readerHierarchy.volumes,
                        readerHierarchy.chapters,
                        readerHierarchy.scenes
                      ).length === 0}
                    >
                      {scope}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="hidden min-w-0 lg:block">
              <ControlSlider label="Font size" value={readerFontSize} min={readerPreferenceRanges.fontSize.min} max={readerPreferenceRanges.fontSize.max} suffix="px" onChange={changeReaderFontSize} />
            </div>
            <div className="hidden min-w-0 lg:block">
              <ControlSlider label="Reading width" value={readerWidth} min={readerPreferenceRanges.width.min} max={readerPreferenceRanges.width.max} suffix="px" onChange={changeReaderWidth} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="min-h-11 lg:hidden" onClick={() => setFocusPanel("preferences")}>
                <SlidersHorizontal className="size-4" />
                Preferences
              </Button>
              <Button variant="outline" disabled={!savedProgress} onClick={continueReading}>
                <BookOpen className="size-4" />
                Continue reading
              </Button>
              <Button variant="ghost" onClick={resetReaderPreferences}>Reset</Button>
            </div>
            <p className="text-xs text-muted-foreground lg:col-span-4" aria-live="polite">
              {readerProgressUnavailable
                ? "Reading progress is temporarily unavailable. Reading remains available."
                : savedProgress
                ? `Saved locally · ${Math.round(savedProgress.positionRatio * 100)}% in ${savedProgress.usedFallback ? "the nearest readable scene" : "the current scene"}`
                : "Scroll to create a local reading position for this novel."}
            </p>
          </CardContent>
        </Card>
      </div>

      {readerLoadError ? (
        <p role="alert" className={cn("rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm", isFocusMode && "mx-auto mt-6 w-[calc(100%-2rem)] max-w-3xl")}>
          {readerLoadError}
        </p>
      ) : null}

      <Card className={cn("overflow-hidden", isFocusMode && "rounded-none border-0 bg-transparent shadow-none")}>
        <CardHeader className={cn("border-b", isFocusMode && "hidden")}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[1.05rem] font-semibold leading-snug tracking-normal">
                {readerTargetTitle}
              </h2>
              <CardDescription>Local reading progress · {readingProgressPercent}% of {readerScope}</CardDescription>
            </div>
          </div>
          <ProgressBar value={readingProgressPercent} label={`${readerScope} reading progress`} />
        </CardHeader>
        <CardContent
          className={cn(
            "mx-auto my-6 w-full min-w-0 rounded-lg border p-6 shadow-inner sm:p-10",
            "bg-editor text-editor-foreground",
            isFocusMode && "my-0 rounded-none border-0 px-5 py-12 shadow-none sm:px-10 sm:py-16"
          )}
          style={{ maxWidth: `${readerWidth}px`, fontSize: `${readerFontSize}px` }}
        >
          {readerDocument && readerScenes.length === 0 ? (
            <section className="mx-auto max-w-xl py-10 text-center" aria-labelledby="empty-reader-title">
              {isFocusMode ? (
                <h1 id="empty-reader-title" className="font-serif text-3xl font-semibold tracking-normal">Nothing to read here yet</h1>
              ) : (
                <h3 id="empty-reader-title" className="font-serif text-2xl font-semibold tracking-normal">Nothing to read here yet</h3>
              )}
              <p className="mt-3 text-base leading-7 opacity-75">
                This {readerScope} has no readable scenes. Return to Structure or Editor to choose the next step.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Button variant="outline" className="min-h-11" onClick={onOpenStructure}>Back to Structure</Button>
                <Button className="min-h-11" onClick={onOpenEditor}>Open Editor</Button>
              </div>
            </section>
          ) : (
            <article className="space-y-6 leading-9">
              {readerScenes.map((scene, sceneIndex) => {
                const SceneHeading = isFocusMode && sceneIndex === 0 ? "h1" : isFocusMode ? "h2" : "h3";
                return (
                  <section
                    key={scene.id}
                    data-reader-scene-id={scene.id}
                    ref={(element) => {
                      if (element) readerSectionRefs.current.set(scene.id, element);
                      else readerSectionRefs.current.delete(scene.id);
                    }}
                    className="space-y-4"
                  >
                    <SceneHeading className="font-serif text-3xl font-semibold tracking-normal">{scene.title}</SceneHeading>
                    {scene.content.split("\n\n").map((paragraph, index) => (
                      <p key={`${scene.id}-${index}`}>{paragraph}</p>
                    ))}
                  </section>
                );
              })}
            </article>
          )}
        </CardContent>
        <CardFooter className={cn("mx-auto flex w-full flex-wrap justify-between gap-2 border-t p-4", isFocusMode && "border-current/10 bg-inherit px-5 sm:px-10")} style={{ maxWidth: `${readerWidth}px` }}>
          <Button variant="outline" className="min-h-11" disabled={!adjacentUnits.previousId} onClick={() => navigateToReaderTarget(adjacentUnits.previousId)}>
            <ChevronLeft className="size-4" />
            Previous
          </Button>
          <Button variant="outline" className="min-h-11" disabled={!adjacentUnits.nextId} onClick={() => navigateToReaderTarget(adjacentUnits.nextId)}>
            Next
            <ChevronRight className="size-4" />
          </Button>
        </CardFooter>
      </Card>

      <Dialog open={focusPanel !== null} onOpenChange={(open) => { if (!open) setFocusPanel(null); }}>
        <DialogContent className="max-h-[calc(100vh-2rem)] max-w-xl min-w-0 overflow-y-auto motion-reduce:duration-0">
          {focusPanel === "toc" ? (
            <>
              <DialogHeader>
                <DialogTitle>Table of contents</DialogTitle>
                <DialogDescription>Jump to a scene without loading manuscript bodies into the table of contents.</DialogDescription>
              </DialogHeader>
              <div role="tree" aria-label="Reader table of contents" className="max-h-[60vh] overflow-y-auto rounded-md border bg-background p-3">
                {readerHierarchy.volumes.map((volume) => (
                  <div key={volume.id} role="treeitem" aria-expanded="true" aria-selected="false" className="mb-3">
                    <p className="font-semibold">{volume.title}</p>
                    <div role="group" className="mt-2 space-y-2 pl-3">
                      {readerHierarchy.chapters.filter((chapter) => chapter.volumeId === volume.id).map((chapter) => (
                        <div key={chapter.id} role="treeitem" aria-expanded="true" aria-selected="false">
                          <p className="px-2 py-1 text-sm font-medium">{chapter.title}</p>
                          <div role="group" className="space-y-1 pl-3">
                            {readerHierarchy.scenes.filter((scene) => scene.chapterId === chapter.id).map((scene) => (
                              <button
                                key={scene.id}
                                type="button"
                                role="treeitem"
                                aria-selected={scene.id === currentReaderSceneId}
                                aria-current={scene.id === currentReaderSceneId ? "page" : undefined}
                                className={cn("block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none", scene.id === currentReaderSceneId && "bg-secondary font-medium")}
                                onClick={() => openReaderSceneFromFocus(scene.id)}
                              >
                                {scene.title}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : focusPanel === "preferences" ? (
            <>
              <DialogHeader>
                <DialogTitle>Reading preferences</DialogTitle>
                <DialogDescription>Adjust the book surface without leaving the Reader.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-5">
                <ControlSlider label="Font size" value={readerFontSize} min={readerPreferenceRanges.fontSize.min} max={readerPreferenceRanges.fontSize.max} suffix="px" onChange={changeReaderFontSize} />
                <ControlSlider label="Reading width" value={readerWidth} min={readerPreferenceRanges.width.min} max={readerPreferenceRanges.width.max} suffix="px" onChange={changeReaderWidth} />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={resetReaderPreferences}>Reset to defaults</Button>
                <Button onClick={() => setFocusPanel(null)}>Return to reading</Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ControlSlider({
  label,
  value,
  min,
  max,
  suffix,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  const inputId = React.useId();

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Label htmlFor={inputId}>{label}</Label>
        <output htmlFor={inputId} className="text-xs text-muted-foreground" aria-live="polite">
          {value}
          {suffix}
        </output>
      </div>
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-valuetext={`${value}${suffix}`}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-10 w-full accent-primary"
      />
    </div>
  );
}

function PlacesScreen({
  onScenesChanged,
  places,
  catalogState,
  onCatalogChange,
  onClearFilters,
  onAddPlace,
  onEditPlace,
  selectedPlaceId
}: {
  onScenesChanged: () => Promise<void>;
  places: PlaceSummary[];
  catalogState: PlaceCatalogState;
  onCatalogChange: (changes: Partial<PlaceCatalogState>) => void;
  onClearFilters: () => void;
  onAddPlace: () => void;
  onEditPlace: (place: Location) => void;
  selectedPlaceId: string | null;
}) {
  const data = useStudioData();
  const novelId = getCurrentNovel(data).id;
  const selectedPlace = resolvePlaceSelection(novelId, selectedPlaceId, data.locations);
  const catalogKey = `${novelId}:${serializePlaceCatalogState(catalogState)}`;
  const [pageWindow, setPageWindow] = React.useState({ key: catalogKey, size: 50 });
  const visibleCount = pageWindow.key === catalogKey ? pageWindow.size : 50;
  const searchInput = React.useRef<HTMLInputElement>(null);
  const catalogRef = React.useRef<HTMLDivElement>(null);
  const firstAddedPlace = React.useRef<string | null>(null);
  const previousSelection = React.useRef(selectedPlaceId);
  React.useEffect(() => {
    if (!selectedPlaceId && previousSelection.current) {
      const link = catalogRef.current?.querySelector<HTMLAnchorElement>(`a[data-place-id="${CSS.escape(previousSelection.current)}"]`);
      (link ?? searchInput.current)?.focus();
    }
    previousSelection.current = selectedPlaceId;
  }, [selectedPlaceId]);
  React.useEffect(() => {
    if (!firstAddedPlace.current) return;
    catalogRef.current?.querySelector<HTMLAnchorElement>(`a[data-place-id="${CSS.escape(firstAddedPlace.current)}"]`)?.focus();
    firstAddedPlace.current = null;
  }, [visibleCount]);

  return (
    <div className="grid min-w-0 gap-6 [overflow-wrap:anywhere]">
      <div className={selectedPlaceId ? "hidden xl:block" : undefined}>
      <SectionHeader
        eyebrow="Places"
        title="Location bible"
        description="Keep regions, rules, visual notes, first appearances, and story events linked to each place."
        action={
          <Button onClick={onAddPlace}>
            <Plus className="size-4" />
            Add place
          </Button>
        }
      />
      </div>

      <Card className={selectedPlaceId ? "hidden xl:block" : undefined}>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_160px_150px_160px_auto]">
          <div className="relative min-w-0 sm:col-span-2 xl:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={catalogState.query}
              ref={searchInput}
              onChange={(event) => onCatalogChange({ query: event.target.value })}
              placeholder="Search places"
              aria-label="Search places by name"
              maxLength={120}
              className="pl-9"
            />
          </div>
          <Select value={catalogState.type} onValueChange={(value) => onCatalogChange({ type: value as PlaceCatalogState["type"] })}>
            <SelectTrigger aria-label="Filter place type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {placeTypes.map((item) => (
                <SelectItem key={item} value={item}>
                  {placeTypeLabels[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={catalogState.status} onValueChange={(value) => onCatalogChange({ status: value as PlaceCatalogState["status"] })}>
            <SelectTrigger aria-label="Filter place status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {placeStatuses.map((code) => <SelectItem key={code} value={code}>{placeStatusLabels[code]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={catalogState.sort} onValueChange={(value) => onCatalogChange({ sort: value as PlaceSort })}>
            <SelectTrigger aria-label="Sort places"><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(placeSortLabels) as PlaceSort[]).map((sort) => <SelectItem key={sort} value={sort}>{placeSortLabels[sort]}</SelectItem>)}</SelectContent>
          </Select>
          <Button type="button" variant="outline" onClick={onClearFilters}>Clear filters</Button>
        </CardContent>
      </Card>

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div ref={catalogRef} className={cn("min-w-0 space-y-4", selectedPlaceId && "hidden xl:block")}>
        {places.length ? (
          <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {places.slice(0, visibleCount).map((place) => (
              <Card key={place.id} className="min-w-0">
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-start gap-3">
                    <div className="grid size-12 shrink-0 place-items-center rounded-md border bg-editor text-primary">
                      <MapIcon className="size-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="break-words font-semibold">
                            <Link data-place-id={place.id} href={routeForPlaceCatalog(place.novelId, catalogState, place.id)} aria-current={selectedPlace?.id === place.id ? "page" : undefined} className="underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring">{place.name}</Link>
                          </h3>
                          <p className="text-sm text-muted-foreground">{place.parent?.name ?? "No parent place"}</p>
                        </div>
                        <Badge variant="outline">{placeTypeLabels[place.type]}</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <FieldLine label="First appearance" value={place.firstAppearance || "Not linked yet"} />
                    <FieldLine label="Status" value={placeStatusLabels[place.status]} />
                    <FieldLine label="Scene count" value={place.sceneCount ?? 0} />
                    <FieldLine label="Characters" value={place.characterCount} />
                    <FieldLine label="Events" value={place.eventCount} />
                    <FieldLine label="Children" value={place.childCount} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <PlaceCatalogEmptyState
            totalCount={data.locations.length}
            resultCount={places.length}
            onlyArchived={data.locations.length > 0 && data.locations.every((place) => place.status === "archived")}
            onAddPlace={onAddPlace}
            onClearFilters={onClearFilters}
            onShowArchived={() => onCatalogChange({ ...defaultPlaceCatalogState, status: "archived" })}
          />
        )}
        {places.length ? <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="text-sm text-muted-foreground">Showing {Math.min(visibleCount, places.length)} of {places.length} places</p>
          {visibleCount < places.length ? <Button type="button" variant="outline" onClick={() => {
            firstAddedPlace.current = places[visibleCount].id;
            setPageWindow({ key: catalogKey, size: visibleCount + 50 });
          }}>Show more places</Button> : null}
        </div> : null}
        </div>

        {selectedPlace ? <div className="min-w-0 space-y-3">
          {!places.some((place) => place.id === selectedPlace.id) ? <p role="status" className="text-sm text-muted-foreground">The selected place is outside the current catalog filters. Its detail remains available.</p> : null}
          <PlaceDetailLoader key={selectedPlace.id} summary={selectedPlace} catalogState={catalogState}>
            {(place) => <PlaceDetailPanel place={place} catalogState={catalogState} onEdit={() => onEditPlace(place)} onScenesChanged={onScenesChanged} />}
          </PlaceDetailLoader>
        </div> : selectedPlaceId ? <section aria-label="Place unavailable" className="min-w-0 space-y-3">
          <EmptyState icon={MapIcon} title="Place unavailable" description="This place is no longer available in this novel. Choose another place from the catalog." />
          <Link href={routeForPlaceCatalog(novelId, catalogState)} className="text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">Back to catalog</Link>
        </section> : places.length ? <EmptyState icon={MapIcon} title="Select a place" description="Choose a place from the catalog to open its detail and related entities." /> : null}
      </div>
    </div>
  );
}

function PlaceDetailPanel({ place, catalogState, onEdit, onScenesChanged }: { place: Location; catalogState: PlaceCatalogState; onEdit: () => void; onScenesChanged: () => Promise<void> }) {
  const data = useStudioData();
  const titleRef = React.useRef<HTMLHeadingElement | null>(null);
  const titleId = React.useId();
  React.useEffect(() => { titleRef.current?.focus(); }, [place.id]);
  const hierarchy = React.useMemo(() => getPlaceHierarchy(place.novelId, place.id, data.locations), [place.novelId, place.id, data.locations]);
  const parent = data.locations.find((candidate) => candidate.id === place.parentPlaceId && candidate.novelId === place.novelId);

  return (
    <Card role="region" aria-labelledby={titleId} className="min-w-0 break-words">
      <CardHeader>
        <Link href={routeForPlaceCatalog(place.novelId, catalogState)} className="text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">Back to catalog</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle ref={titleRef} id={titleId} tabIndex={-1} className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{place.name}</CardTitle>
          <div className="flex flex-wrap gap-2"><AddStoryNoteButton target={{ novelId: place.novelId, type: "Place", id: place.id, title: place.name }} /><Button type="button" variant="outline" size="sm" onClick={onEdit}>Edit place</Button></div>
        </div>
        <CardDescription>
          {placeTypeLabels[place.type]} · {place.region}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <StoryNotes target={{ novelId: place.novelId, type: "Place", id: place.id, title: place.name }} />
        <nav aria-label="Place hierarchy">
          <ol className="flex flex-wrap items-center gap-1 text-sm [overflow-wrap:anywhere]">
            {hierarchy.breadcrumb.map((ancestor, index) => (
              <li key={ancestor.id} className="min-w-0">
                {index > 0 ? <span aria-hidden="true" className="mx-1">→</span> : null}
                {ancestor.id === place.id ? <span aria-current="page">{ancestor.name}</span> : <Link href={routeForPlaceCatalog(ancestor.novelId, catalogState, ancestor.id)} className="text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">{ancestor.name}</Link>}
                {ancestor.status === "archived" ? <span className="text-muted-foreground"> (Archived)</span> : null}
              </li>
            ))}
          </ol>
        </nav>
        {hierarchy.issue ? <p role="status" className="text-sm text-destructive">{hierarchy.issue}</p> : null}
        <FieldLine label="Children" value={hierarchy.children.length ? <ul className="space-y-1 [overflow-wrap:anywhere]">
          {hierarchy.children.map((child) => <li key={child.id}><Link href={routeForPlaceCatalog(child.novelId, catalogState, child.id)} className="text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">{child.name}</Link>{child.status === "archived" ? " (Archived)" : ""}</li>)}
        </ul> : "No child places yet"} />
        <FieldLine label="Status" value={placeStatusLabels[place.status]} />
        <PlaceLifecycle key={place.id} place={place} catalogState={catalogState} onChanged={onScenesChanged} />
        <FieldLine label="Description" value={place.description} />
        <FieldLine label="Region" value={place.region} />
        <FieldLine label="Importance" value={place.importance} />
        <FieldLine label="Visual description" value={place.visualNotes} />
        <FieldLine label="Atmosphere" value={place.atmosphere} />
        <FieldLine label="Rules / Characteristics" value={place.rules} />
        <FieldLine label="Notes" value={<span className="whitespace-pre-wrap">{place.notes}</span>} />
        <FieldLine label="Parent place" value={parent ? <Link href={routeForPlaceCatalog(parent.novelId, catalogState, parent.id)} className="text-primary hover:underline">{parent.name}</Link> : place.parentPlaceId ? "Parent place unavailable" : "None"} />
        <FieldLine label="First appearance" value={place.firstAppearance || "Not linked yet"} />
        <FieldLine label="Scene count" value={place.sceneCount ?? 0} />
        <PlaceScenes key={place.id} place={place} onChanged={onScenesChanged} />
        <PlaceCharacters key={place.id} place={place} characters={data.characters} links={data.characterPlaceLinks} onChanged={onScenesChanged} />
        <PlaceStoryEvents key={place.id} place={place} events={data.timelineEvents} onChanged={onScenesChanged} />
      </CardContent>
    </Card>
  );
}

function RelationshipsScreen({ catalog, onCatalogChange, onAddRelationship, onChanged }: {
  catalog: RelationshipCatalogState;
  onCatalogChange: (changes: Partial<RelationshipCatalogState>) => void;
  onAddRelationship: (type?: string) => void; onChanged: () => Promise<void>;
}) {
  const data = useStudioData();
  const novelId = getCurrentNovel(data).id;
  const sinceOptions = React.useMemo(() => relationshipSinceOptions(novelId, data.volumes, data.chapters, data.scenes), [novelId, data.volumes, data.chapters, data.scenes]);
  const characters = visibleGraphCharacters(novelId, data.characters, catalog.spoilers);
  return <div className="grid min-w-0 gap-4">
    <SectionHeader eyebrow="Relationships" title="Character relationship map" description="Explore character connections and their story context."
      action={<Button onClick={() => onAddRelationship()}><Plus className="size-4" />Add relationship</Button>} />
    <RelationshipLibrary onChoose={onAddRelationship} />
    <section className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Relationship filters">
      <div className="grid gap-2"><Label htmlFor="relationships-category">Category</Label>
        <Select value={catalog.category} onValueChange={(category) => onCatalogChange({ category, type: "all" })}>
          <SelectTrigger id="relationships-category"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All categories</SelectItem>{Object.entries(relationshipCategories).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid gap-2"><Label htmlFor="relationships-type">Type</Label>
        <Select value={catalog.type} onValueChange={(type) => onCatalogChange({ type })}>
          <SelectTrigger id="relationships-type"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All types</SelectItem>{relationshipDefinitions.map((type) => <SelectItem key={type.key} value={type.key}>{type.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid gap-2"><Label htmlFor="relationships-character">Character</Label>
        <Select value={catalog.character} onValueChange={(character) => onCatalogChange({ character })}>
          <SelectTrigger id="relationships-character"><SelectValue placeholder="Character unavailable" /></SelectTrigger>
          <SelectContent><SelectItem value="All characters">All characters</SelectItem>{characters.map((character) => <SelectItem key={character.id} value={character.id}>{character.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid gap-2"><Label htmlFor="relationships-direction">Direction</Label>
        <Select value={catalog.direction} onValueChange={(direction) => onCatalogChange({ direction: direction as RelationshipCatalogState["direction"] })}>
          <SelectTrigger id="relationships-direction"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All directions</SelectItem><SelectItem value="directional">Directional</SelectItem><SelectItem value="symmetric">Symmetric</SelectItem></SelectContent>
        </Select>
      </div>
      <div className="grid gap-2"><Label htmlFor="relationships-lifecycle">Visibility</Label>
        <Select value={catalog.lifecycle} onValueChange={(lifecycle) => onCatalogChange({ lifecycle: lifecycle as RelationshipCatalogState["lifecycle"] })}>
          <SelectTrigger id="relationships-lifecycle"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="archived">Archived</SelectItem><SelectItem value="all">Active and archived</SelectItem></SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Switch id="relationship-show-spoilers" checked={catalog.spoilers} onCheckedChange={(spoilers) => onCatalogChange({ spoilers, ...(!spoilers ? { character: "All characters" } : {}) })} />
        <Label htmlFor="relationship-show-spoilers">Show spoilers</Label>
        <Button variant="outline" onClick={() => onCatalogChange(defaultRelationshipCatalog)}>Clear filters</Button>
      </div>
    </section>
    <RelationshipCatalogLoader novelId={novelId} showSpoilers={catalog.spoilers} lifecycle={catalog.lifecycle} refreshKey={data.relationships}>
      {(relationships) => <RelationshipExplorer key={`${novelId}:${serializeRelationshipCatalog(catalog)}`} novelId={novelId} characters={data.characters} relationships={filterRelationships(relationships, catalog)}
      showSpoilers={catalog.spoilers} focusId={catalog.character} sinceOptions={sinceOptions}
      onFocusCharacter={(character) => onCatalogChange({ character })} onChanged={onChanged} onClearFilters={() => onCatalogChange(defaultRelationshipCatalog)} />}
    </RelationshipCatalogLoader>
  </div>;
}


function TimelineScreen({ eventId, ready, onAddEvent, onChanged }: {
  eventId?: string; ready: boolean; onAddEvent: () => void; onChanged: () => Promise<void>;
}) {
  const data = useStudioData(), params = useSearchParams(), router = useRouter();
  const novelId = getCurrentNovel(data).id;
  const catalog = normalizeTimelineCatalog(parseTimelineCatalog(new URLSearchParams(params.toString())), novelId, data);
  const query = timelineCatalogQuery(catalog);
  React.useEffect(() => {
    if (ready && params.toString() !== query) router.replace(timelineCatalogRoute(novelId, catalog, eventId), { scroll: false });
  }, [params, query, router, novelId, eventId, catalog, ready]);
  if (!ready) return <p role="status">Waiting for novel data…</p>;
  return <TimelineCatalogLoader novelId={novelId} selectedId={eventId} showSpoilers={catalog.spoilers} showArchived={catalog.archived} refreshKey={data.timelineEvents}>
    {events => <TimelineCatalogScreen eventId={eventId} events={events} catalog={catalog}
      onFilterChange={changes => router.replace(timelineCatalogRoute(novelId, normalizeTimelineCatalog({ ...catalog, ...changes }, novelId, data), eventId), { scroll: false })}
      onClear={() => router.replace(timelineCatalogRoute(novelId, defaultTimelineCatalog), { scroll: false })}
      onAddEvent={onAddEvent} onChanged={onChanged} />}
  </TimelineCatalogLoader>;
}

function TimelineCatalogScreen({ eventId, events, catalog, onFilterChange, onClear, onAddEvent, onChanged }: {
  eventId?: string; events: import("@/lib/studio-domain").TimelineEventSummary[]; catalog: TimelineCatalogState;
  onFilterChange: (changes: Partial<TimelineCatalogState>) => void; onClear: () => void;
  onAddEvent: () => void; onChanged: () => Promise<void>;
}) {
  const data = useStudioData();
  const selectedTitle = React.useRef<HTMLHeadingElement | null>(null);
  const novelId = getCurrentNovel(data).id, showSpoilers = catalog.spoilers;
  const selectedEvent = events.find(event => event.id === eventId && event.novelId === novelId && (showSpoilers || !event.isSpoiler));
  const storyOptions = React.useMemo(() => relationshipSinceOptions(novelId, data.volumes, data.chapters, data.scenes), [novelId, data]);
  React.useEffect(() => { if (selectedEvent) selectedTitle.current?.focus(); }, [selectedEvent]);
  const filteredEvents = filterTimelineEvents(events, novelId, catalog);
  const hasVisibleEvents = events.some(event => event.novelId === novelId && (showSpoilers || !event.isSpoiler));
  const volumes = data.volumes.filter(volume => volume.novelId === novelId);
  const chapters = data.chapters.filter(chapter => volumes.some(volume => volume.id === chapter.volumeId) && (!catalog.volume || chapter.volumeId === catalog.volume));
  const select = (label: string, key: "volume" | "chapter" | "character" | "place", rows: { id: string; name?: string; title?: string }[]) =>
    <FilterSelect label={label} value={catalog[key] || "all"} values={["all", ...rows.map(row => row.id)]}
      labels={Object.fromEntries([["all", `All ${label.toLowerCase()}s`], ...rows.map(row => [row.id, row.name ?? row.title ?? row.id])])}
      onValueChange={value => onFilterChange({ [key]: value === "all" ? "" : value, ...(key === "volume" ? { chapter: "" } : {}) })} />;
  return (
    <div className="grid gap-6">
      <SectionHeader
        eyebrow="Timeline"
        title="Story chronology"
        description="Follow chronological order independently of where events are told."
        action={
          <Button onClick={onAddEvent}>
            <Plus className="size-4" />
            Add event
          </Button>
        }
      />

      {eventId ? <Link href={timelineCatalogRoute(novelId, catalog)} className="text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">Back to all events</Link> : null}
      <TimelineFilters><div className="grid min-w-0 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
        <div><Label htmlFor="timeline-search">Search Event Title</Label><Input id="timeline-search" type="search" maxLength={200} value={catalog.q} onChange={event => onFilterChange({ q: event.target.value })} /></div>
        {select("Volume", "volume", volumes)}
        {select("Chapter", "chapter", chapters)}
        {select("Character", "character", data.characters.filter(person => person.novelId === novelId))}
        {select("Place", "place", data.locations.filter(place => place.novelId === novelId))}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showSpoilers} onChange={event => onFilterChange({ spoilers: event.target.checked })} />Show spoilers</label>
        <Button variant="outline" onClick={onClear}>Clear Filters</Button>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={catalog.archived} onChange={event => onFilterChange({ archived: event.target.checked })} />Show archived</label>
      </div></TimelineFilters>
      <Card>
        <CardHeader><CardTitle id="timeline-results-heading" tabIndex={-1}>Events</CardTitle><CardDescription>{filteredEvents.length} matching events</CardDescription></CardHeader>
        <CardContent className="min-w-0 space-y-6">
          {filteredEvents.length ? <TimelineWindow key={timelineCatalogQuery(catalog)} catalogQuery={timelineCatalogQuery(catalog)} events={filteredEvents} novelId={novelId} showSpoilers={showSpoilers} selectedId={eventId} characters={data.characters} places={data.locations} storyOptions={storyOptions} /> : <TimelineEmptyState hasVisibleEvents={hasVisibleEvents} onAdd={onAddEvent} onClear={onClear} />}
          {eventId && !selectedEvent ? <p role="status">Event unavailable with the current visibility settings.</p> : null}
          {selectedEvent ? <TimelineDetailPanel backHref={timelineCatalogRoute(novelId, catalog)}><section aria-label="Selected event detail" className="min-w-0 rounded-lg border p-4 [overflow-wrap:anywhere]">
            <h2 ref={selectedTitle} tabIndex={-1} className="mb-3 text-lg font-semibold">{selectedEvent.title}</h2>
            <TimelineDetailLoader summary={selectedEvent} showSpoilers={showSpoilers}>{event => <div className="space-y-3">
              <AddStoryNoteButton target={{ novelId: event.novelId, type: "TimelineEvent", id: event.id, title: event.title }} />
              <StoryNotes target={{ novelId: event.novelId, type: "TimelineEvent", id: event.id, title: event.title }} />
              <p className="whitespace-pre-wrap text-sm">{event.description || "No description yet."}</p>
              <TimelineStoryLink event={event} novelId={novelId} options={storyOptions} />
              <div className="flex flex-wrap gap-3">
                {resolveTimelinePlaces(event, data.locations).map(place => <Link key={place.id} href={routeForPlace(place.novelId, place.id)} className="text-primary hover:underline">{place.name}</Link>)}
                {data.characters.filter(person => person.novelId === event.novelId && event.characterIds.includes(person.id)).map(person => <Link key={person.id} href={routeForCharacter(person.novelId, person.id)} className="text-primary hover:underline">{person.name}</Link>)}
              </div>
              <TimelinePositionEditor event={event} options={storyOptions} characters={data.characters} places={data.locations} onChanged={onChanged} />
              <TimelineLifecycle event={event} catalog={catalog} onChanged={onChanged} />
            </div>}</TimelineDetailLoader>
          </section></TimelineDetailPanel> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  values,
  onValueChange,
  labels
}: {
  label: string;
  value: string;
  values: string[];
  onValueChange: (value: string) => void;
  labels?: Record<string, string>;
}) {
  const filterId = React.useId();
  return (
    <div>
      <Label htmlFor={filterId}>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={filterId} className="mt-2">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {values.map((value) => (
            <SelectItem key={value} value={value}>
              {labels?.[value] ?? value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}


function ExportScreen({
  exportScope,
  exportFormat,
  exportFilename,
  enabledOptions,
  onScopeChange,
  onFormatChange,
  onOptionsChange,
  onOpenDialog
}: {
  exportScope: string;
  exportFormat: string;
  exportFilename: string;
  enabledOptions: Set<string>;
  onScopeChange: (value: string) => void;
  onFormatChange: (value: string) => void;
  onOptionsChange: (value: Set<string>) => void;
  onOpenDialog: () => void;
}) {
  const data = useStudioData();
  const currentNovel = getCurrentNovel(data);

  const toggleOption = (option: string) => {
    const next = new Set(enabledOptions);
    if (next.has(option)) {
      next.delete(option);
    } else {
      next.add(option);
    }
    onOptionsChange(next);
  };

  return (
    <div className="grid gap-6">
      <SectionHeader
        eyebrow="Export"
        title="Export center"
        description="Prepare manuscripts, bibles, relationship maps, and ZIP backups from local mock data."
        action={
          <Button onClick={onOpenDialog}>
            <Download className="size-4" />
            Export now
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Scope and format</CardTitle>
              <CardDescription>Choose what to include in the output</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Export scope</Label>
                <div className="mt-2 grid gap-2">
                  {exportScopes.map((scope) => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => onScopeChange(scope)}
                      className={cn(
                        "flex min-h-10 items-center justify-between rounded-md border bg-background/35 px-3 text-left text-sm hover:bg-secondary",
                        exportScope === scope && "border-primary bg-primary/10"
                      )}
                    >
                      {scope}
                      {exportScope === scope ? <Check className="size-4 text-primary" /> : null}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Export format</Label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {exportFormats.map((format) => (
                    <button
                      key={format}
                      type="button"
                      onClick={() => onFormatChange(format)}
                      className={cn(
                        "min-h-10 rounded-md border bg-background/35 px-3 text-sm hover:bg-secondary",
                        exportFormat === format && "border-primary bg-primary/10 font-medium"
                      )}
                    >
                      {format}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Options</CardTitle>
              <CardDescription>Export metadata and companion material</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {exportOptions.map((option) => (
                <label
                  key={option}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-md border bg-background/35 px-3 text-sm"
                >
                  <span>{option}</span>
                  <Switch
                    checked={enabledOptions.has(option)}
                    onCheckedChange={() => toggleOption(option)}
                  />
                </label>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="xl:sticky xl:top-24">
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>Estimated output from current selections</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <FieldLine label="Selected scope" value={exportScope} />
            <FieldLine label="Format" value={exportFormat} />
            <FieldLine label="Estimated pages" value="312 pages" />
            <FieldLine label="Word count" value={formatNumber(currentNovel.wordCount)} />
            <FieldLine label="Output filename" value={exportFilename} />
            <Button className="w-full" onClick={onOpenDialog}>
              <Download className="size-4" />
              Generate local export
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BackupsScreen({
  onCreateBackup,
  creatingBackup,
  retentionPolicy
}: {
  onCreateBackup: () => void;
  creatingBackup: boolean;
  retentionPolicy: string;
}) {
  const data = useStudioData();

  return (
    <div className="grid gap-6">
      <SectionHeader
        eyebrow="Backups"
        title="Local backup vault"
        description="Create manual ZIP backups, review retention, and restore previous local snapshots."
        action={
          <Button onClick={onCreateBackup} disabled={creatingBackup}>
            <FileArchive className="size-4" />
            {creatingBackup ? "Creating backup..." : "Manual backup"}
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Automatic backups</CardTitle>
            <CardDescription>Every day at 22:00</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <FieldLine label="Backup location" value="D:\\Writing\\PrivateNovelStudio\\backups" />
            <FieldLine label="Retention" value={retentionPolicy} />
            <div className="flex items-center justify-between rounded-md border bg-background/35 p-3">
              <span className="text-sm">Automatic backup settings</span>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Restore</CardTitle>
            <CardDescription>Recover from a selected backup file</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-start">
              <Upload className="size-4" />
              Restore backup
            </Button>
            <Button variant="outline" className="w-full justify-start">
              <ArchiveRestore className="size-4" />
              Verify backup
            </Button>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Restore operations would require confirmation in a real app before replacing local
              data.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Backup health</CardTitle>
            <CardDescription>Latest local snapshot status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <FieldLine label="Latest backup" value={data.backups[0]?.name ?? "No backup"} />
            <FieldLine label="Size" value={data.backups[0]?.size ?? "No backup"} />
            <FieldLine label="Included novels" value={`${data.backups[0]?.includedNovels ?? 0} novels`} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Backup list</CardTitle>
          <CardDescription>Recent ZIP backup examples</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {data.backups.map((backup) => (
            <div
              key={backup.name}
              className="grid gap-3 rounded-md border bg-background/35 p-3 lg:grid-cols-[1fr_auto]"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <FileArchive className="size-4 text-primary" />
                  <h3 className="font-semibold">{backup.name}</h3>
                  <Badge variant="outline">{backup.status}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {backup.date} · {backup.size} · {backup.includedNovels} included novels
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm">
                  <Download className="size-4" />
                  Download
                </Button>
                <Button variant="outline" size="sm">
                  <RotateCcw className="size-4" />
                  Restore
                </Button>
                <Button variant="outline" size="sm">
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function PrototypeDialog({
  dialog,
  initialRelationshipType = "",
  exportFilename,
  onCreateNovel,
  onCreateRelationship,
  onNavigateReaderScene,
  onClose
}: {
  dialog:
    | null
    | "novel"
    | "relationship"
    | "export"
    | "toc";
  exportFilename: string;
  initialRelationshipType?: string;
  onCreateNovel: (input: CreateNovelInput) => Promise<void>;
  onCreateRelationship: (input: CreateRelationshipInput) => Promise<void>;
  onNavigateReaderScene: (sceneId: string) => void;
  onClose: () => void;
}) {
  const data = useStudioData();
  const currentNovel = getCurrentNovel(data);
  const [itemTitle, setItemTitle] = React.useState("");
  const [itemNotes, setItemNotes] = React.useState("");
  const [dialogError, setDialogError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const relationshipInvoker = React.useRef<HTMLElement | null>(null);
  const relationshipFirstField = React.useRef<HTMLButtonElement | null>(null);
  const relationshipBody = React.useRef<HTMLDivElement | null>(null);
  const previousDialog = React.useRef<typeof dialog>(null);
  const [relationshipForm, setRelationshipForm] = React.useState<CreateRelationshipInput>({
    fromCharacterId: "",
    toCharacterId: "",
    relationshipType: "",
    status: "",
    since: "",
    sinceKind: "unknown",
    sinceTargetId: null,
    description: "",
    notes: "",
    isSpoiler: false
  });
  const dialogCopy = {
    novel: {
      title: "Create or edit story item",
      description:
        "Prototype form for adding a novel, volume, chapter, or scene to the local outline."
    },
    relationship: {
      title: "Add relationship",
      description: "Define character links, direction, spoiler visibility, and notes."
    },
    export: {
      title: "Generate export",
      description: `Prototype export ready for ${exportFilename}.`
    },
    toc: {
      title: "Table of contents",
      description: "Jump to volumes, chapters, or scenes in the reader."
    }
  };

  const copy = dialog ? dialogCopy[dialog] : null;
  const sinceOptions = React.useMemo(() => relationshipSinceOptions(currentNovel.id, data.volumes, data.chapters, data.scenes), [currentNovel.id, data.volumes, data.chapters, data.scenes]);

  React.useEffect(() => {
    // Background refreshes must not reset an open narrative draft or its save lock.
    if (dialog === "relationship" && previousDialog.current === dialog) return;
    previousDialog.current = dialog;
    setItemTitle("");
    setItemNotes("");
    setDialogError("");
    setSaving(false);
    setRelationshipForm({
      fromCharacterId: data.characters[0]?.id ?? "",
      toCharacterId: data.characters[1]?.id ?? "",
      relationshipType: relationshipDefinitions.some((type) => type.key === initialRelationshipType) ? initialRelationshipType : "",
      status: "",
      since: "",
      sinceKind: "unknown",
      sinceTargetId: null,
      description: "",
      notes: "",
      isSpoiler: false
    });
  }, [data.characters, data.chapters, data.locations, dialog, initialRelationshipType]);

  const submitDialog = async () => {
    if (saving) return;
    if (!dialog || dialog === "toc" || dialog === "export") {
      onClose();
      return;
    }

    setSaving(true);
    setDialogError("");

    try {
      if (dialog === "novel") {
        if (!itemTitle.trim()) {
          setDialogError("Title is required.");
          setSaving(false);
          return;
        }
        await onCreateNovel({
          title: itemTitle.trim(),
          synopsis: itemNotes.trim()
        });
      } else if (dialog === "relationship") {
        if (
          !relationshipForm.fromCharacterId ||
          !relationshipForm.toCharacterId ||
          !relationshipForm.relationshipType.trim()
        ) {
          setDialogError("Characters and relationship type are required.");
          setSaving(false);
          return;
        }

        if (relationshipForm.sinceKind === "custom" && !relationshipForm.since.trim()) {
          setDialogError("Enter custom Since text or choose Unknown.");
          setSaving(false);
          return;
        }

        await onCreateRelationship({
          ...relationshipForm,
          relationshipType: relationshipForm.relationshipType.trim(),
          description: relationshipForm.description.trim(),
          notes: relationshipForm.notes.trim(),
          since: relationshipForm.since.trim(),
          status: relationshipForm.status.trim()
        });
      } else {
        onClose();
        return;
      }

      onClose();
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : "Could not save item.");
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(dialog)} modal onOpenChange={(open) => { if (!open && !(dialog === "relationship" && saving)) onClose(); }}>
      <DialogContent
        className={dialog === "relationship" ? "relationship-dialog" : undefined}
        aria-modal="true"
        closeDisabled={dialog === "relationship" && saving}
        onOpenAutoFocus={(event) => {
          if (dialog !== "relationship") return;
          relationshipInvoker.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          event.preventDefault();
          if (relationshipBody.current) relationshipBody.current.scrollTop = 0;
          relationshipFirstField.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(event) => {
          if (!relationshipInvoker.current) return;
          event.preventDefault();
          if (relationshipInvoker.current.isConnected) relationshipInvoker.current.focus({ preventScroll: true });
          relationshipInvoker.current = null;
        }}
        onEscapeKeyDown={(event) => { if (dialog === "relationship" && saving) event.preventDefault(); }}
        onInteractOutside={(event) => { if (dialog === "relationship" && saving) event.preventDefault(); }}
      >
        {copy ? (
          <>
            <DialogHeader className={dialog === "relationship" ? "relationship-dialog-header" : undefined}>
              <DialogTitle>{copy.title}</DialogTitle>
              <DialogDescription>{copy.description}</DialogDescription>
            </DialogHeader>
            {dialog === "toc" ? (
              <div role="tree" aria-label="Reader table of contents" className="max-h-96 overflow-y-auto rounded-md border bg-background/35 p-3">
                {data.volumes.filter((volume) => !volume.archived).map((volume) => (
                  <div key={volume.id} role="treeitem" aria-expanded="true" aria-selected="false" className="mb-3">
                    <p className="font-semibold">{volume.title}</p>
                    <div role="group" className="mt-2 space-y-2 pl-3">
                      {data.chapters
                        .filter((chapter) => chapter.volumeId === volume.id && !chapter.archived)
                        .map((chapter) => (
                          <div key={chapter.id} role="treeitem" aria-expanded="true" aria-selected="false">
                            <p className="px-2 py-1 text-sm font-medium">{chapter.title}</p>
                            <div role="group" className="space-y-1 pl-3">
                              {data.scenes.filter((scene) => scene.chapterId === chapter.id && !scene.archived).map((scene) => <button key={scene.id} type="button" role="treeitem" aria-selected={scene.id === data.settings.activeSceneId} aria-current={scene.id === data.settings.activeSceneId ? "page" : undefined} className={cn("block w-full rounded-md px-2 py-1 text-left text-sm hover:bg-secondary", scene.id === data.settings.activeSceneId && "bg-secondary font-medium")} onClick={() => { onNavigateReaderScene(scene.id); onClose(); }}>{scene.title}</button>)}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div ref={dialog === "relationship" ? relationshipBody : undefined} className={dialog === "relationship" ? "relationship-dialog-body" : "grid gap-3"}>
                {dialog === "relationship" ? (
                  <RelationshipFields form={relationshipForm} onChange={setRelationshipForm} characters={data.characters} sinceOptions={sinceOptions} saving={saving} firstFieldRef={relationshipFirstField} />
                ) : (
                  <>
                    <div>
                      <Label>Title or name</Label>
                      <Input
                        className="mt-2"
                        value={itemTitle}
                        placeholder="Local draft item"
                        onChange={(event) => setItemTitle(event.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Notes</Label>
                      <Textarea
                        className="mt-2"
                        value={itemNotes}
                        placeholder="Private details for this item"
                        onChange={(event) => setItemNotes(event.target.value)}
                      />
                    </div>
                  </>
                )}
                {dialogError ? (
                  <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    {dialogError}
                  </div>
                ) : null}
                <div className="flex items-center justify-between rounded-md border bg-background/35 p-3">
                  <span className="text-sm">Current novel: {currentNovel.title}</span>
                  {dialog !== "relationship" ? <Switch defaultChecked /> : null}
                </div>
              </div>
            )}
            <DialogFooter className={dialog === "relationship" ? "relationship-dialog-footer" : undefined}>
              <Button type="button" variant="outline" onClick={onClose} disabled={dialog === "relationship" && saving}>
                Cancel
              </Button>
              <Button type="button" onClick={submitDialog} disabled={saving}>
                {dialog === "export" ? "Generate" : saving ? "Saving..." : dialog === "relationship" ? "Save Relationship" : "Save item"}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}



