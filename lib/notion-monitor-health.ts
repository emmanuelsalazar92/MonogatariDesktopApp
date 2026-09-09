export type NotionHealthStatus = "healthy" | "warning" | "failed" | "unknown";
export type NotionHealthCheck = { id: "notion-connectivity" | "notion-authentication" | "notion-sync-contract" | "notion-root-access"; label: string; status: NotionHealthStatus; detail: string; action?: string };

type NotionFailure = { status?: number; code?: string; responseReceived?: boolean; notionApiCode?: string | null };
export type NotionSyncContractEvidence = { at: string; operation: string; outcome: "completed" | "failed"; notionStatus?: number | null; code?: string; stage?: string };

const healthy = (id: NotionHealthCheck["id"], label: string, detail: string): NotionHealthCheck => ({ id, label, status: "healthy", detail });
const warning = (id: NotionHealthCheck["id"], label: string, detail: string, action?: string): NotionHealthCheck => ({ id, label, status: "warning", detail, action });
const failed = (id: NotionHealthCheck["id"], label: string, detail: string, action?: string): NotionHealthCheck => ({ id, label, status: "failed", detail, action });

const syncOperations = new Set(["SYNC_SCENE", "PUSH_SCENE", "PULL_SCENE", "RECONCILE_SCENE", "SYNC_NOVEL", "SYNC_ALL", "INITIAL_PUBLISH"]);

/**
 * Resolves the sync contract from the newest operation that exercised it.
 * Failure history remains useful for troubleshooting, but is deliberately not
 * allowed to override newer success evidence.
 */
export function deriveNotionSyncContractHealth(history: NotionSyncContractEvidence[]): NotionHealthCheck {
  const latest = history
    .filter((event) => syncOperations.has(event.operation))
    .reduce<NotionSyncContractEvidence | undefined>((newest, event) => !newest || Date.parse(event.at) > Date.parse(newest.at) ? event : newest, undefined);

  if (!latest) return {
    id: "notion-sync-contract",
    label: "Notion sync contract",
    status: "unknown",
    detail: "No completed or failed Notion sync operation is recorded yet, so the sync contract has not been exercised.",
    action: "Run a Notion sync to verify the current sync contract."
  };
  if (latest.outcome === "completed") return healthy("notion-sync-contract", "Notion sync contract", `Latest ${latest.operation} operation completed successfully at ${latest.at}.`);
  if (latest.notionStatus === 400) return failed("notion-sync-contract", "Notion sync contract", `Latest ${latest.operation} operation was rejected by Notion (${latest.code ?? "validation error"}${latest.stage ? ` at ${latest.stage}` : ""}).`, "Review the Sync diagnostic stage and Notion validation detail.");
  return {
    id: "notion-sync-contract",
    label: "Notion sync contract",
    status: "unknown",
    detail: `Latest ${latest.operation} operation failed${latest.notionStatus ? ` with HTTP ${latest.notionStatus}` : ""}, but it does not establish a current sync-contract validation failure.`,
    action: "Retry the sync and review its diagnostic if the failure persists."
  };
}

export function classifyNotionHealth(error?: NotionFailure): NotionHealthCheck[] {
  if (!error) return [
    healthy("notion-connectivity", "Notion connectivity", "Notion responded to a service request."),
    healthy("notion-authentication", "Notion authentication", "The configured integration token was accepted."),
    healthy("notion-sync-contract", "Notion sync contract", "The Notion API is available for sync requests.")
  ];
  if (!error.responseReceived || error.code === "OFFLINE" || error.code === "TIMEOUT") return [
    failed("notion-connectivity", "Notion connectivity", "Notion did not respond; DNS, network, or timeout may be involved.", "Check network/DNS connectivity and try again."),
    { id: "notion-authentication", label: "Notion authentication", status: "unknown", detail: "Authentication could not be checked because Notion did not respond." },
    { id: "notion-sync-contract", label: "Notion sync contract", status: "unknown", detail: "Sync request validity cannot be checked without a Notion response." }
  ];
  const connectivity = healthy("notion-connectivity", "Notion connectivity", `Notion is reachable and returned HTTP ${error.status ?? "response"}.`);
  if (error.status === 401) return [connectivity, failed("notion-authentication", "Notion authentication", "Notion rejected the configured integration token.", "Verify NOTION_API_TOKEN and restart the container."), { id: "notion-sync-contract", label: "Notion sync contract", status: "unknown", detail: "Sync cannot be validated until authentication succeeds." }];
  if (error.status === 403) return [connectivity, failed("notion-authentication", "Notion authorization", "The integration is authenticated but cannot access the requested Notion resource.", "Share the authorized root page with the integration and verify access."), { id: "notion-sync-contract", label: "Notion sync contract", status: "unknown", detail: "Sync cannot be validated until authorization succeeds." }];
  if (error.status === 429) return [connectivity, warning("notion-authentication", "Notion authentication", "Authentication could not be rechecked because Notion is rate limiting requests."), warning("notion-sync-contract", "Notion sync contract", "Notion is reachable but rate limited.", "Wait for the rate limit to clear before syncing again.")];
  if (error.status === 400) return [connectivity, warning("notion-authentication", "Notion authentication", "Notion responded, but this request was rejected before access could be confirmed."), failed("notion-sync-contract", "Notion sync contract", `Notion rejected an API request (${error.notionApiCode ?? "validation error"}).`, "Review the Sync diagnostic stage and Notion validation detail; do not troubleshoot network connectivity.")];
  return [connectivity, { id: "notion-authentication", label: "Notion authentication", status: "unknown", detail: "Authentication could not be conclusively checked from this response." }, warning("notion-sync-contract", "Notion sync contract", "Notion returned a server error; the service is reachable but request processing is unavailable.", "Retry later and review the Notion diagnostic if it persists.")];
}

export function classifyNotionRootAccess(error?: NotionFailure, configured = true): NotionHealthCheck {
  if (!configured) return warning("notion-root-access", "Notion root page access", "No authorized Notion root page is configured.", "Configure and test an authorized root page in Settings.");
  if (!error) return healthy("notion-root-access", "Notion root page access", "The configured authorized root page can be read.");
  if (!error.responseReceived || error.code === "OFFLINE" || error.code === "TIMEOUT") return { id: "notion-root-access", label: "Notion root page access", status: "unknown", detail: "Root-page access could not be checked because Notion did not respond." };
  if (error.status === 401) return failed("notion-root-access", "Notion root page access", "Notion rejected the integration token while reading the root page.", "Verify NOTION_API_TOKEN and restart the container.");
  if (error.status === 403 || error.status === 404) return failed("notion-root-access", "Notion root page access", "The integration cannot access the configured root page.", "Share the configured root page with the integration, then test the connection in Settings.");
  return failed("notion-root-access", "Notion root page access", `Notion returned HTTP ${error.status ?? "error"} while reading the configured root page.`, "Verify the configured root page and review the safe Notion error classification.");
}
