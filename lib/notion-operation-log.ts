import "server-only";

import type { NotionDiagnostic } from "@/lib/notion-diagnostics";

function safe(value: unknown) {
  return typeof value === "string"
    ? value.replace(/(bearer|token|authorization|cookie|password|secret)\s*[:=]?\s*\S+/gi, "$1: [redacted]").slice(0, 320)
    : undefined;
}

export function logNotionOperation(event: "started" | "completed" | "failed", input: {
  operationId: string;
  operation: "SYNC_SCENE" | "SYNC_NOVEL" | "SYNC_ALL" | "PULL_NOVEL" | "INITIAL_PUBLISH";
  direction: "PUSH" | "PULL" | "BIDIRECTIONAL";
  novelId?: string;
  chapterId?: string;
  sceneId?: string;
  diagnostic?: NotionDiagnostic;
}) {
  const diagnostic = input.diagnostic;
  const record = {
    event: "monogatari_notion_operation",
    lifecycle: event,
    operationId: input.operationId,
    operation: input.operation,
    direction: input.direction,
    ...(input.novelId ? { novelId: input.novelId } : {}),
    ...(input.chapterId ? { chapterId: input.chapterId } : {}),
    ...(input.sceneId ? { sceneId: input.sceneId } : {}),
    ...(diagnostic ? { stage: diagnostic.stage, code: diagnostic.code, notionStatus: diagnostic.notionStatus, notionApiCode: diagnostic.notionApiCode, endpoint: diagnostic.endpoint, message: safe(diagnostic.notionApiMessage) } : {})
  };
  (event === "failed" ? console.error : console.info)(JSON.stringify(record));
}
