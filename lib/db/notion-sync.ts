import "server-only";

import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db/prisma";

// A lease is deliberately generous: Notion publishing may take several minutes.
// It only recovers work for which this process can no longer provide any evidence.
export const NOTION_SYNC_LEASE_MS = 30 * 60_000;
const STALE_SYNC_MESSAGE = "A previous Notion sync could not be confirmed. Retry when ready.";

export type NotionChapterBaseline = {
  local: string;
  remote: string;
};

export type NotionContentBaselines = Record<string, NotionChapterBaseline>;

export type NotionScenePushCompletion = {
  sceneId: string;
  notionPageId: string;
  revision: number;
  content: string;
};

export type NotionSyncOperation = {
  kind: "started" | "existing" | "skipped";
  operationId?: string;
  snapshotRevision?: number;
};

function parseBaselines(value: string): NotionContentBaselines {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, item]) =>
          Boolean(item) &&
          typeof item === "object" &&
          typeof (item as NotionChapterBaseline).local === "string" &&
          typeof (item as NotionChapterBaseline).remote === "string"
      )
    ) as NotionContentBaselines;
  } catch {
    return {};
  }
}

export async function recoverStaleNotionSyncStates(now = new Date()) {
  return prisma.notionSyncState.updateMany({
    where: {
      syncStatus: "syncing",
      OR: [
        { syncLeaseExpiresAt: null },
        { syncLeaseExpiresAt: { lt: now } }
      ]
    },
    data: {
      isDirty: true,
      syncStatus: "error",
      syncOperationId: null,
      syncStartedAt: null,
      syncLeaseExpiresAt: null,
      syncSnapshotRevision: null,
      lastSyncError: STALE_SYNC_MESSAGE
    }
  });
}

export async function getNotionSyncState(novelId: string) {
  await recoverStaleNotionSyncStates();
  return prisma.notionSyncState.upsert({
    where: { novelId },
    update: {},
    create: { novelId, isDirty: true }
  });
}

export async function beginNotionSyncOperation(
  novelId: string,
  force = false
): Promise<NotionSyncOperation> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const state = await getNotionSyncState(novelId);

    if (state.syncStatus === "syncing") {
      return {
        kind: "existing",
        operationId: state.syncOperationId ?? undefined,
        snapshotRevision: state.syncSnapshotRevision ?? undefined
      };
    }

    if (!force && !state.isDirty) return { kind: "skipped" };

    const operationId = randomUUID();
    const now = new Date();
    const updated = await prisma.notionSyncState.updateMany({
      where: {
        novelId,
        revision: state.revision,
        syncStatus: { not: "syncing" }
      },
      data: {
        syncStatus: "syncing",
        syncOperationId: operationId,
        syncStartedAt: now,
        syncLeaseExpiresAt: new Date(now.getTime() + NOTION_SYNC_LEASE_MS),
        syncSnapshotRevision: state.revision,
        lastSyncError: null
      }
    });

    if (updated.count === 1) {
      return { kind: "started", operationId, snapshotRevision: state.revision };
    }
  }

  const state = await getNotionSyncState(novelId);
  if (state.syncStatus === "syncing") {
    return {
      kind: "existing",
      operationId: state.syncOperationId ?? undefined,
      snapshotRevision: state.syncSnapshotRevision ?? undefined
    };
  }

  throw new Error("Could not acquire the Notion sync operation lock.");
}

export async function refreshNotionSyncLease(novelId: string, operationId: string) {
  const now = new Date();
  const updated = await prisma.notionSyncState.updateMany({
    where: { novelId, syncStatus: "syncing", syncOperationId: operationId },
    data: { syncLeaseExpiresAt: new Date(now.getTime() + NOTION_SYNC_LEASE_MS) }
  });
  return updated.count === 1;
}

export async function getNotionContentBaselines(novelId: string) {
  const state = await getNotionSyncState(novelId);
  return parseBaselines(state.lastKnownContent);
}

export async function markNotionSynced(
  novelId: string,
  baselines: NotionContentBaselines | undefined,
  syncedRevision: number,
  operationId: string,
  pushedScenes: NotionScenePushCompletion[] = []
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.notionSyncState.findUnique({ where: { novelId } });
    if (
      !current ||
      current.syncStatus !== "syncing" ||
      current.syncOperationId !== operationId ||
      current.syncSnapshotRevision !== syncedRevision
    ) {
      return { applied: false, state: current };
    }

    if (pushedScenes.length) {
      const sceneIds = pushedScenes.map((scene) => scene.sceneId);
      const localIds = pushedScenes.map((scene) => `scene:${scene.sceneId}`);
      const [scenes, mappings] = await Promise.all([
        tx.scene.findMany({ where: { id: { in: sceneIds }, archived: false, chapter: { volume: { novelId } } }, select: { id: true, revision: true } }),
        tx.notionMapping.findMany({ where: { localId: { in: localIds }, entityType: "scene", novelId } })
      ]);
      const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
      const mappingById = new Map(mappings.map((mapping) => [mapping.localId, mapping]));
      if (pushedScenes.some((pushed) => sceneById.get(pushed.sceneId)?.revision !== pushed.revision || mappingById.get(`scene:${pushed.sceneId}`)?.notionPageId !== pushed.notionPageId)) {
        return { applied: false, state: current };
      }
      for (const pushed of pushedScenes) {
        await tx.notionMapping.update({
          where: { localId: `scene:${pushed.sceneId}` },
          data: { lastSyncedRevision: pushed.revision, lastSyncedContent: pushed.content, lastSyncedAt: new Date(), remoteArchivedAt: null }
        });
      }
    }

    const state = await tx.notionSyncState.update({
      where: { novelId },
      data: {
        isDirty: current.revision !== syncedRevision,
        lastNotionSync: new Date(),
        lastSyncedRevision: syncedRevision,
        ...(baselines ? { lastKnownContent: JSON.stringify(baselines) } : {}),
        syncStatus: "idle",
        syncOperationId: null,
        syncStartedAt: null,
        syncLeaseExpiresAt: null,
        syncSnapshotRevision: null,
        lastSyncError: null
      }
    });
    return { applied: true, state };
  });
}

/**
 * Completes a Scene-scoped operation without claiming that unrelated Scenes
 * were synchronized. The novel remains dirty while any active Scene lacks a
 * mapping or has a revision newer than its mapping.
 */
export async function completeNotionSceneOperation(
  novelId: string,
  baselines: NotionContentBaselines,
  operationId: string,
  snapshotRevision: number,
  pushedScene?: NotionScenePushCompletion
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.notionSyncState.findUnique({ where: { novelId } });
    if (!current || current.syncStatus !== "syncing" || current.syncOperationId !== operationId || current.syncSnapshotRevision !== snapshotRevision) {
      return { applied: false, state: current };
    }

    if (pushedScene) {
      const [scene, mapping] = await Promise.all([
        tx.scene.findFirst({
          where: { id: pushedScene.sceneId, archived: false, chapter: { volume: { novelId } } },
          select: { revision: true }
        }),
        tx.notionMapping.findUnique({ where: { localId: `scene:${pushedScene.sceneId}` } })
      ]);
      if (
        !scene ||
        scene.revision !== pushedScene.revision ||
        !mapping ||
        mapping.entityType !== "scene" ||
        mapping.novelId !== novelId ||
        mapping.notionPageId !== pushedScene.notionPageId
      ) {
        return { applied: false, state: current };
      }
      await tx.notionMapping.update({
        where: { localId: `scene:${pushedScene.sceneId}` },
        data: {
          lastSyncedRevision: pushedScene.revision,
          lastSyncedContent: pushedScene.content,
          lastSyncedAt: new Date(),
          remoteArchivedAt: null
        }
      });
    }

    const [scenes, mappings] = await Promise.all([
      tx.scene.findMany({ where: { archived: false, chapter: { volume: { novelId } } }, select: { id: true, revision: true } }),
      tx.notionMapping.findMany({ where: { novelId, entityType: "scene" }, select: { localId: true, lastSyncedRevision: true } })
    ]);
    const mappingByScene = new Map(mappings.map((mapping) => [mapping.localId.replace(/^scene:/, ""), mapping]));
    const hasPendingScenes = scenes.some((scene) => {
      const mapping = mappingByScene.get(scene.id);
      return !mapping || scene.revision > mapping.lastSyncedRevision;
    });
    const state = await tx.notionSyncState.update({
      where: { novelId },
      data: {
        isDirty: current.revision !== snapshotRevision || hasPendingScenes,
        lastNotionSync: new Date(),
        lastKnownContent: JSON.stringify(baselines),
        syncStatus: "idle",
        syncOperationId: null,
        syncStartedAt: null,
        syncLeaseExpiresAt: null,
        syncSnapshotRevision: null,
        lastSyncError: null
      }
    });
    return { applied: true, state };
  });
}

export async function failNotionSyncOperation(
  novelId: string,
  operationId: string,
  status: "error" | "remote-changes" = "error"
) {
  await prisma.notionSyncState.updateMany({
    where: { novelId, syncStatus: "syncing", syncOperationId: operationId },
    data: {
      isDirty: true,
      syncStatus: status,
      syncOperationId: null,
      syncStartedAt: null,
      syncLeaseExpiresAt: null,
      syncSnapshotRevision: null,
      lastSyncError:
        status === "remote-changes"
          ? "Notion has remote changes that need review."
          : "Sync failed. Retry when ready."
    }
  });
}

export async function recordNotionPull(novelId: string, baselines: NotionContentBaselines) {
  return prisma.notionSyncState.upsert({
    where: { novelId },
    update: { lastKnownContent: JSON.stringify(baselines), lastNotionSync: new Date() },
    create: {
      novelId,
      isDirty: true,
      lastKnownContent: JSON.stringify(baselines),
      lastNotionSync: new Date()
    }
  });
}
