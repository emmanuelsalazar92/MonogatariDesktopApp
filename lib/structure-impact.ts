type Volume = { id: string };
type Chapter = { id: string; volumeId: string; wordCount: number };
type Scene = { id: string; chapterId: string; wordCount: number };

export type StructureDeleteImpact = {
  chapterCount: number;
  sceneCount: number;
  wordCount: number;
  hardDeleteBlocked: boolean;
};

export function getStructureDeleteImpact(
  type: "volume" | "chapter" | "scene",
  id: string,
  volumes: readonly Volume[],
  chapters: readonly Chapter[],
  scenes: readonly Scene[]
): StructureDeleteImpact {
  if (type === "volume") {
    const chapterIds = new Set(chapters.filter((chapter) => chapter.volumeId === id).map((chapter) => chapter.id));
    const descendants = scenes.filter((scene) => chapterIds.has(scene.chapterId));
    return {
      chapterCount: chapterIds.size,
      sceneCount: descendants.length,
      wordCount: descendants.reduce((total, scene) => total + scene.wordCount, 0),
      hardDeleteBlocked: chapterIds.size > 0
    };
  }

  if (type === "chapter") {
    const descendants = scenes.filter((scene) => scene.chapterId === id);
    return {
      chapterCount: 0,
      sceneCount: descendants.length,
      wordCount: descendants.reduce((total, scene) => total + scene.wordCount, 0),
      hardDeleteBlocked: descendants.length > 0
    };
  }

  const scene = scenes.find((candidate) => candidate.id === id);
  return {
    chapterCount: 0,
    sceneCount: 0,
    wordCount: scene?.wordCount ?? 0,
    hardDeleteBlocked: false
  };
}
