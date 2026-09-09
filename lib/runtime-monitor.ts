import "server-only";

import { constants } from "node:fs";
import { access, readFile, stat, statfs } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename } from "node:path";

import { databasePath, prisma, runtimeDataDirectory } from "@/lib/db/prisma";
import { getRecentNotionRateLimit, isNotionConfigured, NotionApiError, requestNotion } from "@/lib/notion";
import { classifyNotionHealth, classifyNotionRootAccess, deriveNotionSyncContractHealth } from "@/lib/notion-monitor-health";
import { getNotionRootPageId } from "@/lib/db/notion-publish";
import { normalizeNotionPageId } from "@/lib/notion";
import { inspectSchemaCompatibility } from "@/lib/schema-compatibility";
import { getNotionHistory, type NotionHistoryEvent } from "@/lib/notion-history";
import { deriveMonitorHealth, type CapabilityStatus, type OverallHealth } from "@/lib/monitor-health-model";

export type MonitorStatus = "healthy" | "warning" | "failed" | "unknown";
export type MonitorCheck = { id: string; label: string; status: MonitorStatus; detail: string; action?: string; affected?: Array<{ novelId: string; sceneId?: string; label: string }> };
export type MonitorReport = { generatedAt: string; reportId: string; overall: OverallHealth; capabilities: Array<{ id: string; label: string; status: CapabilityStatus; enabled: boolean; sourceCheckIds: string[]; reason?: string }>; checks: MonitorCheck[]; recentFailures: NotionHistoryEvent[]; lastSyncResults: NotionHistoryEvent[]; runtime: { node: string; environment: string; uptimeSeconds: number; version: string; build: string; commit: string; builtAt: string; platform: string; database: string; databaseBytes: number } };

function failed(id: string, label: string, detail: string, action?: string): MonitorCheck { return { id, label, status: "failed", detail, action }; }
function healthy(id: string, label: string, detail: string): MonitorCheck { return { id, label, status: "healthy", detail }; }
function warning(id: string, label: string, detail: string, action?: string): MonitorCheck { return { id, label, status: "warning", detail, action }; }
function safeMessage(error: unknown) { return error instanceof Error ? error.message.replace(/Bearer\s+\S+/gi, "[redacted]").slice(0, 240) : "Unknown error"; }

async function check(id: string, label: string, work: () => Promise<MonitorCheck>): Promise<MonitorCheck> {
  try { return await Promise.race([work(), new Promise<MonitorCheck>((resolve) => setTimeout(() => resolve(failed(id, label, "Check timed out.", "Check network connectivity and try again.")), 12_000))]); }
  catch (error) { return failed(id, label, safeMessage(error), "Review the deployment logs and configuration."); }
}

async function notionMonitorChecks(history: NotionHistoryEvent[]): Promise<MonitorCheck[]> {
  if (!isNotionConfigured()) return [
    warning("notion-connectivity", "Notion connectivity", "Notion is not configured on this server.", "Configure NOTION_API_TOKEN to enable Notion checks."),
    { id: "notion-authentication", label: "Notion authentication", status: "unknown", detail: "No Notion token is configured." },
    { id: "notion-sync-contract", label: "Notion sync contract", status: "unknown", detail: "No Notion token is configured." },
    classifyNotionRootAccess(undefined, false)
  ];
  try { await requestNotion<{ id: string }>("/v1/users/me"); }
  catch (error) { return [...classifyNotionHealth(error as NotionApiError), { id: "notion-root-access", label: "Notion root page access", status: "unknown", detail: "Root-page access was not checked because authentication did not complete." }]; }
  const health = classifyNotionHealth();
  health[2] = deriveNotionSyncContractHealth(history);
  const configuredRoot = normalizeNotionPageId((await getNotionRootPageId()) ?? "");
  if (!configuredRoot) return [...health, classifyNotionRootAccess(undefined, false)];
  try { await requestNotion<{ id: string }>(`/v1/pages/${configuredRoot}`); return [...health, classifyNotionRootAccess()]; }
  catch (error) { return [...health, classifyNotionRootAccess(error as NotionApiError)]; }
}

function bytes(value: number) { return value < 1_024 * 1_024 ? `${Math.round(value / 1_024)} KiB` : `${(value / (1_024 * 1_024)).toFixed(1)} MiB`; }

async function storageHealth(): Promise<MonitorCheck> {
  await access(runtimeDataDirectory, constants.R_OK | constants.W_OK);
  const filesystem = await statfs(runtimeDataDirectory);
  const blockSize = Number(filesystem.bsize), total = Number(filesystem.blocks) * blockSize, available = Number(filesystem.bavail) * blockSize;
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(available)) return warning("storage", "Persistent storage", "Runtime storage is readable/writable; filesystem capacity is unavailable.");
  const percentFree = (available / total) * 100;
  const detail = `Runtime storage is readable/writable; ${bytes(available)} free of ${bytes(total)} (${percentFree.toFixed(1)}% free).`;
  if (percentFree < 5) return failed("storage", "Persistent storage", detail, "Free disk space before writing or syncing more data.");
  if (percentFree < 10) return warning("storage", "Persistent storage", detail, "Plan to free disk space soon.");
  return healthy("storage", "Persistent storage", detail);
}

async function sqliteWriteHealthAsync(): Promise<MonitorCheck> {
  const rollback = new Error("monitor rollback");
  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe("PRAGMA user_version = user_version");
      throw rollback;
    });
  } catch (error) {
    if (error === rollback) return healthy("sqlite-write", "SQLite write capability", "SQLite accepted a write transaction that was rolled back without changing persisted data.");
    return failed("sqlite-write", "SQLite write capability", "SQLite reads may work, but a safe rollback-only write probe failed.", "Verify database file and volume write permissions.");
  }
  return failed("sqlite-write", "SQLite write capability", "The rollback-only write probe did not complete.");
}

async function sqliteIntegrityHealth(): Promise<MonitorCheck> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ quick_check?: string }>>("PRAGMA quick_check");
    const result = rows[0]?.quick_check;
    return result === "ok" ? healthy("sqlite-integrity", "SQLite integrity", "PRAGMA quick_check completed successfully.") : failed("sqlite-integrity", "SQLite integrity", "SQLite quick_check reported an integrity problem.", "Stop writes and restore or inspect a verified backup.");
  } catch {
    return failed("sqlite-integrity", "SQLite integrity", "SQLite quick_check could not run.", "Verify database availability and inspect the database before writing.");
  }
}

async function runtimeMemoryHealth(): Promise<MonitorCheck> {
  const memory = process.memoryUsage();
  let limit: number | null = null;
  try { const value = (await readFile("/sys/fs/cgroup/memory.max", "utf8")).trim(); if (/^\d+$/.test(value)) limit = Number(value); } catch { /* cgroup limits are optional outside containers */ }
  const detail = `RSS ${bytes(memory.rss)}; heap ${bytes(memory.heapUsed)} of ${bytes(memory.heapTotal)}${limit ? `; container limit ${bytes(limit)}` : "; container memory limit unavailable"}.`;
  if (limit && memory.rss / limit > 0.9) return failed("runtime-memory", "Runtime memory", detail, "Reduce memory pressure or increase the container memory limit.");
  if (limit && memory.rss / limit > 0.75) return warning("runtime-memory", "Runtime memory", detail, "Monitor memory pressure before it reaches the container limit.");
  return healthy("runtime-memory", "Runtime memory", detail);
}

async function eventLoopHealth(): Promise<MonitorCheck> {
  const started = performance.now();
  await new Promise<void>((resolve) => setImmediate(resolve));
  const lag = performance.now() - started;
  const detail = `On-demand event-loop delay: ${lag.toFixed(1)} ms.`;
  if (lag > 500) return failed("event-loop", "Event loop", detail, "Investigate blocking synchronous work in the running process.");
  if (lag > 100) return warning("event-loop", "Event loop", detail, "Investigate elevated runtime blocking if it persists.");
  return healthy("event-loop", "Event loop", detail);
}

function configurationHealth(): MonitorCheck {
  const missing: string[] = [];
  if (!process.env.MONOGATARI_DATA_DIR?.trim()) missing.push("persistent data path");
  if (process.env.NODE_ENV === "production" && !process.env.MONOGATARI_MONITOR_TOKEN?.trim()) missing.push("monitor access token");
  if (missing.length) return warning("configuration", "Runtime configuration", `Missing configuration: ${missing.join(", ")}. No values are shown.`, "Set the required environment configuration and restart the container.");
  return healthy("configuration", "Runtime configuration", "Required runtime configuration is present; values are intentionally not displayed.");
}

async function internalApiHealth(): Promise<MonitorCheck> {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const port = process.env.PORT?.match(/^\d{2,5}$/)?.[0] ?? "3000";
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { cache: "no-store", signal: controller.signal });
    return response.ok ? healthy("internal-api", "Internal API", "The local health endpoint completed a basic application request.") : failed("internal-api", "Internal API", `The local health endpoint returned HTTP ${response.status}.`, "Review database/schema readiness and application logs.");
  } catch {
    return failed("internal-api", "Internal API", "The local health endpoint could not complete within the diagnostic timeout.", "Review runtime networking, startup readiness, and application logs.");
  } finally { clearTimeout(timeout); }
}

async function notionMappingChecks(): Promise<MonitorCheck[]> {
  const [scenes, mappings, states] = await Promise.all([
    prisma.scene.findMany({ where: { archived: false }, select: { id: true, title: true, revision: true, chapter: { select: { volume: { select: { novelId: true } } } } } }),
    prisma.notionMapping.findMany({ select: { localId: true, entityType: true, novelId: true, notionPageId: true, lastSyncedRevision: true } }),
    prisma.notionSyncState.findMany({ select: { novelId: true, syncStatus: true } })
  ]);
  const sceneMappings = new Map(mappings.filter((mapping) => mapping.entityType === "scene").map((mapping) => [mapping.localId.slice(6), mapping]));
  const activeIds = new Set(scenes.map((scene) => scene.id));
  const unmapped = scenes.filter((scene) => !sceneMappings.has(scene.id));
  const pendingPush = scenes.filter((scene) => { const mapping = sceneMappings.get(scene.id); return mapping && scene.revision > mapping.lastSyncedRevision; });
  const unchanged = scenes.filter((scene) => { const mapping = sceneMappings.get(scene.id); return mapping && scene.revision <= mapping.lastSyncedRevision; });
  const orphaned = mappings.filter((mapping) => mapping.entityType === "scene" && !activeIds.has(mapping.localId.slice(6)));
  const invalid = mappings.filter((mapping) => !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(mapping.notionPageId));
  const affected = (items: typeof scenes) => items.slice(0, 30).map((scene) => ({ novelId: scene.chapter.volume.novelId, sceneId: scene.id, label: scene.title || "Untitled scene" }));
  const mappingFailures = [...orphaned.map((mapping) => ({ novelId: mapping.novelId, label: `Orphaned mapping ${mapping.localId}` })), ...invalid.map((mapping) => ({ novelId: mapping.novelId, label: `Invalid remote ID for ${mapping.localId}` }))];
  const mappingCheck = mappingFailures.length ? failed("notion-mapping-integrity", "Notion mapping integrity", `${orphaned.length} orphaned and ${invalid.length} invalid mapping(s) found.`, "Review these mappings before syncing.") : unmapped.length ? warning("notion-mapping-integrity", "Notion mapping integrity", `${unmapped.length} new scene(s) await their first mapping; this is normal pending work.`, "Run Sync when ready to create their Notion pages.") : healthy("notion-mapping-integrity", "Notion mapping integrity", "Active scenes have valid local mapping records.");
  mappingCheck.affected = mappingFailures.length ? mappingFailures.slice(0, 30) : affected(unmapped);
  const conflicts = states.filter((state) => state.syncStatus === "remote-changes"), errors = states.filter((state) => state.syncStatus === "error");
  const backlogStatus: MonitorStatus = errors.length || conflicts.length ? "failed" : pendingPush.length || unmapped.length ? "warning" : "healthy";
  const backlog: MonitorCheck = { id: "notion-sync-backlog", label: "Notion sync backlog", status: backlogStatus, detail: `Pending Push: ${pendingPush.length}; Pending Pull: 0; Conflicts: ${conflicts.length}; Errors: ${errors.length}; Unmapped: ${unmapped.length}; Synced: ${unchanged.length}.`, ...(backlogStatus === "failed" ? { action: "Review affected novels before syncing again." } : backlogStatus === "warning" ? { action: "Run Sync when ready to publish pending scenes." } : {}) };
  backlog.affected = [...affected(pendingPush), ...affected(unmapped), ...conflicts.map((state) => ({ novelId: state.novelId, label: "Remote changes conflict" })), ...errors.map((state) => ({ novelId: state.novelId, label: "Recorded sync error" }))].slice(0, 30);
  const rate = getRecentNotionRateLimit();
  const rateCheck = !rate ? healthy("notion-rate-limit", "Notion rate limit", "No recent Notion rate limit has been observed in this process.") : (() => { const retryAt = rate.retryAfterMs === null ? null : Date.parse(rate.at) + rate.retryAfterMs; const retryable = retryAt === null || Date.now() >= retryAt; return retryable ? warning("notion-rate-limit", "Notion rate limit", `Last HTTP 429: ${rate.at}. Retry is now advisable.`) : warning("notion-rate-limit", "Notion rate limit", `Last HTTP 429: ${rate.at}. Retry after ${new Date(retryAt).toISOString()}.`, "Wait before starting another Notion sync."); })();
  return [mappingCheck, backlog, rateCheck];
}

export async function runRuntimeDiagnostics(): Promise<MonitorReport> {
  const history = await getNotionHistory();
  const checks = await Promise.all([
    check("application", "Application", async () => healthy("application", "Application", "Diagnostics endpoint is responding.")),
    check("internal-api", "Internal API", internalApiHealth),
    check("configuration", "Runtime configuration", async () => configurationHealth()),
    check("runtime-memory", "Runtime memory", runtimeMemoryHealth),
    check("event-loop", "Event loop", eventLoopHealth),
    check("database", "Database", async () => { await prisma.$queryRawUnsafe("SELECT 1"); return healthy("database", "Database", "SQLite accepted a safe read query."); }),
    check("sqlite-write", "SQLite write capability", sqliteWriteHealthAsync),
    check("sqlite-integrity", "SQLite integrity", sqliteIntegrityHealth),
    check("prisma", "Prisma", async () => { await prisma.novel.count(); return healthy("prisma", "Prisma", "Prisma Client completed a safe query."); }),
    check("schema", "Database schema", async () => {
      const result = inspectSchemaCompatibility();
      return result.compatible ? healthy("schema", "Database schema", result.detail) : failed("schema", "Database schema", `[${result.code}] ${result.detail}`, result.action);
    }),
    check("storage", "Persistent storage", storageHealth),
    ...(await notionMonitorChecks(history)),
    ...(await notionMappingChecks()),
    check("mappings", "Notion mappings", async () => {
      const [connected, scenes, mapped] = await Promise.all([prisma.notionMapping.count({ where: { entityType: "novel" } }), prisma.scene.count({ where: { archived: false } }), prisma.notionMapping.count({ where: { entityType: "scene" } })]);
      if (!connected) return warning("mappings", "Notion mappings", "No novels are connected to Notion.");
      if (mapped < scenes) return warning("mappings", "Notion mappings", `${scenes - mapped} active scene(s) are awaiting their first Notion page mapping.`, "Run Sync when ready; new scenes are pending, not failed.");
      return healthy("mappings", "Notion mappings", "Connected scene mappings are present.");
    }),
    check("sync", "Sync state", async () => { const states = await prisma.notionSyncState.groupBy({ by: ["syncStatus"], _count: { _all: true } }); const problematic = states.filter((state) => state.syncStatus === "error" || state.syncStatus === "remote-changes").reduce((sum, state) => sum + state._count._all, 0); return problematic ? warning("sync", "Sync state", `${problematic} novel sync state(s) require attention.`, "Open the affected novel and review its sync diagnostic.") : healthy("sync", "Sync state", "No recorded sync conflicts or errors."); }),
    check("backup", "Backup system", async () => { const latest = await prisma.backup.findFirst({ where: { status: { endsWith: "Valid" } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }); return latest ? healthy("backup", "Backup system", `A verified backup exists from ${latest.createdAt.toISOString()}.`) : warning("backup", "Backup system", "No verified backup is recorded.", "Create a manual backup before a major upgrade."); })
  ]);
  const { overall, capabilities } = deriveMonitorHealth(checks, isNotionConfigured());
  let databaseBytes = 0;
  try { databaseBytes = (await stat(databasePath)).size; } catch { /* storage check supplies the actionable state */ }
  const lastSyncByNovel = new Map<string, NotionHistoryEvent>();
  for (const event of history) if (event.novelId && !lastSyncByNovel.has(event.novelId)) lastSyncByNovel.set(event.novelId, event);
  const [connected, syncStates] = await Promise.all([prisma.notionMapping.findMany({ where: { entityType: "novel" }, select: { novelId: true } }), prisma.notionSyncState.findMany({ select: { novelId: true, lastNotionSync: true, syncStatus: true } })]);
  const stateByNovel = new Map(syncStates.map((state) => [state.novelId, state]));
  const lastSyncResults = [...new Set(connected.map((mapping) => mapping.novelId))].map((novelId) => lastSyncByNovel.get(novelId) ?? (() => { const state = stateByNovel.get(novelId); return { at: state?.lastNotionSync?.toISOString() ?? "Never", operationId: "No recorded operation", operation: "SYNC_NOVEL", outcome: state?.syncStatus === "error" || state?.syncStatus === "remote-changes" ? "failed" as const : "completed" as const, novelId, ...(state?.syncStatus ? { code: state.syncStatus } : {}) }; })()).slice(0, 20);
  return { generatedAt: new Date().toISOString(), reportId: randomUUID(), overall, capabilities, checks, recentFailures: history.filter((event) => event.outcome === "failed").slice(0, 12), lastSyncResults, runtime: { node: process.version, environment: process.env.NODE_ENV ?? "unknown", uptimeSeconds: Math.round(process.uptime()), version: process.env.MONOGATARI_VERSION ?? process.env.npm_package_version ?? "unknown", build: process.env.MONOGATARI_BUILD_TAG ?? "unknown", commit: process.env.MONOGATARI_GIT_SHA ?? "unknown", builtAt: process.env.MONOGATARI_BUILD_TIME ?? "unknown", platform: `${process.platform}/${process.arch}`, database: basename(databasePath), databaseBytes } };
}
