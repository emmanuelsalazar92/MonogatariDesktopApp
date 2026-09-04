"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { loadRelationshipCatalog, loadRelationshipDetail } from "@/lib/relationship-read";
import type { Relationship, RelationshipSummary } from "@/lib/studio-domain";

export function RelationshipCatalogLoader({ novelId, showSpoilers, lifecycle, refreshKey, children }: {
  novelId: string; showSpoilers: boolean; lifecycle: "active" | "archived" | "all"; refreshKey: unknown;
  children: (rows: RelationshipSummary[]) => React.ReactNode;
}) {
  const [rows, setRows] = React.useState<{ key: string; data: RelationshipSummary[] } | null>(null);
  const [error, setError] = React.useState(false), [attempt, setAttempt] = React.useState(0);
  const key = `${novelId}:${showSpoilers}:${lifecycle}`;
  React.useEffect(() => {
    const controller = new AbortController(); setError(false);
    void loadRelationshipCatalog(novelId, showSpoilers, lifecycle, controller.signal).then((data) => {
      if (!controller.signal.aborted) setRows({ key, data });
    }).catch(() => { if (!controller.signal.aborted) { setRows(null); setError(true); } });
    return () => controller.abort();
  }, [novelId, showSpoilers, lifecycle, refreshKey, key, attempt]);
  if (error) return <section className="space-y-3 rounded-lg border p-4"><p role="alert">Could not load relationships. Your filters are unchanged.</p><Button onClick={() => setAttempt((n) => n + 1)}>Retry catalog</Button></section>;
  return rows?.key === key ? children(rows.data) : <p role="status">Loading relationships…</p>;
}

export function RelationshipDetailLoader({ summary, showSpoilers, children }: {
  summary: RelationshipSummary; showSpoilers: boolean; children: (relationship: Relationship) => React.ReactNode;
}) {
  const [detail, setDetail] = React.useState<{ key: string; data: Relationship } | null>(null);
  const [error, setError] = React.useState(false), [attempt, setAttempt] = React.useState(0);
  const key = `${summary.novelId}:${summary.id}:${summary.revision}:${showSpoilers}`;
  React.useEffect(() => {
    const controller = new AbortController(); setError(false); setDetail(null);
    void loadRelationshipDetail(summary.novelId, summary.id, showSpoilers, controller.signal).then((data) => {
      if (!controller.signal.aborted) setDetail({ key, data });
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [key, summary.novelId, summary.id, showSpoilers, attempt]);
  if (error) return <div className="space-y-3"><p role="alert">This relationship is unavailable or could not load. The catalog is still available.</p><Button onClick={() => setAttempt((n) => n + 1)}>Retry detail</Button></div>;
  return detail?.key === key ? children(detail.data) : <p role="status">Loading relationship detail…</p>;
}
