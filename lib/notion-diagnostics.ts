import { randomUUID } from "node:crypto";
export type NotionDiagnostic = {
  operationId: string;
  timestamp: string;
  direction: "PUSH" | "PULL" | "BIDIRECTIONAL";
  operation: "SYNC_NOVEL" | "SYNC_ALL" | "PULL_NOVEL";
  stage: "FETCH_REMOTE" | "CREATE_PAGE" | "UPDATE_PAGE_CONTENT" | "READ_BLOCKS" | "UPDATE_BASELINE" | "UNKNOWN";
  code: string;
  notionStatus: number | null;
  retrySafe: boolean;
  scope?: { novelId?: string; chapterId?: string; sceneId?: string; remotePageId?: string };
};

type NotionErrorLike = { status?: unknown; code?: unknown };

function safeErrorFields(error: unknown) {
  const candidate = error && typeof error === "object" ? error as NotionErrorLike : {};
  return {
    status: typeof candidate.status === "number" ? candidate.status : null,
    code: typeof candidate.code === "string" && /^[A-Z0-9_]{2,80}$/.test(candidate.code) ? candidate.code : "SYNC_FAILED"
  };
}

export function notionDiagnostic(
  error: unknown,
  operation: NotionDiagnostic["operation"],
  direction: NotionDiagnostic["direction"],
  scope?: NotionDiagnostic["scope"]
): NotionDiagnostic {
  const operationId = randomUUID();
  const { status, code } = safeErrorFields(error);
  const stage = code === "RATE_LIMITED" || code === "OFFLINE" || code === "TIMEOUT" ? "FETCH_REMOTE" : code.includes("PULL") ? "READ_BLOCKS" : code.includes("PUBLISH") ? "UPDATE_PAGE_CONTENT" : "UNKNOWN";
  return { operationId, timestamp: new Date().toISOString(), direction, operation, stage, code, notionStatus: status, retrySafe: status === null || status >= 500 || status === 429, ...(scope ? { scope } : {}) };
}
