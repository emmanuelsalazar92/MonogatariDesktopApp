export type ChapterPreviewScene = {
  id: string;
  chapterId: string;
  title: string;
  content: string;
  sortOrder: number;
  archived?: boolean;
};

export const chapterPreviewSeparator = "\n\n---\n\n";

export function orderChapterPreviewScenes(chapterId: string, scenes: ChapterPreviewScene[]) {
  return scenes
    .filter((scene) => scene.chapterId === chapterId && !scene.archived)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
}

export function composeChapterPreview(chapterId: string, scenes: ChapterPreviewScene[]) {
  return orderChapterPreviewScenes(chapterId, scenes)
    .map((scene) => `# ${scene.title}\n\n${scene.content}`)
    .join(chapterPreviewSeparator);
}
