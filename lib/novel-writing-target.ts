import type { StudioData } from "@/lib/studio-data";

/** Local navigation projection. No selection writes or sync side effects. */
export function novelWritingTargets(data: Pick<StudioData, "novels" | "volumes" | "chapters" | "scenes" | "writingActivities">) {
  return Object.fromEntries(data.novels.map(novel => {
    if (novel.status === "Archived") return [novel.id, undefined];
    const volumes = data.volumes.filter(v => v.novelId === novel.id && !v.archived).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    const candidates = volumes.flatMap(volume => data.chapters.filter(c => c.volumeId === volume.id && !c.archived)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
      .flatMap(chapter => data.scenes.filter(s => s.chapterId === chapter.id && !s.archived)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))));
    const ids = new Set(candidates.map(scene => scene.id));
    const recent = data.writingActivities.filter(a => a.novelId === novel.id && ids.has(a.sceneId) && Number.isFinite(Date.parse(a.createdAt)))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id))[0];
    return [novel.id, recent?.sceneId ?? candidates[0]?.id];
  })) as Record<string, string | undefined>;
}
