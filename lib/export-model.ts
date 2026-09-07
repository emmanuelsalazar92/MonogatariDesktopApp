import type { ExportScope } from "@/lib/export-contract";

export type ExportScene = {
  id: string;
  title: string;
  content: string;
  sortOrder: number;
};

export type ExportChapter = {
  id: string;
  title: string;
  summary: string;
  sortOrder: number;
  scenes: ExportScene[];
};

export type ExportVolume = {
  id: string;
  title: string;
  summary: string;
  sortOrder: number;
  chapters: ExportChapter[];
};

export type ExportModel = {
  novel: {
    id: string;
    title: string;
    synopsis: string;
    genre: string;
    tags: string[];
  };
  scope: { type: ExportScope; id: string };
  volumes: ExportVolume[];
};

// All renderer input crosses this single text boundary. It removes control
// characters that can alter generated files while preserving manuscript layout.
export function sanitizeExportText(value: unknown, limit = 5_000_000) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .slice(0, limit);
}

export function parseExportTags(value: unknown) {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string").map((tag) => sanitizeExportText(tag, 60)).slice(0, 20)
      : [];
  } catch {
    return [];
  }
}

export function safeExportFilename(value: string) {
  const slug = sanitizeExportText(value, 160)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "novel";
}

export function escapeExportHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeMarkdownHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
