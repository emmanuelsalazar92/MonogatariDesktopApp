import type { StudioData } from "@/lib/studio-data";

// Presentation only: never infer success from a transport response or create sync work.
export function notionStatusLabel(
  state: StudioData["notionSyncStates"][number] | undefined,
  novelId: string,
  automatic: string = "idle",
  manual: string = "idle"
) {
  if (!state || state.novelId !== novelId || !state.configured || !state.mapped) return null;
  if (state.syncStatus === "remote-changes") return "Remote changes";
  if (state.syncStatus === "syncing") return "Syncing";
  if (state.syncStatus === "error") return "Sync error";
  if (automatic === "remote-changes") return "Remote changes";
  if (automatic === "syncing" || manual === "publishing") return "Syncing";
  if (automatic === "error" || manual === "error") return "Sync error";
  if (state.isDirty) return "Changes pending";
  if (state.lastNotionSync) return "Synced";
  return null;
}
