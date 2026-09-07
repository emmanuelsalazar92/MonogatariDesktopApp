import type { StudioData } from "@/lib/studio-data";

type OverviewStructure = Pick<StudioData, "volumes" | "chapters" | "scenes">;

// This is a read-only projection of canonical structural metadata. Scene bodies
// are deliberately unnecessary: their persisted wordCount is maintained by scene saves.
export function storyOverviewMetrics(data: OverviewStructure) {
  return {
    wordCount: data.scenes.reduce((total, scene) => total + scene.wordCount, 0),
    volumeCount: data.volumes.length,
    chapterCount: data.chapters.length,
    sceneCount: data.scenes.length
  };
}
