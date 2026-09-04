"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import type { TimelineEvent, TimelineEventSummary } from "@/lib/studio-domain";
import { readTimelineDetail } from "@/lib/timeline-read";

export function TimelineDetailLoader({ summary, showSpoilers, children }: {
  summary: TimelineEventSummary; showSpoilers: boolean; children: (event: TimelineEvent) => React.ReactNode;
}) {
  const [detail, setDetail] = React.useState<{ key: string; event: TimelineEvent } | null>(null);
  const [error, setError] = React.useState(false), [attempt, setAttempt] = React.useState(0);
  const key = `${summary.novelId}:${summary.id}:${summary.positionRevision}:${showSpoilers}`;
  React.useEffect(() => {
    const controller = new AbortController(); setError(false);
    void fetch(`/api/timeline-events/${encodeURIComponent(summary.id)}?novelId=${encodeURIComponent(summary.novelId)}&spoilers=${showSpoilers}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Unavailable");
        const event = readTimelineDetail(await response.json(), summary.novelId, summary.id, showSpoilers);
        if (!event) throw new Error("Invalid detail");
        if (!controller.signal.aborted) setDetail({ key, event });
      }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [summary.id, summary.novelId, key, showSpoilers, attempt]);
  if (error) return <div><p role="alert">Event detail is unavailable. The chronology remains accessible.</p><Button onClick={() => setAttempt(value => value + 1)}>Retry detail</Button></div>;
  return detail?.key === key ? children(detail.event) : <p role="status">Loading event detail…</p>;
}
