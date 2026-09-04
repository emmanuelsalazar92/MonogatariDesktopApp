"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { loadPlaceDetail } from "@/lib/place-detail";
import { routeForPlaceCatalog, type PlaceCatalogState } from "@/lib/place-catalog";
import type { Location, PlaceSummary } from "@/lib/studio-domain";

export function PlaceDetailLoader({ summary, catalogState, children }: {
  summary: PlaceSummary; catalogState: PlaceCatalogState; children: (place: Location) => React.ReactNode;
}) {
  const [place, setPlace] = React.useState<Location | null>(null);
  const [error, setError] = React.useState("");
  const [attempt, setAttempt] = React.useState(0);
  const heading = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => { heading.current?.focus(); }, []);
  React.useEffect(() => {
    const controller = new AbortController();
    setError("");
    void loadPlaceDetail(summary.novelId, summary.id, controller.signal).then((result) => {
      if (!controller.signal.aborted) setPlace(result);
    }).catch(() => {
      // Never display/log response bodies: they can contain private project data.
      if (!controller.signal.aborted) setError("Could not load this place. Retry or return to the catalog.");
    });
    return () => controller.abort();
  }, [summary, attempt]); // A refreshed catalog invalidates the selected detail, including joins/reorders.

  if (!error && place?.id === summary.id && place.novelId === summary.novelId) return children(place);
  return <section aria-label="Place detail" className="min-w-0 space-y-4 rounded-lg border p-4 [overflow-wrap:anywhere]">
    <Link href={routeForPlaceCatalog(summary.novelId, catalogState)} className="text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">Back to catalog</Link>
    <h3 ref={heading} tabIndex={-1} className="font-semibold">{summary.name}</h3>
    {error ? <><p role="alert">{error}</p><Button type="button" variant="outline" onClick={() => setAttempt((current) => current + 1)}>Retry detail</Button></>
      : <p role="status">Loading place…</p>}
  </section>;
}
