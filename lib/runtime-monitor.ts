import "server-only";

import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename } from "node:path";

import { databasePath, prisma, runtimeDataDirectory } from "@/lib/db/prisma";
import { isNotionConfigured, NotionApiError, requestNotion } from "@/lib/notion";
import { inspectSchemaCompatibility } from "@/lib/schema-compatibility";

export type MonitorStatus = "healthy" | "warning" | "failed" | "unknown";
export type MonitorCheck = { id: string; label: string; status: MonitorStatus; detail: string; action?: string };
export type MonitorReport = { generatedAt: string; reportId: string; overall: MonitorStatus; checks: MonitorCheck[]; runtime: { node: string; environment: string; uptimeSeconds: number; version: string; build: string; commit: string; builtAt: string; platform: string; database: string; databaseBytes: number } };

function failed(id: string, label: string, detail: string, action?: string): MonitorCheck { return { id, label, status: "failed", detail, action }; }
function healthy(id: string, label: string, detail: string): MonitorCheck { return { id, label, status: "healthy", detail }; }
function warning(id: string, label: string, detail: string, action?: string): MonitorCheck { return { id, label, status: "warning", detail, action }; }
function safeMessage(error: unknown) { return error instanceof Error ? error.message.replace(/Bearer\s+\S+/gi, "[redacted]").slice(0, 240) : "Unknown error"; }

async function check(id: string, label: string, work: () => Promise<MonitorCheck>): Promise<MonitorCheck> {
  try { return await Promise.race([work(), new Promise<MonitorCheck>((resolve) => setTimeout(() => resolve(failed(id, label, "Check timed out.", "Check network connectivity and try again.")), 12_000))]); }
  catch (error) { return failed(id, label, safeMessage(error), "Review the deployment logs and configuration."); }
}

export async function runRuntimeDiagnostics(): Promise<MonitorReport> {
  const checks = await Promise.all([
    check("application", "Application", async () => healthy("application", "Application", "Diagnostics endpoint is responding.")),
    check("database", "Database", async () => { await prisma.$queryRawUnsafe("SELECT 1"); return healthy("database", "Database", "SQLite accepted a safe read query."); }),
    check("prisma", "Prisma", async () => { await prisma.novel.count(); return healthy("prisma", "Prisma", "Prisma Client completed a safe query."); }),
    check("schema", "Database schema", async () => {
      const result = inspectSchemaCompatibility();
      return result.compatible ? healthy("schema", "Database schema", result.detail) : failed("schema", "Database schema", `[${result.code}] ${result.detail}`, result.action);
    }),
    check("storage", "Storage", async () => { await access(runtimeDataDirectory, constants.R_OK | constants.W_OK); const file = await stat(databasePath); return healthy("storage", "Storage", `Runtime storage is readable/writable; database file is ${file.size} bytes.`); }),
    check("notion", "Notion API", async () => {
      if (!isNotionConfigured()) return warning("notion", "Notion API", "Notion is not configured on this server.", "Configure NOTION_API_TOKEN to enable Notion checks.");
      try { await requestNotion<{ id: string }>("/users/me"); return healthy("notion", "Notion API", "Notion is reachable and authentication was accepted."); }
      catch (error) { const e = error as NotionApiError; const auth = e?.code === "INVALID_TOKEN" || e?.code === "FORBIDDEN"; return failed("notion", "Notion API", auth ? "Notion authentication or authorization failed." : "Notion is unreachable or timed out.", auth ? "Verify the integration token and page sharing." : "Check network connectivity and try again."); }
    }),
    check("mappings", "Notion mappings", async () => {
      const [connected, scenes, mapped] = await Promise.all([prisma.notionMapping.count({ where: { entityType: "novel" } }), prisma.scene.count({ where: { archived: false } }), prisma.notionMapping.count({ where: { entityType: "scene" } })]);
      if (!connected) return warning("mappings", "Notion mappings", "No novels are connected to Notion.");
      if (mapped < scenes) return warning("mappings", "Notion mappings", `${scenes - mapped} active scene(s) are awaiting their first Notion page mapping.`, "Run Sync when ready; new scenes are pending, not failed.");
      return healthy("mappings", "Notion mappings", "Connected scene mappings are present.");
    }),
    check("sync", "Sync state", async () => { const states = await prisma.notionSyncState.groupBy({ by: ["syncStatus"], _count: { _all: true } }); const problematic = states.filter((state) => state.syncStatus === "error" || state.syncStatus === "remote-changes").reduce((sum, state) => sum + state._count._all, 0); return problematic ? warning("sync", "Sync state", `${problematic} novel sync state(s) require attention.`, "Open the affected novel and review its sync diagnostic.") : healthy("sync", "Sync state", "No recorded sync conflicts or errors."); }),
    check("backup", "Backup system", async () => { const latest = await prisma.backup.findFirst({ where: { status: { endsWith: "Valid" } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }); return latest ? healthy("backup", "Backup system", `A verified backup exists from ${latest.createdAt.toISOString()}.`) : warning("backup", "Backup system", "No verified backup is recorded.", "Create a manual backup before a major upgrade."); })
  ]);
  const overall: MonitorStatus = checks.some((item) => item.status === "failed") ? "failed" : checks.some((item) => item.status === "warning") ? "warning" : checks.every((item) => item.status === "healthy") ? "healthy" : "unknown";
  let databaseBytes = 0;
  try { databaseBytes = (await stat(databasePath)).size; } catch { /* storage check supplies the actionable state */ }
  return { generatedAt: new Date().toISOString(), reportId: randomUUID(), overall, checks, runtime: { node: process.version, environment: process.env.NODE_ENV ?? "unknown", uptimeSeconds: Math.round(process.uptime()), version: process.env.MONOGATARI_VERSION ?? process.env.npm_package_version ?? "unknown", build: process.env.MONOGATARI_BUILD_TAG ?? "unknown", commit: process.env.MONOGATARI_GIT_SHA ?? "unknown", builtAt: process.env.MONOGATARI_BUILD_TIME ?? "unknown", platform: `${process.platform}/${process.arch}`, database: basename(databasePath), databaseBytes } };
}
