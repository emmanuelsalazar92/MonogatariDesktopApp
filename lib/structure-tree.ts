export type StructureTreeSelection = {
  type: "volume" | "chapter" | "scene";
  id: string;
};

type VolumeNode = { id: string };
type ChapterNode = { id: string; volumeId: string };
type SceneNode = { id: string; chapterId: string };

export type StructureAncestorIds = {
  volumeId: string;
  chapterId?: string;
};

/**
 * Finds the visible branch that contains a selected structure item. Every
 * relationship is checked before returning it, so a stale or untrusted ID can
 * never cause an unrelated branch to be expanded.
 */
export function getStructureAncestorIds(
  selection: StructureTreeSelection,
  volumes: readonly VolumeNode[],
  chapters: readonly ChapterNode[],
  scenes: readonly SceneNode[]
): StructureAncestorIds | null {
  if (!selection.id) return null;

  if (selection.type === "volume") {
    return volumes.some((volume) => volume.id === selection.id)
      ? { volumeId: selection.id }
      : null;
  }

  const chapter = selection.type === "chapter"
    ? chapters.find((item) => item.id === selection.id)
    : (() => {
        const scene = scenes.find((item) => item.id === selection.id);
        return scene ? chapters.find((item) => item.id === scene.chapterId) : undefined;
      })();

  if (!chapter || !volumes.some((volume) => volume.id === chapter.volumeId)) return null;

  return { volumeId: chapter.volumeId, chapterId: chapter.id };
}
