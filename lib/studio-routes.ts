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
};

export function routeForPage(page: PageId, novelId?: string) {
  const globalPath = globalPaths[page];
  if (globalPath) return globalPath;
  if (!novelId) return "/library";

  const encodedNovelId = encodeURIComponent(novelId);
  if (page === "overview") return `/novels/${encodedNovelId}`;
  return `/novels/${encodedNovelId}/${page}`;
}

export function parseStudioRoute(pathname: string): StudioRoute | null {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  const globalRoute = (Object.entries(globalPaths) as Array<[PageId, string]>).find(
    ([, path]) => path === normalizedPath
  );
  if (globalRoute) return { page: globalRoute[0] };

  const match = /^\/novels\/([^/]+)(?:\/([^/]+))?$/.exec(normalizedPath);
  if (!match) return null;

  let novelId: string;
  try {
    novelId = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  if (!novelId) return null;

  if (!match[2]) return { page: "overview", novelId };
  const page = novelSections[match[2]];
  return page ? { page, novelId } : null;
}

export function isNovelWorkspaceSection(section: string) {
  return section in novelSections;
}

export function isValidNovelRouteId(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
}
