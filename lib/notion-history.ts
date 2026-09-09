import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { NotionDiagnostic } from "@/lib/notion-diagnostics";

const key = "notion-diagnostic-history-v1";
const maximumEvents = 40;

export type NotionHistoryEvent = { at: string; operationId: string; operation: string; outcome: "completed" | "failed"; direction?: "PUSH" | "PULL" | "BIDIRECTIONAL"; novelId?: string; code?: string; stage?: string; notionStatus?: number | null; sceneId?: string; message?: string };

function safe(value: string | undefined) { return value?.replace(/(bearer|token|authorization|cookie|password|secret)\s*[:=]?\s*\S+/gi, "$1: [redacted]").slice(0, 300); }

export async function recordNotionHistory(input: { operationId: string; operation: string; outcome: "completed" | "failed"; direction?: NotionHistoryEvent["direction"]; novelId?: string; sceneId?: string; diagnostic?: NotionDiagnostic }) {
  const event: NotionHistoryEvent = { at: new Date().toISOString(), operationId: input.operationId, operation: input.operation, outcome: input.outcome, ...(input.direction ? { direction: input.direction } : {}), ...(input.novelId ? { novelId: input.novelId } : {}), ...(input.sceneId ? { sceneId: input.sceneId } : {}), ...(input.diagnostic ? { code: input.diagnostic.code, stage: input.diagnostic.stage, notionStatus: input.diagnostic.notionStatus, sceneId: input.diagnostic.scope?.sceneId ?? input.sceneId, message: safe(input.diagnostic.notionApiMessage) } : {}) };
  const current = await prisma.appSetting.findUnique({ where: { key } });
  let entries: NotionHistoryEvent[] = [];
  try { entries = Array.isArray(JSON.parse(current?.value ?? "[]")) ? JSON.parse(current?.value ?? "[]") as NotionHistoryEvent[] : []; } catch { /* discard malformed diagnostic history */ }
  entries = [event, ...entries].slice(0, maximumEvents);
  await prisma.appSetting.upsert({ where: { key }, create: { key, value: JSON.stringify(entries) }, update: { value: JSON.stringify(entries) } });
}

export async function getNotionHistory() {
  const current = await prisma.appSetting.findUnique({ where: { key } });
  try { const entries = JSON.parse(current?.value ?? "[]"); return Array.isArray(entries) ? entries.slice(0, maximumEvents) as NotionHistoryEvent[] : []; } catch { return []; }
}
