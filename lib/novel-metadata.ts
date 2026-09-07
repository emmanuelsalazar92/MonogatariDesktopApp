import type { Novel } from "@/lib/studio-domain";

export type NovelMetadataInput = Pick<Novel, "title" | "synopsis" | "genre" | "tags">;
export type NovelMetadataFieldErrors = Partial<Record<keyof NovelMetadataInput, string>>;

const limits = {
  title: 160,
  synopsis: 5_000,
  genre: 120,
  tag: 60,
  tags: 20
} as const;

function text(value: unknown) {
  return typeof value === "string" ? value.normalize("NFC").trim() : null;
}

export function normalizeNovelTags(value: unknown) {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of value) {
    const tag = text(item);
    if (!tag) continue;
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

// This is deliberately limited to editorial fields. Cover uploads stay with the
// existing trusted upload flow when one is available; URLs are not imported here.
export function validateNovelMetadata(value: unknown):
  | { ok: true; data: NovelMetadataInput }
  | { ok: false; error: string; fieldErrors: NovelMetadataFieldErrors } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Invalid novel metadata", fieldErrors: {} };
  }

  const input = value as Record<string, unknown>;
  const allowed = new Set<keyof NovelMetadataInput>(["title", "synopsis", "genre", "tags"]);
  const unknown = Object.keys(input).filter((key) => !allowed.has(key as keyof NovelMetadataInput));
  if (unknown.length) {
    return { ok: false, error: `Fields are not editable: ${unknown.join(", ")}`, fieldErrors: {} };
  }

  const fieldErrors: NovelMetadataFieldErrors = {};
  const title = text(input.title);
  const synopsis = text(input.synopsis ?? "");
  const genre = text(input.genre ?? "");
  const tags = normalizeNovelTags(input.tags ?? []);

  if (title === null) fieldErrors.title = "Title must be text";
  else if (!title) fieldErrors.title = "Title is required";
  else if (title.length > limits.title) fieldErrors.title = `Title must be ${limits.title} characters or fewer`;

  if (synopsis === null) fieldErrors.synopsis = "Synopsis must be text";
  else if (synopsis.length > limits.synopsis) fieldErrors.synopsis = `Synopsis must be ${limits.synopsis} characters or fewer`;

  if (genre === null) fieldErrors.genre = "Genre must be text";
  else if (genre.length > limits.genre) fieldErrors.genre = `Genre must be ${limits.genre} characters or fewer`;

  if (!tags) fieldErrors.tags = "Tags must be a list";
  else if (tags.length > limits.tags) fieldErrors.tags = `Use ${limits.tags} tags or fewer`;
  else if (tags.some((tag) => tag.length > limits.tag)) fieldErrors.tags = `Each tag must be ${limits.tag} characters or fewer`;

  if (Object.keys(fieldErrors).length || !title || synopsis === null || genre === null || !tags) {
    return { ok: false, error: "Review the highlighted fields", fieldErrors };
  }

  return { ok: true, data: { title, synopsis, genre, tags } };
}
