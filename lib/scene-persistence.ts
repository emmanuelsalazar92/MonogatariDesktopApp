export type SceneWriteInput = {
  content?: string;
  expectedRevision?: number;
  documentLoaded?: boolean;
};

export type StoredSceneDocument = {
  content: string;
  revision: number;
  wordCount: number;
};

export class SceneDocumentNotLoadedError extends Error {}

export class SceneRevisionConflictError extends Error {
  constructor() {
    super("scene revision is stale");
  }
}

export function countSceneWords(value: string) {
  return value.trim().match(/\S+/g)?.length ?? 0;
}

// This guard deliberately runs before any mutation. A metadata-only or stale
// editor snapshot cannot replace a loaded manuscript with an empty placeholder.
export function prepareSceneWrite(existing: StoredSceneDocument, input: SceneWriteInput) {
  if (input.content === "" && existing.content !== "" && input.documentLoaded !== true) {
    throw new SceneDocumentNotLoadedError();
  }

  const expectedRevision = input.expectedRevision ?? existing.revision;
  if (expectedRevision !== existing.revision) {
    throw new SceneRevisionConflictError();
  }

  const nextWordCount = typeof input.content === "string"
    ? countSceneWords(input.content)
    : existing.wordCount;

  return {
    expectedRevision,
    nextWordCount,
    wordDelta: nextWordCount - existing.wordCount
  };
}
