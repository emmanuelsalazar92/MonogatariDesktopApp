export type NotionSceneEvidence = "BASELINE_REQUIRED" | "UNCHANGED" | "LOCAL_ONLY" | "NOTION_ONLY" | "CONFLICT" | "DESTRUCTIVE_NOTION_EMPTY";
export type NotionSceneMode = "PULL" | "PUSH" | "RECONCILE";
export type NotionSceneResolution = "KEEP_MONOGATARI" | "KEEP_NOTION";
export type NotionSceneDecision = "UNCHANGED" | "PRESERVE_LOCAL" | "APPLY_NOTION" | "PUSH_MONOGATARI" | "REVIEW_CONFLICT" | "BLOCKED";

export function classifyNotionSceneEvidence(input: { local: string; remote: string; baselineLocal?: string; baselineRemote?: string; localContentNonEmpty: boolean; remoteContentEmpty: boolean }): NotionSceneEvidence {
  if (input.baselineLocal === undefined || input.baselineRemote === undefined) return "BASELINE_REQUIRED";
  const localChanged = input.local !== input.baselineLocal;
  const remoteChanged = input.remote !== input.baselineRemote;
  if (remoteChanged && input.remoteContentEmpty && input.localContentNonEmpty) return "DESTRUCTIVE_NOTION_EMPTY";
  if (localChanged && remoteChanged) return "CONFLICT";
  if (localChanged) return "LOCAL_ONLY";
  if (remoteChanged) return "NOTION_ONLY";
  return "UNCHANGED";
}

export function planNotionSceneOperation(mode: NotionSceneMode, evidence: NotionSceneEvidence, resolution?: NotionSceneResolution): NotionSceneDecision {
  if (evidence === "BASELINE_REQUIRED") return "BLOCKED";
  if (resolution === "KEEP_MONOGATARI") return "PUSH_MONOGATARI";
  if (resolution === "KEEP_NOTION") return "APPLY_NOTION";
  if (evidence === "CONFLICT" || evidence === "DESTRUCTIVE_NOTION_EMPTY") return "REVIEW_CONFLICT";
  if (evidence === "UNCHANGED") return "UNCHANGED";
  if (evidence === "LOCAL_ONLY") return mode === "PULL" ? "PRESERVE_LOCAL" : "PUSH_MONOGATARI";
  if (evidence === "NOTION_ONLY") return mode === "PUSH" ? "REVIEW_CONFLICT" : "APPLY_NOTION";
  return "BLOCKED";
}
