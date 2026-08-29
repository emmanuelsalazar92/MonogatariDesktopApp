export type ReaderScope = "scene" | "chapter" | "volume" | "novel";

export type ReaderScene = { id: string; chapterId: string; title: string; content: string; sortOrder: number; archived: boolean };
export type ReaderSceneMetadata = Omit<ReaderScene, "content">;
export type ReaderChapter = { id: string; volumeId: string; title: string; sortOrder: number; archived: boolean };
export type ReaderVolume = { id: string; novelId: string; title: string; sortOrder: number; archived: boolean };
export type ReaderOutline = {
  novel: { id: string; title: string };
  volumes: ReaderVolume[];
  chapters: ReaderChapter[];
  scenes: ReaderSceneMetadata[];
};

export function getReaderScopeUnits(scope: ReaderScope, novelId: string, volumes: ReaderVolume[], chapters: ReaderChapter[], scenes: ReaderSceneMetadata[]) {
  const activeVolumes = volumes.filter((item) => item.novelId === novelId && !item.archived).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const activeChapters = chapters.filter((item) => !item.archived && activeVolumes.some((volume) => volume.id === item.volumeId));
  const activeScenes = scenes.filter((item) => !item.archived && activeChapters.some((chapter) => chapter.id === item.chapterId));
  if (scope === "novel") return [novelId];
  if (scope === "volume") return activeVolumes.map((item) => item.id);
  if (scope === "chapter") return activeVolumes.flatMap((volume) => activeChapters.filter((chapter) => chapter.volumeId === volume.id).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)).map((chapter) => chapter.id));
  return activeVolumes.flatMap((volume) => activeChapters.filter((chapter) => chapter.volumeId === volume.id).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)).flatMap((chapter) => activeScenes.filter((scene) => scene.chapterId === chapter.id).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)).map((scene) => scene.id)));
}

export function getReaderAdjacentUnits(units: string[], targetId: string) {
  const index = units.indexOf(targetId);
  return { previousId: index > 0 ? units[index - 1] : null, nextId: index >= 0 && index < units.length - 1 ? units[index + 1] : null };
}

export function assembleReaderDocument(scope: ReaderScope, targetId: string, volumes: ReaderVolume[], chapters: ReaderChapter[], scenes: ReaderScene[]) {
  const activeVolumes = volumes.filter((volume) => !volume.archived).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const activeChapters = chapters.filter((chapter) => !chapter.archived && activeVolumes.some((volume) => volume.id === chapter.volumeId)).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const activeScenes = scenes.filter((scene) => !scene.archived && activeChapters.some((chapter) => chapter.id === scene.chapterId)).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const selectedVolumeIds = scope === "novel" ? activeVolumes.map((item) => item.id) : scope === "volume" ? [targetId] : scope === "chapter" ? activeChapters.filter((item) => item.id === targetId).map((item) => item.volumeId) : activeChapters.filter((item) => item.id === scenes.find((scene) => scene.id === targetId)?.chapterId).map((item) => item.volumeId);
  const selectedChapterIds = scope === "novel" || scope === "volume" ? activeChapters.filter((item) => selectedVolumeIds.includes(item.volumeId)).map((item) => item.id) : scope === "chapter" ? [targetId] : activeScenes.filter((item) => item.id === targetId).map((item) => item.chapterId);
  const documentScenes = activeScenes.filter((scene) => selectedChapterIds.includes(scene.chapterId) && (scope !== "scene" || scene.id === targetId));
  return { volumes: activeVolumes.filter((item) => selectedVolumeIds.includes(item.id)), chapters: activeChapters.filter((item) => selectedChapterIds.includes(item.id)), scenes: documentScenes };
}
