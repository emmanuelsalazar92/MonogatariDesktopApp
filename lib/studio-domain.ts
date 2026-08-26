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

export type ChapterStatus =
  | "Idea"
  | "Draft"
  | "Writing"
  | "Revision"
  | "Ready"
  | "Final"
  | "Archived";

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
  sortOrder: number;
  wordCount: number;
  objective: string;
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
  status: "Active" | "Secondary" | "Missing" | "Dead" | "Spoiler" | "Archived";
  image: string;
  scenes: number;
}

export interface Location {
  id: string;
  novelId: string;
  name: string;
  type:
    | "House"
    | "School"
    | "City"
    | "Kingdom"
    | "Forest"
    | "Temple"
    | "Dungeon"
    | "Shop"
    | "Room"
    | "Other World"
    | "Other";
  region: string;
  description: string;
  importance: string;
  visualNotes: string;
  rules: string;
  firstAppearance: string;
  notes: string;
}

export interface Relationship {
  id: string;
  novelId: string;
  fromCharacterId: string;
  toCharacterId: string;
  relationshipType: string;
  category: "Family" | "Romance" | "Social" | "Conflict" | "Secret/Spoiler";
  direction: "Directional" | "Bidirectional";
  description: string;
  isSpoiler: boolean;
  status: string;
  since: string;
  notes: string;
}

export interface TimelineEvent {
  id: string;
  novelId: string;
  title: string;
  internalDate: string;
  volumeId: string;
  chapterId: string;
  sceneId: string;
  locationId: string;
  characterIds: string[];
  description: string;
  isSpoiler: boolean;
}

export interface Note {
  id: string;
  novelId: string;
  linkedType:
    | "Novel"
    | "Volume"
    | "Chapter"
    | "Scene"
    | "Character"
    | "Place";
  linkedId: string;
  title: string;
  content: string;
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

export const relationshipCategories = {
  Family: [
    "Father of",
    "Mother of",
    "Brother of",
    "Sister of",
    "Cousin of",
    "Uncle of",
    "Grandparent of",
    "Descendant of"
  ],
  Romance: [
    "In love with",
    "Has romantic interest in",
    "Ex partner of",
    "Partner of",
    "Fiance of",
    "Unrequited love",
    "Romantic rival of"
  ],
  Social: [
    "Friend of",
    "Best friend of",
    "Classmate of",
    "Mentor of",
    "Student of",
    "Protector of",
    "Servant of",
    "Boss of"
  ],
  Conflict: [
    "Enemy of",
    "Rival of",
    "Betrayed",
    "Wants revenge on",
    "Distrusts",
    "Fears"
  ],
  "Secret/Spoiler": [
    "Knows the secret of",
    "Is hidden identity of",
    "Is manipulated by",
    "Is heir of",
    "Is reincarnation of"
  ]
} as const;

export const placeTypes = [
  "House",
  "School",
  "City",
  "Kingdom",
  "Forest",
  "Temple",
  "Dungeon",
  "Shop",
  "Room",
  "Other World",
  "Other"
];

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
