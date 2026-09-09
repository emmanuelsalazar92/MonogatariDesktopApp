"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { SyncCenterScene } from "@/lib/notion-sync-center";

function notionPageUrl(pageId: string | null) {
  return pageId && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(pageId)
    ? `https://www.notion.so/${pageId.replaceAll("-", "")}`
    : null;
}

type Activity = {
  at: string;
  operationId: string;
  operation: string;
  outcome: string;
  direction?: string;
  sceneId?: string;
};

type Report = {
  novel: { id: string; title: string };
  novelPageId: string;
  lastSync: string | null;
  aggregateState: string;
  scenes: SyncCenterScene[];
  counts: Record<string, number>;
  activity: Activity[];
};

const label: Record<SyncCenterScene["status"], string> = {
  synced: "Verified synced",
  "baseline-match": "Matches baseline",
  "local-changes": "Local changes",
  conflict: "Conflict",
  failed: "Failed",
  pending: "Pending",
  unknown: "Unknown"
};

type SceneMode = "push" | "pull" | "reconcile" | "keep-monogatari" | "keep-notion";
type SceneConflict = {
  sceneId?: string;
  sceneTitle?: string;
  message: string;
  localContent?: string;
  baselineContent?: string;
  remoteContent?: string;
};

function retryMode(scene: SyncCenterScene): SceneMode {
  if (scene.lastOperation === "PULL_SCENE") return "pull";
  if (scene.lastOperation === "RECONCILE_SCENE") return "reconcile";
  return "push";
}

export function NotionSyncCenter({ initial }: { initial: Report }) {
  const [report] = React.useState(initial);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState<SceneConflict | null>(null);
  const [details, setDetails] = React.useState<string | null>(null);

  const run = async (kind: "sync" | "pull") => {
    setBusy(kind);
    setMessage(null);
    try {
      const response = await fetch(kind === "sync" ? "/api/integrations/notion/sync" : "/api/integrations/notion/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ novelId: report.novel.id })
      });
      const result = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !result.ok) throw new Error(result.message ?? "Notion operation could not complete.");
      setMessage(result.message ?? "Notion operation completed.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Notion operation could not complete.");
    } finally {
      setBusy(null);
    }
  };

  const runScene = async (sceneId: string, mode: SceneMode) => {
    setBusy(`${sceneId}:${mode}`);
    setMessage(null);
    try {
      const response = await fetch("/api/integrations/notion/scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ novelId: report.novel.id, sceneId, mode })
      });
      const result = await response.json() as { ok?: boolean; message?: string; conflicts?: SceneConflict[] };
      if (!response.ok || !result.ok) {
        if (result.conflicts?.[0]) setConflict(result.conflicts[0]);
        throw new Error(result.message ?? "Scene operation could not complete.");
      }
      setConflict(null);
      setMessage(result.message ?? "Scene operation completed.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Scene operation could not complete.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-8">
      <Link className="text-sm text-muted-foreground underline" href={`/novels/${report.novel.id}`}>
        Back to Current Novel
      </Link>
      <header className="mt-4 flex flex-col gap-4 rounded-lg border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground">NOTION SYNC CENTER</p>
          <h1 className="text-2xl font-bold">{report.novel.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connected · {report.aggregateState} · {report.lastSync ? `Last successful sync ${new Date(report.lastSync).toLocaleString()}` : "No successful sync recorded"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href={notionPageUrl(report.novelPageId) ?? undefined} target="_blank" rel="noreferrer">Open novel in Notion</a>
          </Button>
          <Button disabled={busy !== null} onClick={() => void run("pull")}>{busy === "pull" ? "Pulling…" : "Pull from Notion"}</Button>
          <Button disabled={busy !== null} onClick={() => void run("sync")}>{busy === "sync" ? "Syncing…" : "Sync now"}</Button>
        </div>
      </header>

      {message ? <p role="status" className="mt-4 rounded-md border p-3 text-sm">{message}</p> : null}

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        {Object.entries(report.counts).map(([status, count]) => (
          <article key={status} className="rounded-lg border bg-card p-3">
            <p className="text-2xl font-bold tabular-nums">{count}</p>
            <p className="text-sm text-muted-foreground">{label[status as SyncCenterScene["status"]]}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 rounded-lg border bg-card p-4">
        <h2 className="font-semibold">Scenes</h2>
        <div className="mt-3 divide-y">
          {report.scenes.map((scene) => {
            const retry = retryMode(scene);
            return (
              <article key={scene.id} className="py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-44 flex-1">
                    <p className="font-medium">{scene.title}</p>
                    <p className="text-xs text-muted-foreground">{scene.detail}</p>
                  </div>
                  <span className="rounded-full border px-2 py-1 text-xs font-semibold">{label[scene.status]}</span>
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void runScene(scene.id, "reconcile")}>
                    {busy === `${scene.id}:reconcile` ? "Syncing…" : "Sync Scene"}
                  </Button>
                  {scene.notionPageId ? (
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void runScene(scene.id, "pull")}>
                      {scene.status === "conflict" ? "Review" : "Pull"}
                    </Button>
                  ) : null}
                  {scene.status === "local-changes" || scene.status === "pending" ? (
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void runScene(scene.id, "push")}>Push</Button>
                  ) : null}
                  {scene.status === "failed" ? (
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void runScene(scene.id, retry)}>Retry {retry}</Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => setDetails(details === scene.id ? null : scene.id)}>Details</Button>
                  {notionPageUrl(scene.notionPageId) ? (
                    <a className="text-sm underline" href={notionPageUrl(scene.notionPageId)!} target="_blank" rel="noreferrer">Open in Notion</a>
                  ) : null}
                </div>
                {details === scene.id ? (
                  <div className="mt-3 rounded-md bg-muted/40 p-3 text-xs">
                    <p><strong>Known local state:</strong> {label[scene.status]}</p>
                    <p><strong>Last remote knowledge:</strong> stored baseline only</p>
                    <p><strong>Current remote state:</strong> unknown until Pull or Sync Scene is requested</p>
                    <p><strong>Latest explicit result:</strong> {scene.lastOperationAt ? `${scene.lastOperation} · ${new Date(scene.lastOperationAt).toLocaleString()} · ${scene.lastOperationId}` : "none recorded"}</p>
                    <p><strong>Mapping:</strong> {scene.notionPageId ?? "unmapped"}</p>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      {conflict?.sceneId ? (
        <section className="mt-6 rounded-lg border border-amber-500/50 bg-amber-500/5 p-4" aria-labelledby="scene-conflict-title">
          <h2 id="scene-conflict-title" className="font-semibold">Review conflict · {conflict.sceneTitle ?? "Scene"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{conflict.message}</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <ConflictCopy title="Monogatari" value={conflict.localContent} />
            <ConflictCopy title="Last synchronized" value={conflict.baselineContent} />
            <ConflictCopy title="Notion" value={conflict.remoteContent} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={busy !== null} onClick={() => void runScene(conflict.sceneId!, "keep-monogatari")}>Keep Monogatari</Button>
            <Button disabled={busy !== null} onClick={() => void runScene(conflict.sceneId!, "keep-notion")}>Keep Notion</Button>
            <Button variant="ghost" disabled={busy !== null} onClick={() => setConflict(null)}>Cancel</Button>
          </div>
        </section>
      ) : null}

      <section className="mt-6 rounded-lg border bg-card p-4">
        <h2 className="font-semibold">Recent sync activity</h2>
        {report.activity.length ? (
          <ul className="mt-3 space-y-2 text-sm">
            {report.activity.map((event) => (
              <li key={`${event.operationId}:${event.at}`}>
                <span className="font-medium">{event.outcome === "completed" ? "Completed" : "Failed"} · {event.operation}</span>
                <span className="text-muted-foreground"> · {event.direction ?? "UNKNOWN"} · {new Date(event.at).toLocaleString()} · {event.operationId}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-sm text-muted-foreground">No synchronization activity is recorded for this novel.</p>}
      </section>
    </main>
  );
}

function ConflictCopy({ title, value }: { title: string; value?: string }) {
  return (
    <section className="min-w-0 rounded-md border bg-background p-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs">{value ?? "Unavailable"}</pre>
    </section>
  );
}
