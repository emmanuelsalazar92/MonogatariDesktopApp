import "server-only";

import { getNotionSyncState, markNotionSynced } from "@/lib/db/notion-sync";
import { NotionApiError } from "@/lib/notion";
import { NotionPublishError, publishNovelToNotion } from "@/lib/notion-publish";

const inFlightSyncs = new Map<string, Promise<NotionSyncResult>>();

export type NotionSyncResult = {
  skipped: boolean;
  message: string;
  novelPage?: { id: string; url: string };
  createdPages?: number;
  updatedPages?: number;
  lastNotionSync?: Date;
};

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function publishWithRateLimitRetry(novelId: string) {
  try {
    return await publishNovelToNotion(novelId);
  } catch (error) {
    if (!(error instanceof NotionApiError) || error.status !== 429 || error.retryAfterMs === null) {
      throw error;
    }

    await wait(error.retryAfterMs);
    return publishNovelToNotion(novelId);
  }
}

async function runNotionSync(novelId: string, force: boolean): Promise<NotionSyncResult> {
  const state = await getNotionSyncState(novelId);
  if (!force && !state.isDirty) {
    return {
      skipped: true,
      message: "No local changes are pending for Notion.",
      lastNotionSync: state.lastNotionSync ?? undefined
    };
  }

  const result = await publishWithRateLimitRetry(novelId);
  const syncedState = await markNotionSynced(novelId);

  return {
    skipped: false,
    message: `Synced ${result.createdPages} new page(s) and updated ${result.updatedPages} existing page(s).`,
    novelPage: result.novelPage,
    createdPages: result.createdPages,
    updatedPages: result.updatedPages,
    lastNotionSync: syncedState.lastNotionSync ?? undefined
  };
}

export function syncNovelToNotion(novelId: string, force = false) {
  const current = inFlightSyncs.get(novelId);
  if (current) return current;

  const sync = runNotionSync(novelId, force).finally(() => {
    if (inFlightSyncs.get(novelId) === sync) inFlightSyncs.delete(novelId);
  });
  inFlightSyncs.set(novelId, sync);
  return sync;
}

export { NotionApiError, NotionPublishError };
