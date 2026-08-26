import {
  defaultPersistedStudioSettings,
  type PersistedStudioSettings
} from "@/lib/studio-data";
import { exportFormats, exportOptions } from "@/lib/studio-domain";

export const STUDIO_CONFIGURATION_ID = "studio";
export const STUDIO_CONFIGURATION_VERSION = 1;
export const notionAutosyncIntervals = ["1", "2", "5", "10", "15", "30"] as const;
export const backupRetentionPolicies = [
  "7 daily backups",
  "30 daily backups",
  "90 daily backups"
] as const;

export type ExportDefaults = {
  format: string;
  options: string[];
};

export const defaultExportDefaults: ExportDefaults = {
  format: "EPUB",
  options: ["Include cover", "Include metadata"]
};

const allowedValues: Record<keyof PersistedStudioSettings, readonly string[]> = {
  theme: ["light", "dark", "system"],
  language: ["en", "es"],
  sidebarState: ["expanded", "compact", "hidden"],
  editorFontSize: ["16 px", "18 px", "20 px", "22 px"],
  readerFontSize: ["16 px", "18 px", "20 px", "22 px"],
  autosaveInterval: ["10 seconds", "30 seconds", "60 seconds", "Manual only"],
  defaultFocusMode: ["Writing", "Reading", "Off"],
  defaultReadingMode: ["Light", "Dark", "Sepia"],
  backupRetention: backupRetentionPolicies,
  exportDefaults: [],
  typewriterFont: ["true", "false"],
  notionRootPageId: [],
  notionRootPageTitle: [],
  notionAutosyncEnabled: ["true", "false"],
  notionAutosyncIntervalMinutes: notionAutosyncIntervals,
  dailyWordGoal: ["500", "1000", "1500", "2000", "3000"]
};

function isNonSecretText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length <= 500;
}

function validExportDefaults(value: unknown): ExportDefaults | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as { format?: unknown; options?: unknown };
  if (typeof candidate.format !== "string" || !exportFormats.includes(candidate.format)) return null;
  if (!Array.isArray(candidate.options) || !candidate.options.every((option) => typeof option === "string" && exportOptions.includes(option))) {
    return null;
  }
  return { format: candidate.format, options: [...new Set(candidate.options)] };
}

export function serializeExportDefaults(value: ExportDefaults) {
  return JSON.stringify({
    format: value.format,
    options: [...new Set(value.options)].filter((option) => exportOptions.includes(option))
  });
}

export function parseExportDefaults(value: string) {
  try {
    return validExportDefaults(JSON.parse(value)) ?? { ...defaultExportDefaults };
  } catch {
    return { ...defaultExportDefaults };
  }
}

function normalizeExportDefaults(value: string) {
  try {
    const defaults = validExportDefaults(JSON.parse(value));
    return defaults ? serializeExportDefaults(defaults) : null;
  } catch {
    return null;
  }
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
    let normalized = value.trim();
    if (settingKey === "exportDefaults") {
      const exportDefaults = normalizeExportDefaults(normalized);
      if (!exportDefaults) continue;
      normalized = exportDefaults;
    }
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

export function notionAutosyncIntervalMilliseconds(value: string) {
  if (!notionAutosyncIntervals.includes(value as (typeof notionAutosyncIntervals)[number])) {
    return null;
  }
  return Number(value) * 60_000;
}

export function backupRetentionLimit(value: string) {
  const match = /^(7|30|90) daily backups$/.exec(value);
  return match ? Number(match[1]) : null;
}
