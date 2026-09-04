import {
  Archive,
  BookOpen,
  CalendarDays,
  Download,
  Home,
  Library,
  MapPin,
  Network,
  NotebookTabs,
  PenLine,
  ScrollText,
  Settings,
  UserRound,
  Workflow
} from "lucide-react";

export type NovelStatus =
  | "Idea"
  | "Planning"
  | "Writing"
  | "Revision"
  | "Complete"
  | "Archived";

// Chapters and scenes share this persisted narrative workflow. Archival is
// deliberately modeled by each entity's `archived` flag, not as a narrative
// status, so restoring a parent cannot overwrite a child's own workflow.
export const narrativeStatuses = [
  "Idea",
  "Draft",
  "Writing",
  "Revision",
  "Ready",
  "Final"
] as const;

export type ChapterStatus = (typeof narrativeStatuses)[number];

export function isNarrativeStatus(value: unknown): value is ChapterStatus {
  return typeof value === "string" && narrativeStatuses.includes(value as ChapterStatus);
}

export type SidebarState = "expanded" | "compact" | "hidden";

export type PageId =
  | "dashboard"
  | "library"
  | "overview"
  | "structure"
  | "editor"
  | "reader"
  | "characters"
  | "places"
  | "relationships"
  | "timeline"
  | "notes"
  | "export"
  | "backups"
  | "settings";

export type FocusMode = "none" | "writing" | "reading";

export interface Novel {
  id: string;
  title: string;
  synopsis: string;
  status: NovelStatus;
  coverImage: string;
  genre: string;
  tags: string[];
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Volume {
  id: string;
  novelId: string;
  title: string;
  sortOrder: number;
  summary: string;
  archived: boolean;
}

export interface Chapter {
  id: string;
  volumeId: string;
  title: string;
  summary: string;
  status: ChapterStatus;
  sortOrder: number;
  wordCount: number;
  archived: boolean;
}

export interface Scene {
  id: string;
  chapterId: string;
  title: string;
  content: string;
  summary: string;
  status: ChapterStatus;
  locationId: string;
  locationIds?: string[];
  sortOrder: number;
  wordCount: number;
  objective: string;
  revision: number;
  archived: boolean;
}

export interface WritingActivity {
  id: string;
  novelId: string;
  sceneId: string;
  wordDelta: number;
  createdAt: string;
}

export interface Character {
  id: string;
  novelId: string;
  name: string;
  alias: string;
  aliases: string[];
  age: string;
  role: "Protagonist" | "Antagonist" | "Support" | "Minor" | "Cameo" | "Other";
  appearance: string;
  personality: string;
  wayOfSpeaking: string;
  goal: string;
  fear: string;
  secret: string;
  notes: string;
  firstAppearance: string;
  status: "Active" | "Inactive" | "Archived";
  narrativeStatus: "Secondary" | "Missing" | "Deceased" | "Spoiler" | "";
  isSpoiler?: boolean;
  image: string;
  updatedAt: string;
  archivedAt: string | null;
  scenes: number;
  places?: number;
  relationships?: number;
  firstAppearanceOrder: number | null;
}

export interface Location {
  id: string;
  novelId: string;
  name: string;
  type: import("./place-classification").PlaceType;
  region: string;
  description: string;
  importance: string;
  visualNotes: string;
  rules: string;
  firstAppearance: string;
  notes: string;
  status: import("./place-classification").PlaceStatus;
  atmosphere: string;
  parentPlaceId: string | null;
  revision: number;
  updatedAt?: string | null;
  sceneCount?: number;
  linkedScenes?: import("./scene-place").PlaceSceneSummary[];
}

// Catalogs and entity selectors must never carry a Place's private narrative fields.
export type PlaceSummary = Pick<Location, "id" | "novelId" | "name" | "type" | "status" | "parentPlaceId" | "revision" | "updatedAt" | "firstAppearance" | "sceneCount"> & {
  parent: { id: string; name: string } | null;
  characterCount: number;
  eventCount: number;
  childCount: number;
  firstAppearanceScene: import("./scene-place").PlaceSceneSummary | null;
};

export const characterPlaceRelationshipTypes = [
  "Lives at",
  "Works at",
  "Frequent location",
  "Associated with"
] as const;

export type CharacterPlaceRelationshipType =
  (typeof characterPlaceRelationshipTypes)[number];

export interface CharacterPlaceLink {
  characterId: string;
  locationId: string;
  relationshipType: CharacterPlaceRelationshipType;
}

export interface Relationship {
  id: string;
  revision?: number;
  archivedAt?: string | null;
  novelId: string;
  fromCharacterId: string;
  toCharacterId: string;
  relationshipType: string;
  category: "Family" | "Romance" | "Social" | "Conflict" | "Secret/Spoiler" | "Unclassified";
  direction: "Directional" | "Bidirectional";
  description: string;
  isSpoiler: boolean;
  status: string;
  since: string;
  sinceKind?: import("./character-relationship").RelationshipSince["sinceKind"];
  sinceTargetId?: string | null;
  notes: string;
  labelFromTo: string;
  labelToFrom: string;
}

// Catalogs never contain private narrative fields, including custom Since text.
export type RelationshipSummary = Pick<Relationship, "id" | "novelId" | "revision" | "archivedAt" | "fromCharacterId" | "toCharacterId" | "relationshipType" | "category" | "direction" | "isSpoiler" | "labelFromTo" | "labelToFrom">;

export type TimelineEventSummary = Omit<TimelineEvent, "description">;

export interface TimelineEvent {
  id: string;
  novelId: string;
  title: string;
  internalDate: string;
  sortIndex: number;
  chronologyKind: "manual" | "relative";
  relativeDay: number | null;
  relativeMinute: number | null;
  positionRevision: number;
  archivedAt?: string | null;
  volumeId: string;
  chapterId: string;
  sceneId: string;
  locationIds: string[];
  characterIds: string[];
  description: string;
  isSpoiler: boolean;
}

export interface Note {
  links?: { type: "Volume" | "Chapter" | "Scene" | "Character" | "Place" | "TimelineEvent"; id: string; title: string; archived: boolean }[];
  pinned?: boolean;
  workflowStatus?: string;
  archivedAt?: string | null;
  createdAt?: string;
  revision?: number;
  id: string;
  novelId: string;
  linkedType:
    | "Novel"
    | "Volume"
    | "Chapter"
    | "Scene"
    | "Character"
    | "Place"
    | "TimelineEvent";
  linkedId: string;
  title: string;
  content: string;
  quotedText?: string;
  tags: string[];
  updatedAt: string;
}

export const navigationItems = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "library", label: "Library", icon: Library },
  { id: "overview", label: "Current Novel", icon: BookOpen },
  { id: "structure", label: "Structure", icon: Workflow },
  { id: "editor", label: "Editor", icon: PenLine },
  { id: "reader", label: "Reader", icon: ScrollText },
  { id: "characters", label: "Characters", icon: UserRound },
  { id: "places", label: "Places", icon: MapPin },
  { id: "relationships", label: "Relationships", icon: Network },
  { id: "timeline", label: "Timeline", icon: CalendarDays },
  { id: "notes", label: "Notes", icon: NotebookTabs },
  { id: "export", label: "Export", icon: Download },
  { id: "backups", label: "Backups", icon: Archive },
  { id: "settings", label: "Settings", icon: Settings }
] satisfies { id: PageId; label: string; icon: typeof Home }[];

export const exportScopes = [
  "Full novel",
  "Selected volume",
  "Selected chapter",
  "Selected scene",
  "Character bible",
  "Places bible",
  "Relationship map",
  "Full novel bible",
  "Backup ZIP"
];

export const exportFormats = [
  "Markdown",
  "TXT",
  "PDF",
  "DOCX",
  "EPUB",
  "HTML",
  "ZIP backup"
];

export const exportOptions = [
  "Include cover",
  "Include table of contents",
  "Include scene titles",
  "Include notes",
  "Include spoilers",
  "Include character list",
  "Include places",
  "Include relationships",
  "Include timeline",
  "Include metadata"
];

export { placeTypes } from "./place-classification";

export const genreFilters = [
  "All genres",
  "Light Novel",
  "Fantasy",
  "School Mystery",
  "Supernatural",
  "Court Drama"
];

export const statusFilters = [
  "All statuses",
  "Idea",
  "Planning",
  "Writing",
  "Revision",
  "Complete",
  "Archived"
];

export const shortcutHints = [
  "Ctrl + S: Save",
  "Ctrl + \\: Toggle sidebar",
  "Ctrl + Enter: Enter focus mode",
  "Esc: Exit focus mode"
];
