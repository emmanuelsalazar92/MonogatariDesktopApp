export type CheckHealth = "healthy" | "warning" | "failed" | "unknown";
export type OverallHealth = "healthy" | "degraded" | "failed" | "unknown";
export type CapabilityStatus = "available" | "degraded" | "unavailable" | "unknown";

export type HealthSignal = { id: string; label: string; status: CheckHealth; detail: string };
export type MonitorCapability = { id: string; label: string; status: CapabilityStatus; enabled: boolean; sourceCheckIds: string[]; reason?: string };

const localWritingSignals = ["database", "sqlite-write", "sqlite-integrity", "prisma", "schema", "storage"];
const criticalSignals = new Set(localWritingSignals);

function evaluateCapability(id: string, label: string, sourceCheckIds: string[], signals: Map<string, HealthSignal>, enabled = true): MonitorCapability {
  const source = sourceCheckIds.map((sourceId) => signals.get(sourceId)).filter((item): item is HealthSignal => Boolean(item));
  const first = (status: CheckHealth) => source.find((item) => item.status === status);
  const reason = (signal: HealthSignal | undefined) => signal ? `${signal.label}: ${signal.detail}` : undefined;
  if (!enabled) return { id, label, status: "unavailable", enabled: false, sourceCheckIds, reason: "This optional capability is not configured." };
  if (source.length !== sourceCheckIds.length) return { id, label, status: "unknown", enabled, sourceCheckIds, reason: "One or more source health checks did not run." };
  if (first("failed")) return { id, label, status: "unavailable", enabled, sourceCheckIds, reason: reason(first("failed")) };
  if (first("unknown")) return { id, label, status: "unknown", enabled, sourceCheckIds, reason: reason(first("unknown")) };
  if (first("warning")) return { id, label, status: "degraded", enabled, sourceCheckIds, reason: reason(first("warning")) };
  return { id, label, status: "available", enabled, sourceCheckIds };
}

export function deriveMonitorHealth(checks: HealthSignal[], notionEnabled: boolean) {
  const signals = new Map(checks.map((check) => [check.id, check]));
  const capabilities = [
    evaluateCapability("local-writing", "Local writing / editor", localWritingSignals, signals),
    evaluateCapability("manual-save", "Manual Save", localWritingSignals, signals),
    evaluateCapability("autosave", "Autosave", localWritingSignals, signals),
    evaluateCapability("notion-sync", "Notion Sync", ["notion-connectivity", "notion-authentication", "notion-sync-contract", "notion-root-access", "notion-mapping-integrity", "notion-sync-backlog", "notion-rate-limit"], signals, notionEnabled),
    evaluateCapability("backup", "Backup", ["backup"], signals),
    evaluateCapability("restore", "Restore", [...localWritingSignals, "backup"], signals),
    evaluateCapability("export", "Export", localWritingSignals, signals)
  ];
  const critical = checks.filter((check) => criticalSignals.has(check.id));
  if (critical.some((check) => check.status === "failed")) return { overall: "failed" as const, capabilities };
  if (critical.some((check) => check.status === "unknown") || capabilities.some((capability) => capability.enabled && capability.status === "unknown")) return { overall: "unknown" as const, capabilities };
  if (capabilities.some((capability) => capability.enabled && (capability.status === "degraded" || capability.status === "unavailable"))) return { overall: "degraded" as const, capabilities };
  return { overall: "healthy" as const, capabilities };
}
