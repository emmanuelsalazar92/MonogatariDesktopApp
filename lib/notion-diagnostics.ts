import { randomUUID } from "node:crypto";
export type NotionDiagnostic = {
  operationId: string;
  timestamp: string;
  direction: "PUSH" | "PULL" | "BIDIRECTIONAL";
  operation: "SYNC_NOVEL" | "SYNC_ALL" | "PULL_NOVEL";
  stage: "FETCH_REMOTE" | "CREATE_PAGE" | "UPDATE_PAGE" | "APPEND_BLOCKS" | "READ_BLOCKS" | "APPLY_LOCAL" | "UPDATE_BASELINE" | "UNKNOWN";
  code: string;
  notionStatus: number | null;
  retrySafe: boolean;
  notionApiCode?: string;
  notionApiMessage?: string;
  endpoint?: string;
  scope?: { novelId?: string; chapterId?: string; sceneId?: string; remotePageId?: string };
};

type NotionErrorLike = { status?: unknown; code?: unknown; stage?: unknown; cause?: unknown; notionApiCode?: unknown; notionApiMessage?: unknown; endpoint?: unknown };

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
  scope?: NotionDiagnostic["scope"],
  operationId = randomUUID()
): NotionDiagnostic {
  const { status, code } = safeErrorFields(error);
  const candidate = error && typeof error === "object" ? error as NotionErrorLike : {};
  const upstream = candidate.cause && typeof candidate.cause === "object" ? candidate.cause as NotionErrorLike : candidate;
  const stage = typeof candidate.stage === "string" && ["FETCH_REMOTE", "CREATE_PAGE", "UPDATE_PAGE", "APPEND_BLOCKS", "READ_BLOCKS", "APPLY_LOCAL", "UPDATE_BASELINE"].includes(candidate.stage) ? candidate.stage as NotionDiagnostic["stage"] : code === "RATE_LIMITED" || code === "OFFLINE" || code === "TIMEOUT" ? "FETCH_REMOTE" : code.includes("PULL") ? "READ_BLOCKS" : "UNKNOWN";
  const upstreamCode = typeof upstream.notionApiCode === "string" ? upstream.notionApiCode : undefined;
  const upstreamMessage = typeof upstream.notionApiMessage === "string" ? upstream.notionApiMessage : undefined;
  const endpoint = typeof upstream.endpoint === "string" && /^\/v1\/[a-z0-9_\-/]+$/i.test(upstream.endpoint) ? upstream.endpoint : undefined;
  return { operationId, timestamp: new Date().toISOString(), direction, operation, stage, code, notionStatus: status, retrySafe: status === null || status >= 500 || status === 429, ...(upstreamCode ? { notionApiCode: upstreamCode } : {}), ...(upstreamMessage ? { notionApiMessage: upstreamMessage } : {}), ...(endpoint ? { endpoint } : {}), ...(scope ? { scope } : {}) };
}
