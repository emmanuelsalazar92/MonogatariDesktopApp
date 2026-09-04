"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import type { TimelineEventSummary } from "@/lib/studio-domain";
import { readTimelineSummary } from "@/lib/timeline-read";

export function TimelineCatalogLoader({ novelId, selectedId, showSpoilers, showArchived = false, refreshKey, children }: {
  novelId: string; selectedId?: string; showSpoilers: boolean; showArchived?: boolean; refreshKey: unknown; children: (events: TimelineEventSummary[]) => React.ReactNode;
}) {
  const [result, setResult] = React.useState<{ key: string; events: TimelineEventSummary[] } | null>(null);
  const [error, setError] = React.useState(false), [attempt, setAttempt] = React.useState(0);
  const key = `${novelId}:${showSpoilers}:${showArchived}:${selectedId ?? ""}`;
  React.useEffect(() => {
    const controller = new AbortController(); setError(false);
    void fetch(`/api/timeline-events?novelId=${encodeURIComponent(novelId)}&spoilers=${showSpoilers}&archived=${showArchived}${selectedId ? `&selected=${encodeURIComponent(selectedId)}` : ""}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Unavailable");
        const payload: unknown = await response.json();
        if (!Array.isArray(payload)) throw new Error("Invalid catalog");
        const rows = payload.map(row => readTimelineSummary(row, novelId, showSpoilers));
        if (rows.some(row => !row || (!showArchived && row.archivedAt && row.id !== selectedId))) throw new Error("Invalid catalog");
        if (!controller.signal.aborted) setResult({ key, events: rows as TimelineEventSummary[] });
      }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [novelId, selectedId, showSpoilers, showArchived, refreshKey, key, attempt]);
  if (error) return <div><p role="alert">Could not load Timeline. Your filters are preserved.</p><Button onClick={() => setAttempt(n => n + 1)}>Retry Timeline</Button></div>;
  return result?.key === key ? children(result.events) : <p role="status">Loading Timeline…</p>;
}
