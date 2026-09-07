export type SceneDocumentIdentity = {
  sceneId: string | null;
  baseRevision: number;
  contentLoaded: boolean;
};

export function loadedSceneDocument(sceneId: string, baseRevision: number): SceneDocumentIdentity {
  return { sceneId, baseRevision, contentLoaded: true };
}

export function unloadedSceneDocument(sceneId: string | null, baseRevision: number): SceneDocumentIdentity {
  return { sceneId, baseRevision, contentLoaded: false };
}

// Content is intentionally not part of this predicate: a fully loaded, empty
// manuscript is valid. What is unsafe is attempting to save a summary whose
// body was omitted, or a draft that belongs to a different scene.
export function canSaveSceneDocument(
  document: SceneDocumentIdentity,
  sceneId: string,
  sceneContentLoaded: boolean
) {
  return document.contentLoaded && sceneContentLoaded && document.sceneId === sceneId;
}
