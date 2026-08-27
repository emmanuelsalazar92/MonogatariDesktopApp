export type StructureVisibilityVolume = { id: string; archived: boolean };
export type StructureVisibilityChapter = { id: string; volumeId: string; archived: boolean };
export type StructureVisibilityScene = { id: string; chapterId: string; archived: boolean };

/**
 * Normal Structure mode hides an archived item and every descendant through
 * the tree. Child records keep their own archive state and parent relation.
 * Show archived is the explicit recovery view and exposes the complete tree.
 */
export function getVisibleStructureItems<
  Volume extends StructureVisibilityVolume,
  Chapter extends StructureVisibilityChapter,
  Scene extends StructureVisibilityScene
>(
  volumes: Volume[],
  chapters: Chapter[],
  scenes: Scene[],
  showArchived: boolean
) {
  if (showArchived) return { volumes, chapters, scenes };

  const visibleVolumes = volumes.filter((volume) => !volume.archived);
  const visibleVolumeIds = new Set(visibleVolumes.map((volume) => volume.id));
  const visibleChapters = chapters.filter(
    (chapter) => !chapter.archived && visibleVolumeIds.has(chapter.volumeId)
  );
  const visibleChapterIds = new Set(visibleChapters.map((chapter) => chapter.id));

  return {
    volumes: visibleVolumes,
    chapters: visibleChapters,
    scenes: scenes.filter((scene) => !scene.archived && visibleChapterIds.has(scene.chapterId))
  };
}
