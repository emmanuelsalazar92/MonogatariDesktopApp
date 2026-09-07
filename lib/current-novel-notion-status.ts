import type { StudioData } from "@/lib/studio-data";

type NotionSyncState = StudioData["notionSyncStates"][number] | undefined;

export type CurrentNovelNotionStatus = {
  kind: "not-configured" | "local-only" | "synced" | "pending" | "syncing" | "remote-changes" | "conflict" | "error";
  lastSuccessfulSync: string | null;
};

// A presentation-only projection of persisted NotionSyncState. It intentionally
// never considers transient client request state, so F5 and navigation cannot
// manufacture a second view of the operation.
export function currentNovelNotionStatus(
  state: NotionSyncState,
  notionConfigured: boolean,
  hasConflict = false
): CurrentNovelNotionStatus {
  if (!notionConfigured) return { kind: "not-configured", lastSuccessfulSync: null };
  if (hasConflict) return { kind: "conflict", lastSuccessfulSync: state?.lastNotionSync ?? null };
  if (!state || !state.mapped) return { kind: "local-only", lastSuccessfulSync: null };
  if (state.syncStatus === "syncing") return { kind: "syncing", lastSuccessfulSync: state.lastNotionSync };
  if (state.syncStatus === "remote-changes") return { kind: "remote-changes", lastSuccessfulSync: state.lastNotionSync };
  if (state.syncStatus === "error") return { kind: "error", lastSuccessfulSync: state.lastNotionSync };
  if (state.isDirty) return { kind: "pending", lastSuccessfulSync: state.lastNotionSync };
  if (state.lastNotionSync) return { kind: "synced", lastSuccessfulSync: state.lastNotionSync };
  return { kind: "local-only", lastSuccessfulSync: null };
}
