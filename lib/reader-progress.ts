import type { ReaderChapter, ReaderScene, ReaderScope, ReaderVolume } from "@/lib/reader-document";

export type StoredReadingProgress = {
  novelId: string;
  preferredScope: ReaderScope;
  volumeId: string | null;
  chapterId: string | null;
  sceneId: string | null;
  positionRatio: number;
  contentRevision: number | null;
  lastReadAt: string;
};

export type ResolvedReadingProgress = StoredReadingProgress & {
  scope: ReaderScope;
  targetId: string;
  resolvedSceneId: string;
  usedFallback: boolean;
};

export function clampReadingRatio(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function resolveReadingProgress(
  progress: StoredReadingProgress,
  novelId: string,
  volumes: ReaderVolume[],
  chapters: ReaderChapter[],
  scenes: ReaderScene[]
): ResolvedReadingProgress | null {
  if (progress.novelId !== novelId) return null;

  const activeVolumes = volumes
    .filter((volume) => volume.novelId === novelId && !volume.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const activeVolumeIds = new Set(activeVolumes.map((volume) => volume.id));
  const activeChapters = chapters
    .filter((chapter) => activeVolumeIds.has(chapter.volumeId) && !chapter.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const activeChapterIds = new Set(activeChapters.map((chapter) => chapter.id));
  const activeScenes = activeVolumes.flatMap((volume) =>
    activeChapters
      .filter((chapter) => chapter.volumeId === volume.id)
      .flatMap((chapter) =>
        scenes
          .filter((scene) => scene.chapterId === chapter.id && !scene.archived)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
      )
  );

  if (activeScenes.length === 0) return null;

  const exactScene = activeScenes.find((scene) => scene.id === progress.sceneId);
  const chapterScene = activeScenes.find(
    (scene) => progress.chapterId && scene.chapterId === progress.chapterId
  );
  const volumeChapterIds = new Set(
    activeChapters
      .filter((chapter) => progress.volumeId && chapter.volumeId === progress.volumeId)
      .map((chapter) => chapter.id)
  );
  const volumeScene = activeScenes.find((scene) => volumeChapterIds.has(scene.chapterId));
  const resolvedScene = exactScene ?? chapterScene ?? volumeScene ?? activeScenes[0];
  const resolvedChapter = activeChapters.find(
    (chapter) => chapter.id === resolvedScene.chapterId
  );
  if (!resolvedChapter || !activeChapterIds.has(resolvedChapter.id)) return null;
  const resolvedVolume = activeVolumes.find(
    (volume) => volume.id === resolvedChapter.volumeId
  );
  if (!resolvedVolume) return null;

  const scope = progress.preferredScope;
  const targetId =
    scope === "novel"
      ? novelId
      : scope === "volume"
        ? resolvedVolume.id
        : scope === "chapter"
          ? resolvedChapter.id
          : resolvedScene.id;

  return {
    ...progress,
    positionRatio: exactScene ? clampReadingRatio(progress.positionRatio) : 0,
    scope,
    targetId,
    resolvedSceneId: resolvedScene.id,
    usedFallback: !exactScene
  };
}
