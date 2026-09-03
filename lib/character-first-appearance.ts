type CharacterRef = {
  id: string;
  novelId: string;
};

type VolumeRef = {
  id: string;
  novelId: string;
  title: string;
  sortOrder: number;
};

type ChapterRef = {
  id: string;
  volumeId: string;
  title: string;
  sortOrder: number;
};

type SceneRef = {
  id: string;
  chapterId: string;
  title: string;
  sortOrder: number;
  archived: boolean;
};

type SceneLinkRef = {
  characterId: string;
  sceneId: string;
};

type NarrativeAppearance = {
  characterId: string;
  volumeId: string;
  volumeTitle: string;
  volumeOrder: number;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  sceneId: string;
  sceneTitle: string;
  sceneOrder: number;
};

function compareAppearances(left: NarrativeAppearance, right: NarrativeAppearance) {
  return (
    left.volumeOrder - right.volumeOrder ||
    left.volumeId.localeCompare(right.volumeId) ||
    left.chapterOrder - right.chapterOrder ||
    left.chapterId.localeCompare(right.chapterId) ||
    left.sceneOrder - right.sceneOrder ||
    left.sceneId.localeCompare(right.sceneId)
  );
}

export function formatCharacterFirstAppearance(appearance: NarrativeAppearance) {
  const sceneOrder = String(appearance.sceneOrder).padStart(2, "0");
  return `${appearance.volumeTitle} · ${appearance.chapterTitle} · ${sceneOrder} — ${appearance.sceneTitle}`;
}

export function deriveCharacterFirstAppearances(
  characters: CharacterRef[],
  volumes: VolumeRef[],
  chapters: ChapterRef[],
  scenes: SceneRef[],
  sceneLinks: SceneLinkRef[]
) {
  const details = deriveCharacterFirstAppearanceDetails(
    characters,
    volumes,
    chapters,
    scenes,
    sceneLinks
  );
  return new Map([...details].map(([characterId, detail]) => [characterId, detail.label]));
}

export function deriveCharacterFirstAppearanceDetails(
  characters: CharacterRef[],
  volumes: VolumeRef[],
  chapters: ChapterRef[],
  scenes: SceneRef[],
  sceneLinks: SceneLinkRef[]
) {
  const charactersById = new Map(characters.map((character) => [character.id, character]));
  const volumesById = new Map(volumes.map((volume) => [volume.id, volume]));
  const chaptersById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const scenesById = new Map(
    scenes.filter((scene) => !scene.archived).map((scene) => [scene.id, scene])
  );
  const candidates: NarrativeAppearance[] = [];

  for (const link of sceneLinks) {
    const character = charactersById.get(link.characterId);
    const scene = scenesById.get(link.sceneId);
    const chapter = scene ? chaptersById.get(scene.chapterId) : undefined;
    const volume = chapter ? volumesById.get(chapter.volumeId) : undefined;
    if (!character || !scene || !chapter || !volume || volume.novelId !== character.novelId) {
      continue;
    }

    candidates.push({
      characterId: character.id,
      volumeId: volume.id,
      volumeTitle: volume.title,
      volumeOrder: volume.sortOrder,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      chapterOrder: chapter.sortOrder,
      sceneId: scene.id,
      sceneTitle: scene.title,
      sceneOrder: scene.sortOrder
    });
  }

  candidates.sort((left, right) =>
    left.characterId.localeCompare(right.characterId) || compareAppearances(left, right)
  );

  const firstCandidates = new Map<string, NarrativeAppearance>();
  for (const candidate of candidates) {
    if (!firstCandidates.has(candidate.characterId)) {
      firstCandidates.set(candidate.characterId, candidate);
    }
  }

  const narrativeOrder = [...firstCandidates.values()].sort(compareAppearances);
  const orderByCharacterId = new Map<string, number>();
  let narrativeRank = -1;
  let previous: NarrativeAppearance | undefined;
  for (const candidate of narrativeOrder) {
    if (!previous || compareAppearances(previous, candidate) !== 0) narrativeRank += 1;
    orderByCharacterId.set(candidate.characterId, narrativeRank);
    previous = candidate;
  }
  return new Map(
    [...firstCandidates].map(([characterId, candidate]) => [
      characterId,
      {
        label: formatCharacterFirstAppearance(candidate),
        order: orderByCharacterId.get(characterId) ?? 0
      }
    ])
  );
}
