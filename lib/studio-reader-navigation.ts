import {
  getReaderScopeUnits,
  type ReaderChapter,
  type ReaderScene,
  type ReaderScope,
  type ReaderVolume
} from "@/lib/reader-document";

export type ReaderNavigationState = {
  scope: ReaderScope;
  targetId: string;
};

const readerScopes = new Set<ReaderScope>(["scene", "chapter", "volume", "novel"]);

function safeFallback(
  fallback: ReaderNavigationState,
  novelId: string,
  volumes: ReaderVolume[],
  chapters: ReaderChapter[],
  scenes: ReaderScene[]
) {
  const units = getReaderScopeUnits(fallback.scope, novelId, volumes, chapters, scenes);
  return {
    scope: fallback.scope,
    targetId: units.includes(fallback.targetId) ? fallback.targetId : units[0] ?? ""
  };
}

export function parseReaderNavigationState(
  searchParams: Pick<URLSearchParams, "get">,
  novelId: string,
  fallback: ReaderNavigationState,
  volumes: ReaderVolume[],
  chapters: ReaderChapter[],
  scenes: ReaderScene[]
): ReaderNavigationState {
  const safe = safeFallback(fallback, novelId, volumes, chapters, scenes);
  const rawScope = searchParams.get("scope");
  const targetId = searchParams.get("target") ?? "";
  if (!readerScopes.has(rawScope as ReaderScope) || !targetId) return safe;

  const scope = rawScope as ReaderScope;
  const units = getReaderScopeUnits(scope, novelId, volumes, chapters, scenes);
  return units.includes(targetId) ? { scope, targetId } : safe;
}

export function serializeReaderNavigationState(state: ReaderNavigationState) {
  const searchParams = new URLSearchParams();
  searchParams.set("scope", state.scope);
  searchParams.set("target", state.targetId);
  return searchParams;
}
