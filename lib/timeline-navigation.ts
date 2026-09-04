import type { TimelineEventSummary } from "./studio-domain";
import type { RelationshipSinceOption } from "./relationship-since";
import { isValidNovelRouteId, routeForPage } from "./studio-routes";

// options must be projected for novelId using relationshipSinceOptions, which validates
// the full Volume -> Chapter -> Scene ownership chain. Never fall back to a raw target ID.
export function timelineStoryTarget(event: Pick<TimelineEventSummary, "novelId" | "sceneId" | "chapterId" | "volumeId">, novelId: string, options: RelationshipSinceOption[]) {
  if (event.novelId !== novelId || !isValidNovelRouteId(novelId)) return null;
  const kind = event.sceneId ? "scene" : event.chapterId ? "chapter" : "volume";
  const id = event.sceneId || event.chapterId || event.volumeId;
  if (!isValidNovelRouteId(id)) return null;
  const target = options.find(option => option.kind === kind && option.id === id && !option.archived);
  if (!target) return null;
  return { label: target.label, action: kind === "scene" ? "Open scene" : kind === "chapter" ? "Open chapter" : "Open volume",
    href: kind === "scene" ? routeForPage("editor", novelId, id) : `${routeForPage("structure", novelId)}?kind=${kind}&target=${encodeURIComponent(id)}` };
}
