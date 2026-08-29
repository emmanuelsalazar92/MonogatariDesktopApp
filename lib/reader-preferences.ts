export const readerThemes = ["Light", "Sepia", "Dark"] as const;

export type ReaderTheme = (typeof readerThemes)[number];

export const defaultReaderPreferences = {
  theme: "Sepia" as ReaderTheme,
  fontSize: 18,
  width: 720
};

export const readerPreferenceRanges = {
  fontSize: { min: 15, max: 24 },
  width: { min: 560, max: 900 }
};

function parseInteger(value: unknown) {
  if (typeof value === "number") return Number.isInteger(value) ? value : null;
  if (typeof value !== "string" || !/^\s*\d+\s*(?:px)?\s*$/i.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizeRangedPixels(value: unknown, min: number, max: number) {
  const parsed = parseInteger(value);
  return parsed !== null && parsed >= min && parsed <= max ? `${parsed} px` : null;
}

export function normalizeReaderFontSize(value: unknown) {
  return normalizeRangedPixels(
    value,
    readerPreferenceRanges.fontSize.min,
    readerPreferenceRanges.fontSize.max
  );
}

export function normalizeReaderWidth(value: unknown) {
  return normalizeRangedPixels(
    value,
    readerPreferenceRanges.width.min,
    readerPreferenceRanges.width.max
  );
}

export function parseReaderFontSize(value: unknown) {
  const normalized = normalizeReaderFontSize(value);
  return normalized ? Number.parseInt(normalized, 10) : defaultReaderPreferences.fontSize;
}

export function parseReaderWidth(value: unknown) {
  const normalized = normalizeReaderWidth(value);
  return normalized ? Number.parseInt(normalized, 10) : defaultReaderPreferences.width;
}

export function isReaderTheme(value: unknown): value is ReaderTheme {
  return typeof value === "string" && readerThemes.includes(value as ReaderTheme);
}
