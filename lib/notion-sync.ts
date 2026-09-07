import "server-only";

import {
  beginNotionSyncOperation,
  failNotionSyncOperation,
  getNotionSyncState,
  markNotionSynced,
  refreshNotionSyncLease
} from "@/lib/db/notion-sync";
import { getNotionPublishSource } from "@/lib/db/notion-publish";
import { NotionApiError } from "@/lib/notion";
import { NotionPublishError, publishNovelToNotion } from "@/lib/notion-publish";
import { getNotionRemoteChanges } from "@/lib/notion-pull";

const inFlightSyncs = new Map<string, Promise<NotionSyncResult>>();

export type NotionSyncResult = {
  skipped: boolean;
  reused?: boolean;
  operationStatus: "idle" | "syncing" | "synced" | "error" | "remote-changes";
  operationId?: string;
  message: string;
  novelPage?: { id: string; url: string };
  createdPages?: number;
  updatedPages?: number;
  lastNotionSync?: Date;
};

export class NotionSyncError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function publishWithRateLimitRetry(
  novelId: string,
  source: NonNullable<Awaited<ReturnType<typeof getNotionPublishSource>>>
) {
  try {
    return await publishNovelToNotion(novelId, source);
  } catch (error) {
    if (!(error instanceof NotionApiError) || error.status !== 429 || error.retryAfterMs === null) {
      throw error;
    }

    await wait(error.retryAfterMs);
    return publishNovelToNotion(novelId, source);
  }
}

async function runNotionSync(
  novelId: string,
  protectRemoteChanges: boolean,
  operationId: string,
  snapshotRevision: number
): Promise<NotionSyncResult> {
  const state = await getNotionSyncState(novelId);
  if (
    state.syncStatus !== "syncing" ||
    state.syncOperationId !== operationId ||
    state.syncSnapshotRevision !== snapshotRevision
  ) {
    return {
      skipped: true,
      operationStatus: state.syncStatus === "remote-changes" ? "remote-changes" : "error",
      message: "The original Notion sync is no longer active. Review the current sync state before retrying."
    };
  }

  if (protectRemoteChanges) {
    const remote = await getNotionRemoteChanges(novelId);
    if (remote.changed) {
      throw new NotionSyncError(
        409,
        "REMOTE_CHANGES_DETECTED",
        "Notion changed remotely. Review it with Update from Notion before syncing local changes."
      );
    }
  }

  await refreshNotionSyncLease(novelId, operationId);

  const source = await getNotionPublishSource(novelId);
  if (!source) {
    throw new NotionPublishError(404, "NOVEL_NOT_FOUND", "The selected novel could not be found.");
  }

  await refreshNotionSyncLease(novelId, operationId);
  const result = await publishWithRateLimitRetry(novelId, source);
  const completed = await markNotionSynced(
    novelId,
    Object.fromEntries(
      result.chapterSnapshots.map((snapshot) => [
        snapshot.chapterId,
        { local: snapshot.local, remote: snapshot.remote }
      ])
    ),
    snapshotRevision,
    operationId
  );

  if (!completed.applied || !completed.state) {
    return {
      skipped: true,
      operationStatus:
        completed.state?.syncStatus === "syncing"
          ? "syncing"
          : completed.state?.syncStatus === "remote-changes"
            ? "remote-changes"
            : "error",
      message: "A newer or recovered sync state is active. The previous completion was ignored safely."
    };
  }

  return {
    skipped: false,
    operationStatus: completed.state.isDirty ? "idle" : "synced",
    operationId,
    message: `Synced ${result.createdPages} new page(s) and updated ${result.updatedPages} existing page(s).`,
    novelPage: result.novelPage,
    createdPages: result.createdPages,
    updatedPages: result.updatedPages,
    lastNotionSync: completed.state.lastNotionSync ?? undefined
  };
}

export function syncNovelToNotion(
  novelId: string,
  force = false,
  options: { protectRemoteChanges?: boolean } = {}
) {
  const current = inFlightSyncs.get(novelId);
  if (current) return current;

  const sync = (async () => {
    // Validate the target before any remote inspection or persistent operation.
    if (!(await getNotionPublishSource(novelId))) {
      throw new NotionPublishError(404, "NOVEL_NOT_FOUND", "The selected novel could not be found.");
    }

    const operation = await beginNotionSyncOperation(novelId, force);
    if (operation.kind === "existing") {
      return {
        skipped: true,
        reused: true,
        operationStatus: "syncing" as const,
        operationId: operation.operationId,
        message: "Syncing with Notion. You can keep writing."
      };
    }
    if (operation.kind === "skipped") {
      const state = await getNotionSyncState(novelId);
      return {
        skipped: true,
        operationStatus: "synced" as const,
        message: "No local changes are pending for Notion.",
        lastNotionSync: state.lastNotionSync ?? undefined
      };
    }

    try {
      return await runNotionSync(
        novelId,
        options.protectRemoteChanges ?? true,
        operation.operationId!,
        operation.snapshotRevision!
      );
    } catch (error) {
      await failNotionSyncOperation(
        novelId,
        operation.operationId!,
        error instanceof NotionSyncError && error.code === "REMOTE_CHANGES_DETECTED"
          ? "remote-changes"
          : "error"
      );
      throw error;
    }
  })().finally(() => {
    if (inFlightSyncs.get(novelId) === sync) inFlightSyncs.delete(novelId);
  });
  inFlightSyncs.set(novelId, sync);
  return sync;
}

export { NotionApiError, NotionPublishError };
