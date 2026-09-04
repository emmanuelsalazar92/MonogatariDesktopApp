import type { TimelineEventSummary } from "./studio-domain";
import { isValidNovelRouteId, routeForTimelineEvent, routeForPage } from "./studio-routes";
import { compareChronology } from "./timeline-position";

export type TimelineCatalogState = { q: string; volume: string; chapter: string; character: string; place: string; spoilers: boolean; archived: boolean };
export const defaultTimelineCatalog: TimelineCatalogState = { q: "", volume: "", chapter: "", character: "", place: "", spoilers: false, archived: false };
export function parseTimelineCatalog(params: URLSearchParams): TimelineCatalogState {
  const id = (key: string) => { const value = params.get(key); return value && isValidNovelRouteId(value) ? value : ""; };
  return { q: (params.get("q") ?? "").slice(0, 200), volume: id("volume"), chapter: id("chapter"), character: id("character"), place: id("place"), spoilers: params.get("spoilers") === "true", archived: params.get("archived") === "true" };
}
export function timelineCatalogQuery(state: TimelineCatalogState) {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q.slice(0, 200));
  for (const key of ["volume", "chapter", "character", "place"] as const) if (state[key] && isValidNovelRouteId(state[key])) params.set(key, state[key]);
  if (state.spoilers) params.set("spoilers", "true");
  if (state.archived) params.set("archived", "true");
  return params.toString();
}
export function timelineCatalogRoute(novelId: string, state: TimelineCatalogState, eventId?: string) {
  const path = eventId ? routeForTimelineEvent(novelId, eventId) : routeForPage("timeline", novelId), query = timelineCatalogQuery(state);
  return query ? `${path}?${query}` : path;
}
export type TimelineCatalogEntities = {
  volumes: { id: string; novelId: string }[]; chapters: { id: string; volumeId: string }[];
  characters: { id: string; novelId: string }[]; locations: { id: string; novelId: string }[];
};
export function normalizeTimelineCatalog(state: TimelineCatalogState, novelId: string, data: TimelineCatalogEntities) {
  const volumes = new Set(data.volumes.filter(v => v.novelId === novelId).map(v => v.id));
  const volume = volumes.has(state.volume) ? state.volume : "";
  const chapter = data.chapters.some(c => c.id === state.chapter && volumes.has(c.volumeId) && (!volume || c.volumeId === volume)) ? state.chapter : "";
  return { ...state, volume, chapter,
    character: data.characters.some(c => c.id === state.character && c.novelId === novelId) ? state.character : "",
    place: data.locations.some(p => p.id === state.place && p.novelId === novelId) ? state.place : "" };
}
export function filterTimelineEvents(events: TimelineEventSummary[], novelId: string, state: TimelineCatalogState) {
  const query = state.q.trim().toLocaleLowerCase();
  // Hide completely BEFORE search and counts. Private descriptions are never inspected.
  return events.filter(event => event.novelId === novelId && isValidNovelRouteId(event.id) && (state.spoilers || !event.isSpoiler)
    && (state.archived || !event.archivedAt)
    && (!query || event.title.toLocaleLowerCase().includes(query))
    && (!state.volume || event.volumeId === state.volume) && (!state.chapter || event.chapterId === state.chapter)
    && (!state.character || event.characterIds.includes(state.character)) && (!state.place || event.locationIds.includes(state.place)))
    .sort(compareChronology);
}
