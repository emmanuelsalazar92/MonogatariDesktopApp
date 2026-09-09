import "server-only";

import {
  beginNotionSyncOperation,
  completeNotionSceneOperation,
  failNotionSyncOperation,
  getNotionContentBaselines,
  getNotionSyncState,
  markNotionSynced,
  refreshNotionSyncLease
} from "@/lib/db/notion-sync";
import { getNotionMappings, getNotionPublishSource, isNotionNovelConnected } from "@/lib/db/notion-publish";
import { NotionApiError } from "@/lib/notion";
import { NotionPublishError, publishNovelToNotion, publishSceneToNotion } from "@/lib/notion-publish";
import { NotionPullError, pullNovelFromNotion } from "@/lib/notion-pull";
import { prisma } from "@/lib/db/prisma";
import { notionDiagnostic, type NotionDiagnostic } from "@/lib/notion-diagnostics";
import { assertSchemaCompatible } from "@/lib/schema-compatibility";

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

  // Legacy chapter documents cannot safely identify newly added scenes. Their
  // first scene-page publication is a local-canonical migration; subsequent
  // syncs use the scene mappings as their conflict boundary.
  const hasSceneMappings = (await getNotionMappings(novelId)).some((mapping) => mapping.entityType === "scene");
  if (protectRemoteChanges && hasSceneMappings) {
    // Reconcile remote-only chapter changes first. pullNovelFromNotion compares
    // both sides with the persisted per-chapter baseline and refuses to apply a
    // chapter changed independently on both sides.
    try {
      await pullNovelFromNotion(novelId);
    } catch (error) {
      if (error instanceof NotionPullError && error.code === "PULL_CONFLICT") {
        throw new NotionSyncError(
          409,
          "REMOTE_CHANGES_DETECTED",
          "A Notion change conflicts with local writing. Review the changes before syncing."
        );
      }
      throw error;
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
      result.sceneSnapshots.map((snapshot) => [
        snapshot.sceneId,
        { local: snapshot.local, remote: snapshot.remote }
      ])
    ),
    snapshotRevision,
    operationId,
    result.pushedScenes
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
  assertSchemaCompatible();
  const current = inFlightSyncs.get(novelId);
  if (current) return current;

  const sync = (async () => {
    // Validate the target before any remote inspection or persistent operation.
    if (!(await getNotionPublishSource(novelId))) {
      throw new NotionPublishError(404, "NOVEL_NOT_FOUND", "The selected novel could not be found.");
    }
    if (!(await isNotionNovelConnected(novelId))) {
      throw new NotionSyncError(
        409,
        "NOVEL_NOT_CONNECTED",
        "This novel is local only. Connect this novel to Notion before syncing."
      );
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

export type NotionSceneOperationMode = "PULL" | "PUSH" | "RECONCILE";

export async function runNotionSceneOperation(
  novelId: string,
  sceneId: string,
  mode: NotionSceneOperationMode,
  resolution?: "KEEP_MONOGATARI" | "KEEP_NOTION"
) {
  assertSchemaCompatible();
  const operation = await beginNotionSyncOperation(novelId, true);
  if (operation.kind === "existing") throw new NotionSyncError(409, "SYNC_IN_PROGRESS", "Another Notion operation is already running for this novel.");
  try {
    let pullResult: Awaited<ReturnType<typeof pullNovelFromNotion>> | undefined;
    const hasSceneMapping = (await getNotionMappings(novelId)).some((mapping) => mapping.entityType === "scene" && mapping.localId === `scene:${sceneId}`);
    if (mode === "PULL" || ((mode === "RECONCILE" || mode === "PUSH") && hasSceneMapping)) {
      pullResult = await pullNovelFromNotion(novelId, undefined, {
        sceneId,
        resolution: resolution === "KEEP_NOTION" ? "accept-remote" : resolution === "KEEP_MONOGATARI" ? "keep-local" : undefined,
        inspectOnly: mode === "PUSH"
      });
    }
    const shouldPush = mode === "PUSH" || (mode === "RECONCILE" && (!hasSceneMapping || (pullResult && "results" in pullResult && pullResult.results.some((result) => result.sceneId === sceneId && result.localChanged && !result.remoteChanged))));
    let pushResult: Awaited<ReturnType<typeof publishSceneToNotion>> | undefined;
    if (shouldPush) pushResult = await publishSceneToNotion(novelId, sceneId);
    const baselines = await getNotionContentBaselines(novelId);
    const nextBaselines = pushResult ? { ...baselines, [sceneId]: { local: pushResult.snapshot.local, remote: pushResult.snapshot.remote } } : baselines;
    const completed = await completeNotionSceneOperation(
      novelId,
      nextBaselines,
      operation.operationId!,
      operation.snapshotRevision!,
      pushResult
        ? {
            sceneId,
            notionPageId: pushResult.page.id,
            revision: pushResult.sceneRevision,
            content: pushResult.snapshot.local
          }
        : undefined
    );
    if (!completed.applied) throw new NotionSyncError(409, "SYNC_STATE_CHANGED", "The Scene sync completion was ignored because the operation state changed.");
    return { operationId: operation.operationId, direction: mode, sceneId, notionPageId: pushResult?.page.id, pullResult, message: resolution === "KEEP_MONOGATARI" ? "Monogatari version kept and pushed to Notion." : resolution === "KEEP_NOTION" ? "Notion version kept and applied to Monogatari." : mode === "PULL" ? "Scene pull completed." : mode === "PUSH" ? "Scene push completed." : "Scene reconciliation completed." };
  } catch (error) {
    await failNotionSyncOperation(novelId, operation.operationId!, error instanceof NotionPullError && error.code === "PULL_CONFLICT" ? "remote-changes" : "error");
    throw error;
  }
}

export function syncSceneToNotion(novelId: string, sceneId: string) { return runNotionSceneOperation(novelId, sceneId, "PUSH"); }
export function pullSceneFromNotion(novelId: string, sceneId: string) { return runNotionSceneOperation(novelId, sceneId, "PULL"); }
export function reconcileSceneWithNotion(novelId: string, sceneId: string) { return runNotionSceneOperation(novelId, sceneId, "RECONCILE"); }
export function resolveNotionSceneConflict(novelId: string, sceneId: string, resolution: "KEEP_MONOGATARI" | "KEEP_NOTION") { return runNotionSceneOperation(novelId, sceneId, resolution === "KEEP_MONOGATARI" ? "PUSH" : "PULL", resolution); }

/** The sole entry point permitted to create a novel's Notion mapping. */
export async function initialPublishNovelToNotion(novelId: string) {
  assertSchemaCompatible();
  if (await isNotionNovelConnected(novelId)) {
    throw new NotionSyncError(409, "NOVEL_ALREADY_CONNECTED", "This novel is already connected to Notion.");
  }

  // The pull may have safely persisted Notion-only edits, so load the source
  // afterward. This lets the same operation publish independent local edits.
  const source = await getNotionPublishSource(novelId);
  if (!source) throw new NotionPublishError(404, "NOVEL_NOT_FOUND", "The selected novel could not be found.");

  const operation = await beginNotionSyncOperation(novelId, true);
  if (operation.kind === "existing") {
    return { skipped: true, operationStatus: "syncing" as const, message: "A Notion operation is already running." };
  }

  try {
    return await runNotionSync(novelId, false, operation.operationId!, operation.snapshotRevision!);
  } catch (error) {
    await failNotionSyncOperation(novelId, operation.operationId!, "error");
    throw error;
  }
}

/** Sync only explicitly connected novels; local-only novels are never considered. */
export async function syncAllConnectedNovels() {
  assertSchemaCompatible();
  const connections = await prisma.notionMapping.findMany({ where: { entityType: "novel" }, select: { novelId: true } });
  const results: Array<{ novelId: string; ok: boolean; message: string; diagnostic?: NotionDiagnostic }> = [];
  for (const { novelId } of connections) {
    try {
      const result = await syncNovelToNotion(novelId, false);
      results.push({ novelId, ok: result.operationStatus !== "error" && result.operationStatus !== "remote-changes", message: result.message });
    } catch (error) {
      results.push({ novelId, ok: false, message: "Monogatari could not sync this novel to Notion.", diagnostic: notionDiagnostic(error, "SYNC_ALL", "BIDIRECTIONAL", { novelId }) });
    }
  }
  return results;
}

export { NotionApiError, NotionPublishError };
