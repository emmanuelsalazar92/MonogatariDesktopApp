import {
  defaultPersistedStudioSettings,
  type PersistedStudioSettings
} from "@/lib/studio-data";

export const STUDIO_CONFIGURATION_ID = "studio";
export const STUDIO_CONFIGURATION_VERSION = 1;

const allowedValues: Record<keyof PersistedStudioSettings, readonly string[]> = {
  theme: ["light", "dark", "system"],
  language: ["en", "es"],
  sidebarState: ["expanded", "compact", "hidden"],
  editorFontSize: ["16 px", "18 px", "20 px", "22 px"],
  readerFontSize: ["16 px", "18 px", "20 px", "22 px"],
  autosaveInterval: ["10 seconds", "30 seconds", "60 seconds", "Manual only"],
  defaultFocusMode: ["Writing", "Reading", "Off"],
  defaultReadingMode: ["Light", "Dark", "Sepia"],
  backupRetention: ["7 daily backups", "30 daily backups", "90 daily backups"],
  localServerDisplayName: [],
  exportDefaults: [],
  typewriterFont: ["true", "false"],
  notionRootPageId: [],
  notionAutosyncEnabled: ["true", "false"],
  notionAutosyncIntervalMinutes: ["1", "2", "5", "10", "15", "30"],
  dailyWordGoal: ["500", "1000", "1500", "2000", "3000"]
};

function isNonSecretText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length <= 500;
}

export function parseStudioSettings(value: string | null | undefined): PersistedStudioSettings {
  if (!value) return { ...defaultPersistedStudioSettings };
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...defaultPersistedStudioSettings };
    }
    return applyStudioSettings(defaultPersistedStudioSettings, parsed);
  } catch {
    return { ...defaultPersistedStudioSettings };
  }
}

export function applyStudioSettings(
  current: PersistedStudioSettings,
  changes: Record<string, unknown>
): PersistedStudioSettings {
  const next = { ...current };
  for (const [key, value] of Object.entries(changes)) {
    if (!(key in allowedValues) || !isNonSecretText(value)) continue;
    const settingKey = key as keyof PersistedStudioSettings;
    const normalized = value.trim();
    const options = allowedValues[settingKey];
    if ((options.length > 0 && !options.includes(normalized)) || (options.length === 0 && !normalized)) {
      continue;
    }
    (next as Record<string, string | boolean>)[settingKey] =
      settingKey === "typewriterFont" || settingKey === "notionAutosyncEnabled"
        ? normalized === "true"
        : normalized;
  }
  return next;
}

export function hasOnlyKnownStudioSettings(changes: Record<string, unknown>) {
  return Object.keys(changes).length > 0 && Object.keys(changes).every((key) => key in allowedValues);
}
