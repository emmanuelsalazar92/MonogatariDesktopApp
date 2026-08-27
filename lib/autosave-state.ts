export type AutosaveStatus = "Saved locally" | "Saving…" | "Unsaved changes" | "Save failed — Retry";

export function statusAfterSaveConfirmation(latestRevision: number, confirmedRevision: number): AutosaveStatus {
  return latestRevision === confirmedRevision ? "Saved locally" : "Unsaved changes";
}
