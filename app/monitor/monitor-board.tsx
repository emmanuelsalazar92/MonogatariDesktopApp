"use client";

import * as React from "react";
import type { MonitorReport, MonitorStatus } from "@/lib/runtime-monitor";
import type { CapabilityStatus, OverallHealth } from "@/lib/monitor-health-model";
import { formatDiagnosticReport } from "@/lib/monitor-report";

const statusCopy: Record<MonitorStatus, string> = { healthy: "Healthy", warning: "Warning", failed: "Failed", unknown: "Unknown" };
const statusClass: Record<MonitorStatus, string> = { healthy: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800", warning: "border-amber-500/40 bg-amber-500/10 text-amber-900", failed: "border-red-500/40 bg-red-500/10 text-red-800", unknown: "border-slate-400/40 bg-slate-500/10 text-slate-800" };
const overallCopy: Record<OverallHealth, string> = { healthy: "Healthy", degraded: "Degraded", failed: "Failed", unknown: "Unknown" };
const overallClass: Record<OverallHealth, string> = { healthy: statusClass.healthy, degraded: statusClass.warning, failed: statusClass.failed, unknown: statusClass.unknown };
const capabilityCopy: Record<CapabilityStatus, string> = { available: "Available", degraded: "Degraded", unavailable: "Unavailable", unknown: "Unknown" };
const capabilityClass: Record<CapabilityStatus, string> = { available: statusClass.healthy, degraded: statusClass.warning, unavailable: statusClass.failed, unknown: statusClass.unknown };

export function MonitorBoard({ initial }: { initial: MonitorReport }) {
  const [report, setReport] = React.useState(initial);
  const [refreshing, setRefreshing] = React.useState(false);
  const [open, setOpen] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  async function refresh() {
    setRefreshing(true);
    try { const response = await fetch("/api/monitor", { cache: "no-store" }); if (response.ok) setReport(await response.json() as MonitorReport); }
    finally { setRefreshing(false); }
  }
  async function copyReport() {
    await navigator.clipboard.writeText(formatDiagnosticReport(report));
    setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  }
  return <main className="mx-auto min-h-screen max-w-5xl bg-background px-4 py-8 text-foreground sm:px-8">
    <header className="mb-7 flex flex-wrap items-center justify-between gap-4 border-b pb-5">
      <div><p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground">PRIVATE ADMINISTRATION</p><h1 className="text-2xl font-bold">Monogatari system health</h1><p className="mt-1 text-sm text-muted-foreground">On-demand checks only. No background polling or manuscript changes.</p></div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={copyReport} className="min-h-11 rounded-md border px-4 text-sm font-semibold">{copied ? "Copied" : "Copy diagnostic report"}</button><button type="button" onClick={refresh} disabled={refreshing} className="min-h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{refreshing ? "Running diagnostics…" : "Run diagnostics"}</button></div>
    </header>
    <section className={`mb-6 rounded-lg border p-4 ${overallClass[report.overall]}`} aria-label={`Overall status: ${overallCopy[report.overall]}`}><div className="text-xs font-semibold tracking-wide">OVERALL</div><div className="text-xl font-bold">{overallCopy[report.overall]}</div><p className="text-sm">Last checked {new Date(report.generatedAt).toLocaleString()}</p></section>
    <section className="mb-6 rounded-lg border bg-card p-4" aria-label="Capability overview"><h2 className="font-semibold">Capabilities</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{report.capabilities.map((capability) => <article key={capability.id} className={`rounded-md border px-3 py-2 ${capabilityClass[capability.status]}`}><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{capability.label}</span><span className="text-xs font-bold">{capabilityCopy[capability.status]}</span></div>{capability.reason ? <p className="mt-1 text-xs">{capability.reason}</p> : !capability.enabled ? <p className="mt-1 text-xs">Optional capability is not configured.</p> : null}</article>)}</div></section>
    <section className="grid gap-3 sm:grid-cols-2" aria-label="Diagnostic checks">
      {report.checks.map((item) => <article key={item.id} className={`rounded-lg border p-4 ${statusClass[item.status]}`}>
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOpen(open === item.id ? null : item.id)} aria-expanded={open === item.id}><span className="font-semibold">{item.label}</span><span className="rounded-full border px-2 py-0.5 text-xs font-bold">{statusCopy[item.status]}</span></button>
        {open === item.id && <div className="mt-3 border-t pt-3 text-sm"><p>{item.detail}</p>{item.action && <p className="mt-2 font-medium">Next action: {item.action}</p>}{item.affected?.length ? <ul className="mt-3 list-disc space-y-1 pl-5 text-xs"><li className="list-none font-semibold">Affected items</li>{item.affected.map((affected) => <li key={`${affected.novelId}:${affected.sceneId ?? affected.label}`}>{affected.label} <span className="text-muted-foreground">({affected.sceneId ?? affected.novelId})</span></li>)}</ul> : null}</div>}
      </article>)}
    </section>
    <section className="mt-6 rounded-lg border bg-card p-4 text-sm"><h2 className="font-semibold">Runtime</h2><dl className="mt-2 grid gap-1 sm:grid-cols-2"><div><dt className="inline text-muted-foreground">Version: </dt><dd className="inline">{report.runtime.version}</dd></div><div><dt className="inline text-muted-foreground">Build / commit: </dt><dd className="inline">{report.runtime.build} / {report.runtime.commit}</dd></div><div><dt className="inline text-muted-foreground">Built: </dt><dd className="inline">{report.runtime.builtAt}</dd></div><div><dt className="inline text-muted-foreground">Node: </dt><dd className="inline">{report.runtime.node} ({report.runtime.platform})</dd></div><div><dt className="inline text-muted-foreground">Database: </dt><dd className="inline">{report.runtime.database} ({report.runtime.databaseBytes} bytes)</dd></div><div><dt className="inline text-muted-foreground">Environment: </dt><dd className="inline">{report.runtime.environment}; uptime {report.runtime.uptimeSeconds}s</dd></div></dl></section>
    <section className="mt-6 grid gap-4 sm:grid-cols-2"><History title="Recent failures" empty="No recent Notion failures are stored." events={report.recentFailures} /><History title="Last sync results" empty="No per-novel sync result is stored yet." events={report.lastSyncResults} /></section>
  </main>;
}

function History({ title, empty, events }: { title: string; empty: string; events: MonitorReport["recentFailures"] }) {
  return <section className="rounded-lg border bg-card p-4 text-sm"><h2 className="font-semibold">{title}</h2>{events.length ? <ul className="mt-3 space-y-3">{events.map((event) => <li key={`${event.operationId}:${event.at}`} className="border-t pt-2 first:border-0 first:pt-0"><p className="font-medium">{event.outcome === "failed" ? "Failed" : "Completed"} · {event.operation}</p><p className="text-xs text-muted-foreground">{event.at} · {event.operationId}</p><p className="text-xs">{event.novelId ?? "All connected novels"}{event.sceneId ? ` · ${event.sceneId}` : ""}{event.code ? ` · ${event.code}` : ""}{event.stage ? ` · ${event.stage}` : ""}</p>{event.message ? <p className="mt-1 text-xs">{event.message}</p> : null}</li>)}</ul> : <p className="mt-2 text-muted-foreground">{empty}</p>}</section>;
}
