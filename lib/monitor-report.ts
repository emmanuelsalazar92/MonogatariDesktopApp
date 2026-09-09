import type { MonitorReport } from "@/lib/runtime-monitor";

function sanitize(value: string) {
  return value
    .replace(/(bearer|token|password|secret|cookie|authorization)\s*[:=]?\s*\S+/gi, "$1: [redacted]")
    .replace(/\/(?:Users|home)\/[^\s/]+/gi, "[private-path]")
    .slice(0, 500);
}

function uptime(seconds: number) {
  const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function formatDiagnosticReport(report: MonitorReport) {
  const lines = [
    `Monogatari ${sanitize(report.runtime.version)}`,
    `Build: ${sanitize(report.runtime.build)}`,
    `Commit: ${sanitize(report.runtime.commit)}`,
    `Built: ${sanitize(report.runtime.builtAt)}`,
    `Environment: ${sanitize(report.runtime.environment)}`,
    `Node: ${sanitize(report.runtime.node)}`,
    `Platform: ${sanitize(report.runtime.platform)}`,
    `Uptime: ${uptime(report.runtime.uptimeSeconds)}`,
    `Database: ${sanitize(report.runtime.database)} (${report.runtime.databaseBytes} bytes)`,
    ""
  ];
  for (const check of report.checks) lines.push(`${check.label}: ${check.status.toUpperCase()}`);
  for (const check of report.checks.filter((item) => item.status === "failed" || item.status === "warning")) {
    lines.push("", check.status.toUpperCase(), sanitize(check.label), sanitize(check.detail));
    if (check.action) lines.push(`Next action: ${sanitize(check.action)}`);
  }
  lines.push("", `Generated: ${report.generatedAt}`, `Diagnostic ID: ${report.reportId}`);
  return lines.join("\n");
}
