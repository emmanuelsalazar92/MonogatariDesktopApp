import type { PageId } from "@/lib/studio-domain";

const novelSections: Record<string, PageId> = {
  structure: "structure",
  editor: "editor",
  reader: "reader",
  characters: "characters",
  places: "places",
  relationships: "relationships",
  timeline: "timeline",
  notes: "notes"
};

const globalPaths: Partial<Record<PageId, string>> = {
  dashboard: "/",
  library: "/library",
  export: "/export",
  backups: "/backups",
  settings: "/settings"
};

export type StudioRoute = {
  page: PageId;
  novelId?: string;
  sceneId?: string;
  characterId?: string;
  placeId?: string;
};

export function routeForPage(page: PageId, novelId?: string, sceneId?: string) {
  const globalPath = globalPaths[page];
  if (globalPath) return globalPath;
  if (!novelId) return "/library";

  const encodedNovelId = encodeURIComponent(novelId);
  if (page === "overview") return `/novels/${encodedNovelId}`;
  if (page === "editor" && sceneId) {
    return `/novels/${encodedNovelId}/editor/${encodeURIComponent(sceneId)}`;
  }
  return `/novels/${encodedNovelId}/${page}`;
}

export function routeForCharacter(novelId: string, characterId?: string) {
  const baseRoute = routeForPage("characters", novelId);
  return characterId ? `${baseRoute}/${encodeURIComponent(characterId)}` : baseRoute;
}

export function routeForPlace(novelId: string, placeId?: string) {
  const baseRoute = routeForPage("places", novelId);
  return placeId ? `${baseRoute}/${encodeURIComponent(placeId)}` : baseRoute;
}

export function parseStudioRoute(pathname: string): StudioRoute | null {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  const globalRoute = (Object.entries(globalPaths) as Array<[PageId, string]>).find(
    ([, path]) => path === normalizedPath
  );
  if (globalRoute) return { page: globalRoute[0] };

  const sceneMatch = /^\/novels\/([^/]+)\/editor\/([^/]+)$/.exec(normalizedPath);
  if (sceneMatch) {
    try {
      const novelId = decodeURIComponent(sceneMatch[1]);
      const sceneId = decodeURIComponent(sceneMatch[2]);
      return isValidNovelRouteId(novelId) && isValidSceneRouteId(sceneId)
        ? { page: "editor", novelId, sceneId }
        : null;
    } catch {
      return null;
    }
  }

  const entityMatch = /^\/novels\/([^/]+)\/(characters|places)\/([^/]+)$/.exec(normalizedPath);
  if (entityMatch) {
    try {
      const novelId = decodeURIComponent(entityMatch[1]);
      const entityId = decodeURIComponent(entityMatch[3]);
      if (!isValidNovelRouteId(novelId) || !isValidNovelRouteId(entityId)) return null;
      return entityMatch[2] === "characters"
        ? { page: "characters", novelId, characterId: entityId }
        : { page: "places", novelId, placeId: entityId };
    } catch {
      return null;
    }
  }

  const match = /^\/novels\/([^/]+)(?:\/([^/]+))?$/.exec(normalizedPath);
  if (!match) return null;

  let novelId: string;
  try {
    novelId = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  if (!isValidNovelRouteId(novelId)) return null;

  if (!match[2]) return { page: "overview", novelId };
  const section = match[2];
  return isNovelWorkspaceSection(section)
    ? { page: novelSections[section], novelId }
    : null;
}

export function isNovelWorkspaceSection(section: string) {
  return Object.hasOwn(novelSections, section);
}

export function isValidNovelRouteId(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
}

export const isValidSceneRouteId = isValidNovelRouteId;
export const isValidCharacterRouteId = isValidNovelRouteId;
export const isValidPlaceRouteId = isValidNovelRouteId;
