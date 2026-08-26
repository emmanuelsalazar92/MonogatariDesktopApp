import "server-only";

import { getNotionSyncState, markNotionSynced } from "@/lib/db/notion-sync";
import { getNotionPublishSource } from "@/lib/db/notion-publish";
import { NotionApiError } from "@/lib/notion";
import { NotionPublishError, publishNovelToNotion } from "@/lib/notion-publish";
import { getNotionRemoteChanges } from "@/lib/notion-pull";

const inFlightSyncs = new Map<string, Promise<NotionSyncResult>>();

export type NotionSyncResult = {
  skipped: boolean;
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
  force: boolean,
  protectRemoteChanges: boolean
): Promise<NotionSyncResult> {
  const state = await getNotionSyncState(novelId);
  if (!force && !state.isDirty) {
    return {
      skipped: true,
      message: "No local changes are pending for Notion.",
      lastNotionSync: state.lastNotionSync ?? undefined
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

  const source = await getNotionPublishSource(novelId);
  if (!source) {
    throw new NotionPublishError(404, "NOVEL_NOT_FOUND", "The selected novel could not be found.");
  }

  const result = await publishWithRateLimitRetry(novelId, source);
  const syncedState = await markNotionSynced(
    novelId,
    Object.fromEntries(
      result.chapterSnapshots.map((snapshot) => [
        snapshot.chapterId,
        { local: snapshot.local, remote: snapshot.remote }
      ])
    ),
    state.revision
  );

  return {
    skipped: false,
    message: `Synced ${result.createdPages} new page(s) and updated ${result.updatedPages} existing page(s).`,
    novelPage: result.novelPage,
    createdPages: result.createdPages,
    updatedPages: result.updatedPages,
    lastNotionSync: syncedState.lastNotionSync ?? undefined
  };
}

export function syncNovelToNotion(
  novelId: string,
  force = false,
  options: { protectRemoteChanges?: boolean } = {}
) {
  const current = inFlightSyncs.get(novelId);
  if (current) return current;

  const sync = runNotionSync(novelId, force, options.protectRemoteChanges ?? true).finally(() => {
    if (inFlightSyncs.get(novelId) === sync) inFlightSyncs.delete(novelId);
  });
  inFlightSyncs.set(novelId, sync);
  return sync;
}

export { NotionApiError, NotionPublishError };
