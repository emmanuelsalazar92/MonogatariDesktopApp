import type { Volume, Chapter, Scene, Relationship } from "@/lib/studio-domain";
import { isValidNovelRouteId, routeForPage } from "./studio-routes";

export type RelationshipSinceOption = { kind: "volume" | "chapter" | "scene"; id: string; label: string; archived: boolean };

// Only metadata leaves this projection. Parent maps prevent cross-novel paths;
// fixed Volume → Chapter → Scene depth never follows arbitrary recursive data.
export function relationshipSinceOptions(novelId: string,
  volumes: Pick<Volume, "id" | "novelId" | "title" | "sortOrder" | "archived">[],
  chapters: Pick<Chapter, "id" | "volumeId" | "title" | "sortOrder" | "archived">[],
  scenes: Pick<Scene, "id" | "chapterId" | "title" | "sortOrder" | "archived">[]) {
  const options: RelationshipSinceOption[] = [];
  const order = (a: { sortOrder: number; id: string }, b: { sortOrder: number; id: string }) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
  const chaptersByVolume = new Map<string, typeof chapters>();
  const scenesByChapter = new Map<string, typeof scenes>();
  for (const chapter of chapters) { const list = chaptersByVolume.get(chapter.volumeId) ?? []; list.push(chapter); chaptersByVolume.set(chapter.volumeId, list); }
  for (const scene of scenes) { const list = scenesByChapter.get(scene.chapterId) ?? []; list.push(scene); scenesByChapter.set(scene.chapterId, list); }
  for (const volume of volumes.filter((item) => item.novelId === novelId).sort(order)) {
    options.push({ kind: "volume", id: volume.id, label: volume.title, archived: volume.archived });
    for (const chapter of (chaptersByVolume.get(volume.id) ?? []).sort(order)) {
      const label = `${volume.title} · ${chapter.title}`;
      const archived = volume.archived || chapter.archived;
      options.push({ kind: "chapter", id: chapter.id, label, archived });
      for (const scene of (scenesByChapter.get(chapter.id) ?? []).sort(order)) {
        options.push({ kind: "scene", id: scene.id, label: `${label} · ${String(scene.sortOrder).padStart(2, "0")} — ${scene.title}`, archived: archived || scene.archived });
      }
    }
  }
  return options;
}

export function relationshipSinceLabel(relationship: Pick<Relationship, "since" | "sinceKind" | "sinceTargetId">, options: RelationshipSinceOption[]) {
  const kind = relationship.sinceKind ?? (relationship.since ? "custom" : "unknown");
  if (kind === "before_story") return "Before story";
  if (kind === "custom") return relationship.since ? `Custom: ${relationship.since}` : "Unknown";
  if (kind === "unknown") return "Unknown";
  const target = options.find((option) => option.kind === kind && option.id === relationship.sinceTargetId);
  return target ? `${target.label}${target.archived ? " (Archived)" : ""}` : "Structure target unavailable";
}

export function relationshipSinceHref(novelId: string, relationship: Pick<Relationship, "sinceKind" | "sinceTargetId">, options: RelationshipSinceOption[]) {
  const target = options.find((option) => option.kind === relationship.sinceKind && option.id === relationship.sinceTargetId && !option.archived);
  return target && isValidNovelRouteId(target.id) ? `${routeForPage("structure", novelId)}?kind=${target.kind}&target=${encodeURIComponent(target.id)}` : null;
}

export function relationshipStructureSelection(params: Pick<URLSearchParams, "get">, options: RelationshipSinceOption[]) {
  const kind = params.get("kind"), id = params.get("target");
  const target = options.find((option) => option.kind === kind && option.id === id && !option.archived);
  return target && isValidNovelRouteId(target.id) ? { type: target.kind, id: target.id } : null;
}
