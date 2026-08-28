type Volume = { id: string; novelId: string; sortOrder: number };
type Chapter = { id: string; volumeId: string; sortOrder: number };
type Scene = { id: string; chapterId: string; title: string; sortOrder: number; archived: boolean };

export function getNovelSceneNavigation(novelId: string, volumes: Volume[], chapters: Chapter[], scenes: Scene[]) {
  const volumesByOrder = volumes.filter((v) => v.novelId === novelId).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const volumeOrder = new Map(volumesByOrder.map((v, i) => [v.id, i]));
  const chaptersByOrder = chapters.filter((c) => volumeOrder.has(c.volumeId)).sort((a, b) => (volumeOrder.get(a.volumeId)! - volumeOrder.get(b.volumeId)!) || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const chapterOrder = new Map(chaptersByOrder.map((c, i) => [c.id, i]));
  return scenes.filter((s) => !s.archived && chapterOrder.has(s.chapterId)).sort((a, b) => (chapterOrder.get(a.chapterId)! - chapterOrder.get(b.chapterId)!) || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

export function getAdjacentSceneIds(currentSceneId: string, sceneIds: string[]) {
  const index = sceneIds.indexOf(currentSceneId);
  return { previousId: index > 0 ? sceneIds[index - 1] : null, nextId: index >= 0 && index < sceneIds.length - 1 ? sceneIds[index + 1] : null };
}
