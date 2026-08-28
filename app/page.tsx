"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArchiveRestore,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Circle,
  Clock,
  Download,
  Eye,
  EyeOff,
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
  Tag,
  Trash2,
  Upload,
  UserRound,
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
import { CharactersScreen } from "@/components/studio/characters-screen";
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
  characterName,
  chapterTitle,
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
  placeName,
  StudioData,
  uniqueStrings,
  volumeTitle
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
import { parseStudioRoute, routeForPage } from "@/lib/studio-routes";
import {
  defaultLibraryNavigationState,
  parseLibraryNavigationState,
  serializeLibraryNavigationState,
  type LibraryNavigationState
} from "@/lib/studio-library-navigation";
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
  relationshipCategories,
  type ChapterStatus,
  type FocusMode,
  type Location,
  type Note,
  type Novel,
  type PageId,
  type Relationship,
  type Scene,
  type SidebarState,
  type TimelineEvent,
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

type CreateCharacterInput = {
  name: string;
  notes: string;
};

type CreatePlaceInput = {
  name: string;
  notes: string;
};

type CreateNoteInput = {
  title: string;
  content: string;
};

type CreateRelationshipInput = {
  fromCharacterId: string;
  toCharacterId: string;
  relationshipType: string;
  category: Relationship["category"];
  direction: Relationship["direction"];
  status: string;
  since: string;
  description: string;
  notes: string;
  isSpoiler: boolean;
};

type CreateTimelineEventInput = {
  title: string;
  internalDate: string;
  chapterId: string;
  locationId: string;
  description: string;
  isSpoiler: boolean;
};

type NovelMetricSummary = {
  volumeCount: number;
  chapterCount: number;
};

const StudioDataContext = React.createContext<StudioData>(emptyStudioData);

function useStudioData() {
  return React.useContext(StudioDataContext);
}

const relationshipFilterTypes = [
  "All relationships",
  ...Object.values(relationshipCategories).flat()
];

const chapterStatusOptions = narrativeStatuses;

const readerScopes = [
  "Read full novel",
  "Read selected volume",
  "Read selected chapter",
  "Read selected scene"
];

const characterRoles = ["All roles", "Protagonist", "Deuteragonist", "Support", "Mentor / Suspect"];
const characterStatuses = ["All statuses", "Active", "Secondary", "Missing", "Dead", "Spoiler", "Archived"];

function dataSourceLabel(status: DataStatus, language: Language) {
  if (status === "ready") {
    return language === "es" ? "SQLite conectado" : "SQLite connected";
  }

  if (status === "loading") {
    return language === "es" ? "Cargando SQLite" : "Loading SQLite";
  }

  return language === "es" ? "SQLite no disponible" : "SQLite unavailable";
}

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
  const [theme, setTheme] = React.useState<"light" | "dark" | "system">("light");
  const [language, setLanguage] = React.useState<Language>("en");
  const [focusMode, setFocusMode] = React.useState<FocusMode>("none");
  const [inspectorOpen, setInspectorOpen] = React.useState(true);
  const [dialog, setDialog] = React.useState<
    null | "novel" | "character" | "place" | "relationship" | "event" | "note" | "export" | "toc"
  >(null);
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
  const [characterQuery, setCharacterQuery] = React.useState("");
  const [characterRole, setCharacterRole] = React.useState("All roles");
  const [characterStatus, setCharacterStatus] = React.useState("All statuses");
  const [placeQuery, setPlaceQuery] = React.useState("");
  const [placeType, setPlaceType] = React.useState("All places");
  const [relationshipType, setRelationshipType] = React.useState("All relationships");
  const [relationshipCharacter, setRelationshipCharacter] = React.useState("All characters");
  const [showSpoilers, setShowSpoilers] = React.useState(false);
  const [timelineVolume, setTimelineVolume] = React.useState("All volumes");
  const [timelineChapter, setTimelineChapter] = React.useState("All chapters");
  const [timelineCharacter, setTimelineCharacter] = React.useState("All characters");
  const [timelinePlace, setTimelinePlace] = React.useState("All places");
  const [readerTheme, setReaderTheme] = React.useState("Sepia");
  const [readerFontSize, setReaderFontSize] = React.useState(18);
  const [readerWidth, setReaderWidth] = React.useState(720);
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
  const currentNotionSyncState = studioData.notionSyncStates.find(
    (state) => state.novelId === currentNovel.id
  );
  const libraryNavigationState = React.useMemo(
    () => parseLibraryNavigationState(searchParams),
    [searchParams]
  );
  const pendingSaveHandlerRef = React.useRef<PendingSaveHandler | null>(null);
  const editorDirtyRef = React.useRef(false);
  const saveInFlightRef = React.useRef<Promise<boolean> | null>(null);
  const autosyncInFlightRef = React.useRef(false);
  const autosyncRetryAtRef = React.useRef(0);
  const autosyncFailureCountRef = React.useRef(0);
  const autosyncStatusTimerRef = React.useRef<number | null>(null);
  const exportDefaultsAppliedRef = React.useRef(false);
  const settingsSaveInFlightRef = React.useRef(false);
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

    if (nextSettings.theme === "light" || nextSettings.theme === "dark" || nextSettings.theme === "system") {
      setTheme(nextSettings.theme);
    }

    if (
      nextSettings.sidebarState === "expanded" ||
      nextSettings.sidebarState === "compact" ||
      nextSettings.sidebarState === "hidden"
    ) {
      setSidebarState(nextSettings.sidebarState);
    }

    setInspectorOpen(nextSettings.editorInspectorOpen);

    const nextReaderFontSize = Number.parseInt(nextSettings.readerFontSize, 10);
    if (!Number.isNaN(nextReaderFontSize)) {
      setReaderFontSize(nextReaderFontSize);
    }

    if (nextSettings.defaultReadingMode) {
      setReaderTheme(nextSettings.defaultReadingMode);
    }
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
    const desktopMedia = window.matchMedia("(min-width: 768px)");
    const closeDrawerOnDesktop = () => {
      if (desktopMedia.matches) setMobileDrawerOpen(false);
    };

    closeDrawerOnDesktop();
    desktopMedia.addEventListener("change", closeDrawerOnDesktop);
    return () => desktopMedia.removeEventListener("change", closeDrawerOnDesktop);
  }, []);

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

  React.useEffect(() => {
    const root = document.documentElement;
    const shouldUseDark =
      theme === "dark" ||
      (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", shouldUseDark);
  }, [theme]);

  const registerPendingSave = React.useCallback((handler: PendingSaveHandler | null) => {
    pendingSaveHandlerRef.current = handler;
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
        body: JSON.stringify(nextSettings)
      });

      if (!response.ok) {
        throw new Error("Settings could not be saved.");
      }

      return (await response.json()) as PersistedStudioSettings;
    },
    []
  );

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

  const updateTheme = React.useCallback(
    (value: "light" | "dark" | "system") => {
      void saveSettings({ theme: value }, () => setTheme(value));
    },
    [saveSettings]
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
      void saveSettings({ [key]: String(value) }, () => {
        if (key === "readerFontSize") {
          const nextValue = Number.parseInt(String(value), 10);
          if (!Number.isNaN(nextValue)) {
            setReaderFontSize(nextValue);
          }
        }

        if (key === "defaultReadingMode") {
          setReaderTheme(String(value));
        }
      });
    },
    [saveSettings]
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

  const createCharacterFromDialog = React.useCallback(
    async (input: CreateCharacterInput) => {
      const response = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          novelId: currentNovel.id,
          name: input.name,
          notes: input.notes
        })
      });

      if (!response.ok) {
        const details = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(details?.error ?? `Character creation failed with ${response.status}`);
      }

      await refreshStudioData(false);
      router.push(routeForPage("characters", currentNovel.id));
      showToast("Character created in SQLite");
    },
    [currentNovel.id, refreshStudioData, router, showToast]
  );

  const createPlaceFromDialog = React.useCallback(
    async (input: CreatePlaceInput) => {
      const response = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          novelId: currentNovel.id,
          name: input.name,
          notes: input.notes
        })
      });

      if (!response.ok) {
        const details = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(details?.error ?? `Place creation failed with ${response.status}`);
      }

      await refreshStudioData(false);
      router.push(routeForPage("places", currentNovel.id));
      showToast("Place created in SQLite");
    },
    [currentNovel.id, refreshStudioData, router, showToast]
  );

  const createNoteFromDialog = React.useCallback(
    async (input: CreateNoteInput) => {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          novelId: currentNovel.id,
          title: input.title,
          content: input.content,
          linkedType: "Novel",
          linkedId: currentNovel.id
        })
      });

      if (!response.ok) {
        const details = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(details?.error ?? `Note creation failed with ${response.status}`);
      }

      await refreshStudioData(false);
      router.push(routeForPage("notes", currentNovel.id));
      showToast("Note created in SQLite");
    },
    [currentNovel.id, refreshStudioData, router, showToast]
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
      router.push(routeForPage("relationships", currentNovel.id));
      showToast("Relationship saved to SQLite");
    },
    [currentNovel.id, refreshStudioData, router, showToast]
  );

  const createTimelineEventFromDialog = React.useCallback(
    async (input: CreateTimelineEventInput) => {
      const response = await fetch("/api/timeline-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          novelId: currentNovel.id,
          ...input
        })
      });

      if (!response.ok) {
        const details = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(details?.error ?? `Timeline event creation failed with ${response.status}`);
      }

      await refreshStudioData(false);
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
        void changeFocusMode(activePage === "reader" ? "reading" : "writing");
      }

      if (event.key === "Escape") {
        if (focusMode !== "none") void changeFocusMode("none");
        setMobileDrawerOpen(false);
        setDialog(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePage, changeFocusMode, cycleSidebar, flushPendingChanges, focusMode]);

  const novels = studioData.novels;
  const { characters, locations, relationships } = scopedStudioData;

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

  const filteredCharacters = characters.filter((character) => {
    const queryMatch =
      character.name.toLowerCase().includes(characterQuery.toLowerCase()) ||
      character.alias.toLowerCase().includes(characterQuery.toLowerCase());
    const roleMatch = characterRole === "All roles" || character.role === characterRole;
    const statusMatch =
      characterStatus === "All statuses" || character.status === characterStatus;
    return queryMatch && roleMatch && statusMatch;
  });

  const filteredPlaces = locations.filter((place) => {
    const queryMatch = place.name.toLowerCase().includes(placeQuery.toLowerCase());
    const typeMatch = placeType === "All places" || place.type === placeType;
    return queryMatch && typeMatch;
  });

  const filteredRelationships = relationships.filter((relationship) => {
    const typeMatch =
      relationshipType === "All relationships" ||
      relationship.relationshipType.toLowerCase() === relationshipType.toLowerCase();
    const characterMatch =
      relationshipCharacter === "All characters" ||
      relationship.fromCharacterId === relationshipCharacter ||
      relationship.toCharacterId === relationshipCharacter;
    const spoilerMatch = showSpoilers || !relationship.isSpoiler;
    return typeMatch && characterMatch && spoilerMatch;
  });
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

  if (focusMode === "writing") {
    return (
      <StudioDataContext.Provider value={scopedStudioData}>
        <WritingFocusMode
          editorFontSize={Number.parseInt(studioSettings.editorFontSize, 10) || 18}
          autosaveDelayMs={autosaveDelay(studioSettings.autosaveInterval)}
          saveStatus={saveStatus}
          onSaveScene={saveScene}
          onRequestSave={() => void flushPendingChanges()}
          setSaveStatus={setSaveStatus}
          onRegisterPendingSave={registerPendingSave}
          onDirtyChange={setEditorDirty}
          onExit={() => void changeFocusMode("none")}
        />
      </StudioDataContext.Provider>
    );
  }

  if (focusMode === "reading") {
    return (
      <StudioDataContext.Provider value={scopedStudioData}>
        <ReadingFocusMode
          readerFontSize={readerFontSize}
          readerWidth={readerWidth}
          onExit={() => void changeFocusMode("none")}
        />
      </StudioDataContext.Provider>
    );
  }

  return (
    <StudioDataContext.Provider value={scopedStudioData}>
      <main className="min-h-screen bg-background text-foreground">
        <div className="flex min-h-screen">
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
            onSelectPage={selectPage}
            onSidebarStateChange={updateSidebarState}
          />

          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar
              pageLabel={pageLabelsByLanguage[language][activePage]}
              subtitle={`${currentNovel.title} - ${uiCopy[language].localStudio}`}
              sidebarState={sidebarState}
              mobileNavigationOpen={mobileDrawerOpen}
              novels={studioData.novels}
              activeNovelId={currentNovel.id}
              dataStatusLabel={dataSourceLabel(dataStatus, language)}
              copy={{
                openNavigation: uiCopy[language].openNavigation,
                toggleSidebar: uiCopy[language].toggleSidebar,
                localStatus: uiCopy[language].localStatus
              }}
              onOpenMobileNav={() => setMobileDrawerOpen(true)}
              onCycleSidebar={cycleSidebar}
              onActiveNovelChange={(novelId) =>
                void setActiveNovel(
                  novelId,
                  activeRoute?.novelId ? activePage : "overview"
                )
              }
            />

          <div className="flex-1 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
            <div className="mx-auto max-w-[1480px] pb-8">
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
                  inspectorOpen={inspectorOpen}
                  setInspectorOpen={updateInspectorOpen}
                  setSaveStatus={setSaveStatus}
                />
              ) : null}
              {activePage === "reader" ? (
                <ReaderScreen
                  readerTheme={readerTheme}
                  readerFontSize={readerFontSize}
                  readerWidth={readerWidth}
                  onReaderThemeChange={setReaderTheme}
                  onReaderFontSizeChange={setReaderFontSize}
                  onReaderWidthChange={setReaderWidth}
                  onFocus={() => void changeFocusMode("reading")}
                  onOpenToc={() => setDialog("toc")}
                />
              ) : null}
              {activePage === "characters" ? (
                <CharactersScreen
                  data={scopedStudioData}
                  characters={filteredCharacters}
                  query={characterQuery}
                  role={characterRole}
                  status={characterStatus}
                  roleOptions={characterRoles}
                  statusOptions={characterStatuses}
                  translate={translate}
                  onQueryChange={setCharacterQuery}
                  onRoleChange={setCharacterRole}
                  onStatusChange={setCharacterStatus}
                  onAddCharacter={() => setDialog("character")}
                />
              ) : null}
              {activePage === "places" ? (
                <PlacesScreen
                  places={filteredPlaces}
                  query={placeQuery}
                  type={placeType}
                  onQueryChange={setPlaceQuery}
                  onTypeChange={setPlaceType}
                  onAddPlace={() => setDialog("place")}
                />
              ) : null}
              {activePage === "relationships" ? (
                <RelationshipsScreen
                  relationships={filteredRelationships}
                  relationshipType={relationshipType}
                  relationshipCharacter={relationshipCharacter}
                  showSpoilers={showSpoilers}
                  onRelationshipTypeChange={setRelationshipType}
                  onRelationshipCharacterChange={setRelationshipCharacter}
                  onShowSpoilersChange={setShowSpoilers}
                  onAddRelationship={() => setDialog("relationship")}
                />
              ) : null}
              {activePage === "timeline" ? (
                <TimelineScreen
                  volumeFilter={timelineVolume}
                  chapterFilter={timelineChapter}
                  characterFilter={timelineCharacter}
                  placeFilter={timelinePlace}
                  onVolumeFilterChange={setTimelineVolume}
                  onChapterFilterChange={setTimelineChapter}
                  onCharacterFilterChange={setTimelineCharacter}
                  onPlaceFilterChange={setTimelinePlace}
                  onAddEvent={() => setDialog("event")}
                />
              ) : null}
              {activePage === "notes" ? (
                <NotesScreen onAddNote={() => setDialog("note")} />
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
                  theme={theme}
                  language={language}
                  sidebarState={sidebarState}
                  settings={studioSettings}
                  translate={translate}
                  onThemeChange={updateTheme}
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
        onOpenChange={setMobileDrawerOpen}
        onSelectPage={selectPage}
      />

      <PrototypeDialog
        dialog={dialog}
        exportFilename={exportPreviewName}
        onCreateNovel={createNovelFromDialog}
        onCreateCharacter={createCharacterFromDialog}
        onCreatePlace={createPlaceFromDialog}
        onCreateRelationship={createRelationshipFromDialog}
        onCreateEvent={createTimelineEventFromDialog}
        onCreateNote={createNoteFromDialog}
        onClose={() => setDialog(null)}
      />

      <NotionConflictDialog
        conflict={notionConflict}
        translate={translate}
        resolving={resolvingNotionConflict}
        onResolve={(choice) => void resolveCurrentNotionConflict(choice)}
      />

        {toast ? (
          <div className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-lg border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-paper">
            <Check className="size-4 text-primary" />
            {toast}
          </div>
        ) : null}
      </main>
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
  setInspectorOpen: (open: boolean) => void;
  setSaveStatus: (status: SaveStatus) => void;
}) {
  const data = useStudioData();
  const activeChapter = getActiveChapter(data);
  const activeScene = getActiveScene(data);
  const activeVolume = data.volumes.find((volume) => volume.id === activeChapter.volumeId);
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
          "grid gap-4",
          inspectorOpen ? "xl:grid-cols-[minmax(0,1fr)_360px]" : "xl:grid-cols-1"
        )}
      >
        <Card className="overflow-hidden">
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
                  value={content}
                  onChange={(event) => {
                    const nextContent = event.target.value;
                    draftRef.current = { ...draftRef.current, content: nextContent };
                    setContent(nextContent);
                    markDirty();
                  }}
                  className="min-h-[520px] border-0 bg-transparent p-0 font-typewriter text-base leading-8 text-editor-foreground shadow-none focus-visible:ring-0 sm:text-lg"
                  style={{ fontSize: `${editorFontSize}px` }}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-wrap justify-between gap-3 border-t bg-card/70 p-4">
            <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">{formatNumber(draftWordCount)} words</Badge>
              <Badge variant="outline">{formatNumber(content.length)} characters</Badge>
              <Badge variant="outline">3 min read</Badge>
            </div>
            <div className="flex items-center gap-2 text-sm">
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
  const [locationId, setLocationId] = React.useState(activeScene.locationId || "none");
  const [timelineEventId, setTimelineEventId] = React.useState("none");
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");

  const characters = data.characters.filter((character) => character.novelId === novelId);
  const locations = data.locations.filter((location) => location.novelId === novelId);
  const timelineEvents = data.timelineEvents.filter((event) => event.novelId === novelId);

  React.useEffect(() => {
    let cancelled = false;
    setSummary(activeScene.summary);
    setObjective(activeScene.objective);
    setLocationId(activeScene.locationId || "none");
    setSaveState("idle");
    void fetch(`/api/scenes/${encodeURIComponent(activeScene.id)}/inspector`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load scene metadata");
        return response.json() as Promise<{ characterIds: string[]; timelineEventId: string | null; notes: string }>;
      })
      .then((inspector) => {
        if (cancelled) return;
        setCharacterIds(inspector.characterIds);
        setTimelineEventId(inspector.timelineEventId ?? "none");
        setNotes(inspector.notes);
      })
      .catch(() => !cancelled && setSaveState("error"));
    return () => { cancelled = true; };
  }, [activeScene.id, activeScene.locationId, activeScene.objective, activeScene.summary]);

  const saveMetadata = async () => {
    setSaveState("saving");
    try {
      const response = await fetch(`/api/scenes/${encodeURIComponent(activeScene.id)}/inspector`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary, objective, notes, characterIds, locationId: locationId === "none" ? null : locationId, timelineEventId: timelineEventId === "none" ? null : timelineEventId })
      });
      if (!response.ok) throw new Error("Could not save scene metadata");
      setSaveState("saved");
      onRefresh();
    } catch {
      setSaveState("error");
    }
  };

  return (
    <Card className="xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
      <CardHeader>
        <CardTitle>Scene inspector</CardTitle>
        <CardDescription>Local story metadata for continuity</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2"><Label htmlFor="scene-summary">Scene summary</Label><Textarea id="scene-summary" value={summary} onChange={(event) => setSummary(event.target.value)} /></div>
        <div className="grid gap-2"><Label>Linked characters</Label><div className="flex flex-wrap gap-2">{characterIds.map((id) => { const character = characters.find((item) => item.id === id); return character ? <Badge key={id} variant="outline" className="gap-1">{character.name}<button type="button" aria-label={`Remove ${character.name}`} onClick={() => setCharacterIds((ids) => ids.filter((item) => item !== id))}><X className="size-3" /></button></Badge> : null; })}</div><Select value="" onValueChange={(id) => setCharacterIds((ids) => ids.includes(id) ? ids : [...ids, id])}><SelectTrigger aria-label="Add linked character"><SelectValue placeholder="Add character" /></SelectTrigger><SelectContent>{characters.filter((character) => !characterIds.includes(character.id)).map((character) => <SelectItem key={character.id} value={character.id}>{character.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid gap-2"><Label htmlFor="scene-place">Linked place</Label><Select value={locationId} onValueChange={setLocationId}><SelectTrigger id="scene-place"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No linked place</SelectItem>{locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid gap-2"><Label htmlFor="scene-timeline">Timeline moment</Label><Select value={timelineEventId} onValueChange={setTimelineEventId}><SelectTrigger id="scene-timeline"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No timeline moment</SelectItem>{timelineEvents.map((event) => <SelectItem key={event.id} value={event.id}>{event.internalDate ? `${event.internalDate} · ` : ""}{event.title}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid gap-2"><Label htmlFor="scene-objective">Objective</Label><Textarea id="scene-objective" value={objective} onChange={(event) => setObjective(event.target.value)} /></div>
        <div className="grid gap-2"><Label htmlFor="scene-notes">Notes</Label><Textarea id="scene-notes" value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
        {saveState === "error" ? <p role="alert" className="text-sm text-destructive">Metadata could not be saved. Your changes remain here; retry when ready.</p> : null}
        <Button className="w-full" onClick={() => void saveMetadata()} disabled={saveState === "saving"}>{saveState === "saving" ? "Saving metadata…" : saveState === "saved" ? "Saved metadata" : "Save metadata"}</Button>
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
  onExit: () => void;
}) {
  const data = useStudioData();
  const activeScene = getActiveScene(data);
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
            className="min-h-[calc(100vh-12rem)] border-0 bg-transparent p-0 font-typewriter leading-9 text-editor-foreground shadow-none focus-visible:ring-0"
            style={{ fontSize: `${editorFontSize}px` }}
          />
        </div>
      </section>
    </main>
  );
}

function ReaderScreen({
  readerTheme,
  readerFontSize,
  readerWidth,
  onReaderThemeChange,
  onReaderFontSizeChange,
  onReaderWidthChange,
  onFocus,
  onOpenToc
}: {
  readerTheme: string;
  readerFontSize: number;
  readerWidth: number;
  onReaderThemeChange: (value: string) => void;
  onReaderFontSizeChange: (value: number) => void;
  onReaderWidthChange: (value: number) => void;
  onFocus: () => void;
  onOpenToc: () => void;
}) {
  const data = useStudioData();
  const activeChapter = getActiveChapter(data);
  const activeScene = getActiveScene(data);

  return (
    <div className="grid gap-6">
      <SectionHeader
        eyebrow="Reader"
        title="Private ebook reader"
        description="Preview the complete novel, a volume, a chapter, or a single scene with local reading controls."
        action={
          <>
            <Button onClick={onFocus}>
              <Eye className="size-4" />
              Reading focus
            </Button>
            <Button variant="outline" onClick={onOpenToc}>
              <ListTree className="size-4" />
              Table of contents
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="grid gap-3 p-4 lg:grid-cols-[220px_150px_1fr_1fr_auto] lg:items-end">
          <div>
            <Label>Scope</Label>
            <Select defaultValue={readerScopes[2]}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {readerScopes.map((scope) => (
                  <SelectItem key={scope} value={scope}>
                    {scope}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Theme</Label>
            <Select value={readerTheme} onValueChange={onReaderThemeChange}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Light">Light</SelectItem>
                <SelectItem value="Dark">Dark</SelectItem>
                <SelectItem value="Sepia">Sepia</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ControlSlider
            label="Font size"
            value={readerFontSize}
            min={15}
            max={24}
            suffix="px"
            onChange={onReaderFontSizeChange}
          />
          <ControlSlider
            label="Reading width"
            value={readerWidth}
            min={560}
            max={900}
            suffix="px"
            onChange={onReaderWidthChange}
          />
          <Button variant="outline">
            <BookOpen className="size-4" />
            Continue reading
          </Button>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>{activeChapter.title}</CardTitle>
              <CardDescription>Volume 1 Â· Scene preview Â· 38% read</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" aria-label="Previous">
                <ArrowLeft className="size-4" />
              </Button>
              <Button variant="outline" size="icon" aria-label="Next">
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
          <ProgressBar value={38} />
        </CardHeader>
        <CardContent
          className={cn(
            "mx-auto my-6 rounded-lg border p-6 shadow-inner sm:p-10",
            readerTheme === "Dark" && "bg-[#0E0F11] text-[#E7D8B5]",
            readerTheme === "Light" && "bg-[#F7F2E8] text-[#2B2118]",
            readerTheme === "Sepia" && "bg-[#efe3c8] text-[#2B2118]"
          )}
          style={{ maxWidth: `${readerWidth}px`, fontSize: `${readerFontSize}px` }}
        >
          <article className="space-y-6 leading-9">
            <h2 className="font-serif text-3xl font-semibold tracking-normal">
              {activeScene.title}
            </h2>
            {activeScene.content.split("\n\n").map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </article>
        </CardContent>
        <CardFooter className="flex flex-wrap justify-between gap-2 border-t p-4">
          <Button variant="outline">
            <ChevronLeft className="size-4" />
            Previous
          </Button>
          <Button variant="outline">
            Next
            <ChevronRight className="size-4" />
          </Button>
        </CardFooter>
      </Card>
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
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-10 w-full accent-primary"
      />
    </div>
  );
}

function ReadingFocusMode({
  readerFontSize,
  readerWidth,
  onExit
}: {
  readerFontSize: number;
  readerWidth: number;
  onExit: () => void;
}) {
  const data = useStudioData();
  const activeChapter = getActiveChapter(data);
  const activeScene = getActiveScene(data);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/88 backdrop-blur">
        <div className="mx-auto flex min-h-14 max-w-5xl items-center gap-3 px-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{activeChapter.title}</p>
          </div>
          <Badge variant="outline">38% read</Badge>
          <Button variant="ghost" size="icon" aria-label="Previous">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Next">
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="outline" onClick={onExit}>
            <X className="size-4" />
            Exit focus
          </Button>
        </div>
      </header>
      <section className="px-4 py-8">
        <article
          className="mx-auto space-y-6 rounded-lg border bg-editor p-6 leading-9 text-editor-foreground shadow-paper sm:p-10"
          style={{ maxWidth: `${readerWidth}px`, fontSize: `${readerFontSize}px` }}
        >
          <h1 className="font-serif text-3xl font-semibold tracking-normal">
            {activeScene.title}
          </h1>
          {activeScene.content.split("\n\n").map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </article>
      </section>
    </main>
  );
}

function PlacesScreen({
  places,
  query,
  type,
  onQueryChange,
  onTypeChange,
  onAddPlace
}: {
  places: Location[];
  query: string;
  type: string;
  onQueryChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onAddPlace: () => void;
}) {
  const data = useStudioData();
  const selectedPlace = places[0];
  const charactersByPlace = new Map(
    data.locations.map((place) => [
      place.id,
      uniqueStrings(
        data.timelineEvents
          .filter((event) => event.locationId === place.id)
          .flatMap((event) => event.characterIds.map((id) => characterName(id, data)))
          .filter((name) => name !== "Unknown")
      )
    ])
  );

  return (
    <div className="grid gap-6">
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

      <Card>
        <CardContent className="grid gap-3 p-4 lg:grid-cols-[1fr_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search places"
              className="pl-9"
            />
          </div>
          <Select value={type} onValueChange={onTypeChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All places">All places</SelectItem>
              {placeTypes.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        {places.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {places.map((place) => (
              <Card key={place.id}>
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-start gap-3">
                    <div className="grid size-12 shrink-0 place-items-center rounded-md border bg-editor text-primary">
                      <MapIcon className="size-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold">{place.name}</h3>
                          <p className="text-sm text-muted-foreground">{place.region}</p>
                        </div>
                        <Badge variant="outline">{place.type}</Badge>
                      </div>
                    </div>
                  </div>
                  <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                    {place.description}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <FieldLine label="First appearance" value={place.firstAppearance} />
                    <FieldLine
                      label="Characters"
                      value={
                        charactersByPlace.get(place.id)?.slice(0, 2).join(", ") ||
                        "No linked characters yet"
                      }
                    />
                    <FieldLine
                      label="Events"
                      value={
                        data.timelineEvents.filter((event) => event.locationId === place.id).length
                      }
                    />
                    <FieldLine label="Importance" value={place.importance} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={MapIcon}
            title="No places match those filters"
            description="Adjust the search or type filter to find locations."
          />
        )}

        {selectedPlace ? <PlaceDetailPanel place={selectedPlace} /> : null}
      </div>
    </div>
  );
}

function PlaceDetailPanel({ place }: { place: Location }) {
  const data = useStudioData();
  const linkedCharacters = uniqueStrings(
    data.timelineEvents
      .filter((event) => event.locationId === place.id)
      .flatMap((event) => event.characterIds.map((id) => characterName(id, data)))
      .filter((name) => name !== "Unknown")
  );

  return (
    <Card className="xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
      <CardHeader>
        <CardTitle>{place.name}</CardTitle>
        <CardDescription>
          {place.type} Â· {place.region}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <FieldLine label="Description" value={place.description} />
        <FieldLine label="Region" value={place.region} />
        <FieldLine label="Importance" value={place.importance} />
        <FieldLine label="Visual notes" value={place.visualNotes} />
        <FieldLine label="Rules of the place" value={place.rules} />
        <FieldLine label="First appearance" value={place.firstAppearance} />
        <FieldLine
          label="Linked scenes"
          value={data.scenes
            .filter((scene) => scene.locationId === place.id)
            .map((scene) => scene.title)
            .join(", ")}
        />
        <FieldLine
          label="Linked characters"
          value={linkedCharacters.length ? linkedCharacters.join(", ") : "No linked characters yet"}
        />
        <FieldLine
          label="Related timeline events"
          value={data.timelineEvents
            .filter((event) => event.locationId === place.id)
            .map((event) => event.title)
            .join(", ")}
        />
      </CardContent>
    </Card>
  );
}

function RelationshipsScreen({
  relationships,
  relationshipType,
  relationshipCharacter,
  showSpoilers,
  onRelationshipTypeChange,
  onRelationshipCharacterChange,
  onShowSpoilersChange,
  onAddRelationship
}: {
  relationships: Relationship[];
  relationshipType: string;
  relationshipCharacter: string;
  showSpoilers: boolean;
  onRelationshipTypeChange: (value: string) => void;
  onRelationshipCharacterChange: (value: string) => void;
  onShowSpoilersChange: (value: boolean) => void;
  onAddRelationship: () => void;
}) {
  const data = useStudioData();

  return (
    <div className="grid gap-6">
      <SectionHeader
        eyebrow="Relationships"
        title="Character relationship map"
        description="Manage relationship type, direction, status, spoiler flags, and notes."
        action={
          <Button onClick={onAddRelationship}>
            <Plus className="size-4" />
            Add relationship
          </Button>
        }
      />

      <Card>
        <CardContent className="grid gap-3 p-4 lg:grid-cols-[220px_220px_auto] lg:items-center">
          <Select value={relationshipType} onValueChange={onRelationshipTypeChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {relationshipFilterTypes.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={relationshipCharacter} onValueChange={onRelationshipCharacterChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All characters">All characters</SelectItem>
              {data.characters.map((character) => (
                <SelectItem key={character.id} value={character.id}>
                  {character.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-3 rounded-md border bg-background/35 px-3 py-2">
            <Switch checked={showSpoilers} onCheckedChange={onShowSpoilersChange} />
            <span className="text-sm">Show spoilers</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader>
            <CardTitle>Relationship map</CardTitle>
            <CardDescription>Visual node graph prototype</CardDescription>
          </CardHeader>
          <CardContent>
            <RelationshipMap relationships={relationships} showSpoilers={showSpoilers} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Relationships</CardTitle>
            <CardDescription>Examples and editable relationship records</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {relationships.map((relationship) => (
              <div key={relationship.id} className="rounded-md border bg-background/35 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{relationship.category}</Badge>
                  <Badge variant="outline">{relationship.direction}</Badge>
                  {relationship.isSpoiler ? <Badge variant="accent">Spoiler</Badge> : null}
                </div>
                <p className="font-medium">
                  {characterName(relationship.fromCharacterId, data)}{" "}
                  {relationship.direction === "Bidirectional" ? "<->" : "->"}{" "}
                  {relationship.relationshipType} {"->"}{" "}
                  {characterName(relationship.toCharacterId, data)}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {relationship.description}
                </p>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <FieldLine label="Status" value={relationship.status} />
                  <FieldLine label="Since" value={relationship.since} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Relationship categories</CardTitle>
          <CardDescription>Available type library for local character links</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Object.entries(relationshipCategories).map(([category, items]) => (
            <div key={category} className="rounded-md border bg-background/35 p-3">
              <h3 className="mb-2 font-semibold">{category}</h3>
              <div className="flex flex-wrap gap-2">
                {items.map((item) => (
                  <Badge key={item} variant="outline">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function RelationshipMap({
  relationships,
  showSpoilers
}: {
  relationships: Relationship[];
  showSpoilers: boolean;
}) {
  const data = useStudioData();
  const visibleRelationships = relationships.filter(
    (relationship) => showSpoilers || !relationship.isSpoiler
  );
  const characterIds = uniqueStrings(
    visibleRelationships.flatMap((relationship) => [
      relationship.fromCharacterId,
      relationship.toCharacterId
    ])
  ).slice(0, 6);
  const positions = [
    "left-[10%] top-[12%]",
    "right-[10%] top-[12%]",
    "left-[8%] top-[52%]",
    "right-[8%] top-[52%]",
    "left-[26%] bottom-[10%]",
    "right-[26%] bottom-[10%]"
  ];

  if (!visibleRelationships.length) {
    return (
      <div className="grid min-h-[420px] place-items-center rounded-lg border bg-editor p-4">
        <EmptyState
          icon={EyeOff}
          title={showSpoilers ? "No relationships yet" : "Spoiler relationships are hidden"}
          description={
            showSpoilers
              ? "Add a relationship to start building the map."
              : "Enable spoiler visibility to reveal all map links."
          }
        />
      </div>
    );
  }

  return (
    <div className="relative min-h-[420px] overflow-hidden rounded-lg border bg-editor p-4">
      {characterIds.map((id, index) => {
        const character = data.characters.find((item) => item.id === id);
        const detail = uniqueStrings(
          visibleRelationships
            .filter(
              (relationship) =>
                relationship.fromCharacterId === id || relationship.toCharacterId === id
            )
            .map((relationship) => relationship.relationshipType)
        )
          .slice(0, 2)
          .join(" · ");

        if (!character) {
          return null;
        }

        return (
          <GraphNode
            key={id}
            className={positions[index] ?? positions[0]}
            name={character.name}
            detail={detail || character.role || "linked character"}
          />
        );
      })}
      <div className="absolute inset-x-8 bottom-4 grid gap-2">
        {visibleRelationships.slice(0, 6).map((relationship) => (
          <div
            key={relationship.id}
            className="rounded-md border bg-background/85 px-3 py-2 text-xs shadow-paper-sm"
          >
            <span className="font-medium">
              {characterName(relationship.fromCharacterId, data)}{" "}
              {relationship.direction === "Bidirectional" ? "<->" : "->"}{" "}
              {characterName(relationship.toCharacterId, data)}
            </span>
            <span className="text-muted-foreground">
              {" · "}
              {relationship.relationshipType}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
function GraphNode({
  className,
  name,
  detail
}: {
  className: string;
  name: string;
  detail: string;
}) {
  return (
    <div
      className={cn(
        "absolute w-40 rounded-lg border bg-card p-3 text-center shadow-paper-sm",
        className
      )}
    >
      <div className="mx-auto mb-2 grid size-10 place-items-center rounded-md bg-primary/12 text-primary">
        <UserRound className="size-5" />
      </div>
      <p className="font-semibold">{name}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function TimelineScreen({
  volumeFilter,
  chapterFilter,
  characterFilter,
  placeFilter,
  onVolumeFilterChange,
  onChapterFilterChange,
  onCharacterFilterChange,
  onPlaceFilterChange,
  onAddEvent
}: {
  volumeFilter: string;
  chapterFilter: string;
  characterFilter: string;
  placeFilter: string;
  onVolumeFilterChange: (value: string) => void;
  onChapterFilterChange: (value: string) => void;
  onCharacterFilterChange: (value: string) => void;
  onPlaceFilterChange: (value: string) => void;
  onAddEvent: () => void;
}) {
  const data = useStudioData();
  const filteredEvents = data.timelineEvents.filter((event) => {
    const volumeMatch =
      volumeFilter === "All volumes" || volumeTitle(event.volumeId, data) === volumeFilter;
    const chapterMatch =
      chapterFilter === "All chapters" || chapterTitle(event.chapterId, data) === chapterFilter;
    const characterMatch =
      characterFilter === "All characters" ||
      event.characterIds.some((id) => characterName(id, data) === characterFilter);
    const placeMatch =
      placeFilter === "All places" || placeName(event.locationId, data) === placeFilter;

    return volumeMatch && chapterMatch && characterMatch && placeMatch;
  });
  const grouped = filteredEvents.reduce<Record<string, TimelineEvent[]>>((acc, event) => {
    acc[event.internalDate] = [...(acc[event.internalDate] ?? []), event];
    return acc;
  }, {});
  const groupedEntries = Object.entries(grouped).sort(([left], [right]) => left.localeCompare(right));

  return (
    <div className="grid gap-6">
      <SectionHeader
        eyebrow="Timeline"
        title="Story chronology"
        description="Filter events by volume, chapter, character, or place while keeping spoilers marked."
        action={
          <Button onClick={onAddEvent}>
            <Plus className="size-4" />
            Add event
          </Button>
        }
      />

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
          <FilterSelect
            label="Volume"
            value={volumeFilter}
            values={["All volumes", ...data.volumes.map((v) => v.title)]}
            onValueChange={onVolumeFilterChange}
          />
          <FilterSelect
            label="Chapter"
            value={chapterFilter}
            values={["All chapters", ...data.chapters.map((c) => c.title)]}
            onValueChange={onChapterFilterChange}
          />
          <FilterSelect
            label="Character"
            value={characterFilter}
            values={["All characters", ...data.characters.map((c) => c.name)]}
            onValueChange={onCharacterFilterChange}
          />
          <FilterSelect
            label="Place"
            value={placeFilter}
            values={["All places", ...data.locations.map((p) => p.name)]}
            onValueChange={onPlaceFilterChange}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription>
            {filteredEvents.length} matching event{filteredEvents.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {groupedEntries.length ? (
            groupedEntries.map(([day, events]) => (
              <div key={day} className="grid gap-3 md:grid-cols-[120px_1fr]">
                <div className="font-semibold">{day}</div>
                <div className="space-y-3 border-l pl-4">
                  {events.map((event) => (
                    <div key={event.id} className="rounded-md border bg-background/35 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{event.title}</h3>
                        {event.isSpoiler ? <Badge variant="accent">Spoiler</Badge> : null}
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {event.description}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge variant="outline">{chapterTitle(event.chapterId, data)}</Badge>
                        <Badge variant="outline">{placeName(event.locationId, data)}</Badge>
                        {event.characterIds.map((id) => (
                          <Badge key={id} variant="outline">
                            {characterName(id, data)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              icon={Clock}
              title="No timeline events match those filters"
              description="Adjust one filter to bring linked story beats back into view."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  values,
  onValueChange
}: {
  label: string;
  value: string;
  values: string[];
  onValueChange: (value: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="mt-2">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {values.map((value) => (
            <SelectItem key={value} value={value}>
              {value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NotesScreen({ onAddNote }: { onAddNote: () => void }) {
  const data = useStudioData();
  const grouped = data.notes.reduce<Record<Note["linkedType"], Note[]>>((acc, note) => {
    acc[note.linkedType] = [...(acc[note.linkedType] ?? []), note];
    return acc;
  }, {} as Record<Note["linkedType"], Note[]>);
  const noteTags = uniqueStrings(data.notes.flatMap((note) => note.tags));

  return (
    <div className="grid gap-6">
      <SectionHeader
        eyebrow="Notes"
        title="Story notes"
        description="Group private notes by novel, volume, chapter, scene, character, and place."
        action={
          <Button onClick={onAddNote}>
            <Plus className="size-4" />
            Add note
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap gap-2 p-4">
          {(noteTags.length ? noteTags : ["no-tags"]).map((tag) => (
              <Badge key={tag} variant="outline" className="bg-background/45">
                <Tag className="mr-1 size-3" />
                {tag}
              </Badge>
            ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {Object.entries(grouped).map(([group, groupNotes]) => (
          <Card key={group}>
            <CardHeader>
              <CardTitle>{group}</CardTitle>
              <CardDescription>{groupNotes.length} notes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {groupNotes.map((note) => (
                <div key={note.id} className="rounded-md border bg-background/35 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{note.title}</h3>
                      <p className="text-xs text-muted-foreground">Last edited {note.updatedAt}</p>
                    </div>
                    <Badge variant="outline">{note.linkedType}</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {note.content}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {note.tags.map((tag) => (
                      <Badge key={tag} variant="outline">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
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
                  {backup.date} Â· {backup.size} Â· {backup.includedNovels} included novels
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
  exportFilename,
  onCreateNovel,
  onCreateCharacter,
  onCreatePlace,
  onCreateRelationship,
  onCreateEvent,
  onCreateNote,
  onClose
}: {
  dialog:
    | null
    | "novel"
    | "character"
    | "place"
    | "relationship"
    | "event"
    | "note"
    | "export"
    | "toc";
  exportFilename: string;
  onCreateNovel: (input: CreateNovelInput) => Promise<void>;
  onCreateCharacter: (input: CreateCharacterInput) => Promise<void>;
  onCreatePlace: (input: CreatePlaceInput) => Promise<void>;
  onCreateRelationship: (input: CreateRelationshipInput) => Promise<void>;
  onCreateEvent: (input: CreateTimelineEventInput) => Promise<void>;
  onCreateNote: (input: CreateNoteInput) => Promise<void>;
  onClose: () => void;
}) {
  const data = useStudioData();
  const currentNovel = getCurrentNovel(data);
  const [itemTitle, setItemTitle] = React.useState("");
  const [itemNotes, setItemNotes] = React.useState("");
  const [dialogError, setDialogError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [relationshipForm, setRelationshipForm] = React.useState<CreateRelationshipInput>({
    fromCharacterId: "",
    toCharacterId: "",
    relationshipType: "",
    category: "Social",
    direction: "Directional",
    status: "Growing",
    since: "",
    description: "",
    notes: "",
    isSpoiler: false
  });
  const [eventForm, setEventForm] = React.useState<CreateTimelineEventInput>({
    title: "",
    internalDate: "",
    chapterId: "",
    locationId: "",
    description: "",
    isSpoiler: false
  });
  const dialogCopy = {
    novel: {
      title: "Create or edit story item",
      description:
        "Prototype form for adding a novel, volume, chapter, or scene to the local outline."
    },
    character: {
      title: "Add character",
      description: "Create a private character profile with role, status, and story links."
    },
    place: {
      title: "Add place",
      description: "Add a location with rules, visual notes, and first appearance."
    },
    relationship: {
      title: "Add relationship",
      description: "Define character links, direction, spoiler visibility, and notes."
    },
    event: {
      title: "Add timeline event",
      description: "Create a story chronology entry linked to characters and places."
    },
    note: {
      title: "Add note",
      description: "Capture a private note and attach it to a story entity."
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

  React.useEffect(() => {
    setItemTitle("");
    setItemNotes("");
    setDialogError("");
    setSaving(false);
    setRelationshipForm({
      fromCharacterId: data.characters[0]?.id ?? "",
      toCharacterId: data.characters[1]?.id ?? data.characters[0]?.id ?? "",
      relationshipType: "",
      category: "Social",
      direction: "Directional",
      status: "Growing",
      since: "",
      description: "",
      notes: "",
      isSpoiler: false
    });
    setEventForm({
      title: "",
      internalDate: "",
      chapterId: data.chapters[0]?.id ?? "",
      locationId: data.locations[0]?.id ?? "",
      description: "",
      isSpoiler: false
    });
  }, [data.characters, data.chapters, data.locations, dialog]);

  const submitDialog = async () => {
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
      } else if (dialog === "character") {
        if (!itemTitle.trim()) {
          setDialogError("Name is required.");
          setSaving(false);
          return;
        }
        await onCreateCharacter({
          name: itemTitle.trim(),
          notes: itemNotes.trim()
        });
      } else if (dialog === "place") {
        if (!itemTitle.trim()) {
          setDialogError("Name is required.");
          setSaving(false);
          return;
        }
        await onCreatePlace({
          name: itemTitle.trim(),
          notes: itemNotes.trim()
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

        await onCreateRelationship({
          ...relationshipForm,
          relationshipType: relationshipForm.relationshipType.trim(),
          description: relationshipForm.description.trim(),
          notes: relationshipForm.notes.trim(),
          since: relationshipForm.since.trim(),
          status: relationshipForm.status.trim()
        });
      } else if (dialog === "event") {
        if (!eventForm.title.trim() || !eventForm.internalDate.trim()) {
          setDialogError("Title and internal date are required.");
          setSaving(false);
          return;
        }

        await onCreateEvent({
          ...eventForm,
          title: eventForm.title.trim(),
          internalDate: eventForm.internalDate.trim(),
          description: eventForm.description.trim()
        });
      } else if (dialog === "note") {
        if (!itemTitle.trim()) {
          setDialogError("Title is required.");
          setSaving(false);
          return;
        }
        await onCreateNote({
          title: itemTitle.trim(),
          content: itemNotes.trim()
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
    <Dialog open={Boolean(dialog)} onOpenChange={(open) => (!open ? onClose() : null)}>
      <DialogContent>
        {copy ? (
          <>
            <DialogHeader>
              <DialogTitle>{copy.title}</DialogTitle>
              <DialogDescription>{copy.description}</DialogDescription>
            </DialogHeader>
            {dialog === "toc" ? (
              <div className="max-h-96 overflow-y-auto rounded-md border bg-background/35 p-3">
                {data.volumes.map((volume) => (
                  <div key={volume.id} className="mb-3">
                    <p className="font-semibold">{volume.title}</p>
                    <div className="mt-2 space-y-2 pl-3">
                      {data.chapters
                        .filter((chapter) => chapter.volumeId === volume.id)
                        .map((chapter) => (
                          <button
                            key={chapter.id}
                            type="button"
                            className="block w-full rounded-md px-2 py-1 text-left text-sm hover:bg-secondary"
                          >
                            {chapter.title}
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-3">
                {dialog === "relationship" ? (
                  <>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <Label>From character</Label>
                        <Select
                          value={relationshipForm.fromCharacterId}
                          onValueChange={(value) =>
                            setRelationshipForm((current) => ({ ...current, fromCharacterId: value }))
                          }
                        >
                          <SelectTrigger className="mt-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {data.characters.map((character) => (
                              <SelectItem key={character.id} value={character.id}>
                                {character.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>To character</Label>
                        <Select
                          value={relationshipForm.toCharacterId}
                          onValueChange={(value) =>
                            setRelationshipForm((current) => ({ ...current, toCharacterId: value }))
                          }
                        >
                          <SelectTrigger className="mt-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {data.characters.map((character) => (
                              <SelectItem key={character.id} value={character.id}>
                                {character.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <Label>Relationship type</Label>
                        <Input
                          className="mt-2"
                          value={relationshipForm.relationshipType}
                          placeholder="Trusts, rivals, in love with..."
                          onChange={(event) =>
                            setRelationshipForm((current) => ({
                              ...current,
                              relationshipType: event.target.value
                            }))
                          }
                        />
                      </div>
                      <FilterSelect
                        label="Category"
                        value={relationshipForm.category}
                        values={Object.keys(relationshipCategories)}
                        onValueChange={(value) =>
                          setRelationshipForm((current) => ({
                            ...current,
                            category: value as Relationship["category"]
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <FilterSelect
                        label="Direction"
                        value={relationshipForm.direction}
                        values={["Directional", "Bidirectional"]}
                        onValueChange={(value) =>
                          setRelationshipForm((current) => ({
                            ...current,
                            direction: value as Relationship["direction"]
                          }))
                        }
                      />
                      <div>
                        <Label>Status</Label>
                        <Input
                          className="mt-2"
                          value={relationshipForm.status}
                          placeholder="Growing"
                          onChange={(event) =>
                            setRelationshipForm((current) => ({
                              ...current,
                              status: event.target.value
                            }))
                          }
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Since</Label>
                      <Input
                        className="mt-2"
                        value={relationshipForm.since}
                        placeholder="Chapter 1"
                        onChange={(event) =>
                          setRelationshipForm((current) => ({
                            ...current,
                            since: event.target.value
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Textarea
                        className="mt-2"
                        value={relationshipForm.description}
                        placeholder="Private relationship context"
                        onChange={(event) =>
                          setRelationshipForm((current) => ({
                            ...current,
                            description: event.target.value
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Notes</Label>
                      <Textarea
                        className="mt-2"
                        value={relationshipForm.notes}
                        placeholder="Continuity notes"
                        onChange={(event) =>
                          setRelationshipForm((current) => ({
                            ...current,
                            notes: event.target.value
                          }))
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-md border bg-background/35 p-3">
                      <span className="text-sm">Spoiler relationship</span>
                      <Switch
                        checked={relationshipForm.isSpoiler}
                        onCheckedChange={(value) =>
                          setRelationshipForm((current) => ({ ...current, isSpoiler: value }))
                        }
                      />
                    </div>
                  </>
                ) : dialog === "event" ? (
                  <>
                    <div>
                      <Label>Event title</Label>
                      <Input
                        className="mt-2"
                        value={eventForm.title}
                        placeholder="Midnight bell test"
                        onChange={(event) =>
                          setEventForm((current) => ({ ...current, title: event.target.value }))
                        }
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <Label>Internal date</Label>
                        <Input
                          className="mt-2"
                          value={eventForm.internalDate}
                          placeholder="Day 03"
                          onChange={(event) =>
                            setEventForm((current) => ({
                              ...current,
                              internalDate: event.target.value
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label>Linked chapter</Label>
                        <Select
                          value={eventForm.chapterId}
                          onValueChange={(value) =>
                            setEventForm((current) => ({ ...current, chapterId: value }))
                          }
                        >
                          <SelectTrigger className="mt-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {data.chapters.map((chapter) => (
                              <SelectItem key={chapter.id} value={chapter.id}>
                                {chapter.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label>Linked place</Label>
                      <Select
                        value={eventForm.locationId}
                        onValueChange={(value) =>
                          setEventForm((current) => ({ ...current, locationId: value }))
                        }
                      >
                        <SelectTrigger className="mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {data.locations.map((location) => (
                            <SelectItem key={location.id} value={location.id}>
                              {location.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Textarea
                        className="mt-2"
                        value={eventForm.description}
                        placeholder="What happens in this story beat?"
                        onChange={(event) =>
                          setEventForm((current) => ({
                            ...current,
                            description: event.target.value
                          }))
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-md border bg-background/35 p-3">
                      <span className="text-sm">Spoiler event</span>
                      <Switch
                        checked={eventForm.isSpoiler}
                        onCheckedChange={(value) =>
                          setEventForm((current) => ({ ...current, isSpoiler: value }))
                        }
                      />
                    </div>
                  </>
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
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    {dialogError}
                  </div>
                ) : null}
                <div className="flex items-center justify-between rounded-md border bg-background/35 p-3">
                  <span className="text-sm">Current novel: {currentNovel.title}</span>
                  <Switch defaultChecked />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={submitDialog} disabled={saving}>
                {dialog === "export" ? "Generate" : saving ? "Saving..." : "Save item"}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}



