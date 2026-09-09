import "server-only";

import { prisma } from "@/lib/db/prisma";
import { getNotionContentBaselines } from "@/lib/db/notion-sync";
import { getNotionHistory } from "@/lib/notion-history";

export type SyncCenterScene = {
  id: string;
  title: string;
  status: "synced" | "baseline-match" | "local-changes" | "conflict" | "failed" | "pending" | "unknown";
  notionPageId: string | null;
  detail: string;
  lastOperation?: string;
  lastOperationId?: string;
  lastOperationAt?: string;
};

export function notionPageUrl(pageId: string | null) {
  return pageId && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(pageId)
    ? `https://www.notion.so/${pageId.replaceAll("-", "")}`
    : null;
}

export async function getNotionSyncCenter(novelId: string) {
  const novel = await prisma.novel.findUnique({ where: { id: novelId } });
  if (!novel) return null;
  const [mappings, state, history, baselines, scenes] = await Promise.all([
    prisma.notionMapping.findMany({ where: { novelId }, select: { localId: true, entityType: true, notionPageId: true, lastSyncedRevision: true } }),
    prisma.notionSyncState.findUnique({ where: { novelId } }),
    getNotionHistory(),
    getNotionContentBaselines(novelId),
    prisma.scene.findMany({ where: { archived: false, chapter: { volume: { novelId } } }, orderBy: [{ chapter: { volume: { sortOrder: "asc" } } }, { chapter: { sortOrder: "asc" } }, { sortOrder: "asc" }], select: { id: true, title: true, revision: true } })
  ]);
  const novelMapping = mappings.find((mapping) => mapping.entityType === "novel" && mapping.localId === `novel:${novelId}`);
  if (!novelMapping) return { connected: false as const, novel, scenes: [], counts: null, lastSync: null, activity: [] };
  const sceneMappings = new Map(mappings.filter((mapping) => mapping.entityType === "scene").map((mapping) => [mapping.localId.replace(/^scene:/, ""), mapping]));
  const recentActivity = history.filter((event) => event.novelId === novelId || !event.novelId).slice(0, 12);
  const latestByScene = new Map<string, (typeof history)[number]>();
  for (const event of history) if (event.sceneId && !latestByScene.has(event.sceneId)) latestByScene.set(event.sceneId, event);
  const sceneRows: SyncCenterScene[] = scenes.map((scene) => {
    const mapping = sceneMappings.get(scene.id);
    if (!mapping) return { id: scene.id, title: scene.title, status: "pending", notionPageId: null, detail: "This Scene has not been mapped to Notion yet." };
    if (!baselines[scene.id]) return { id: scene.id, title: scene.title, status: "unknown", notionPageId: mapping.notionPageId, detail: "No safe comparison baseline is recorded yet." };
    const latest = latestByScene.get(scene.id);
    if (latest?.outcome === "failed") return { id: scene.id, title: scene.title, status: latest.code === "PULL_CONFLICT" || latest.code === "REMOTE_CHANGES_DETECTED" ? "conflict" : "failed", notionPageId: mapping.notionPageId, detail: latest.code === "PULL_CONFLICT" ? "The latest explicit operation detected a conflict." : "The latest explicit Scene operation failed.", lastOperation: latest.operation, lastOperationId: latest.operationId, lastOperationAt: latest.at };
    if (scene.revision > mapping.lastSyncedRevision) return { id: scene.id, title: scene.title, status: "local-changes", notionPageId: mapping.notionPageId, detail: "Local changes are waiting to be pushed.", ...(latest ? { lastOperation: latest.operation, lastOperationId: latest.operationId, lastOperationAt: latest.at } : {}) };
    if (latest?.outcome === "completed") return { id: scene.id, title: scene.title, status: "synced", notionPageId: mapping.notionPageId, detail: `Verified by the latest explicit ${latest.operation} operation.`, lastOperation: latest.operation, lastOperationId: latest.operationId, lastOperationAt: latest.at };
    return { id: scene.id, title: scene.title, status: "baseline-match", notionPageId: mapping.notionPageId, detail: "Local state matches the last synchronized baseline; current Notion state is unknown." };
  });
  const counts = Object.fromEntries(["synced", "baseline-match", "local-changes", "conflict", "failed", "pending", "unknown"].map((status) => [status, sceneRows.filter((scene) => scene.status === status).length]));
  const aggregateState = counts.failed ? "failed" : counts.conflict ? "conflict" : counts["local-changes"] || counts.pending ? "changes-pending" : counts.unknown ? "unknown" : counts.synced === sceneRows.length ? "verified-synced" : "matches-baseline";
  return { connected: true as const, novel, novelPageId: novelMapping.notionPageId, lastSync: state?.lastNotionSync?.toISOString() ?? null, aggregateState, scenes: sceneRows, counts, activity: recentActivity };
}
