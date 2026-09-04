"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TimelineEventSummary } from "@/lib/studio-domain";
import { compareTimelineEvents, derivePlaceStoryEvents } from "@/lib/timeline-place";
import { isValidNovelRouteId, routeForTimelineEvent } from "@/lib/studio-routes";

export function PlaceStoryEvents({ place, events, onChanged }: {
  place: { id: string; novelId: string };
  events: TimelineEventSummary[];
  onChanged: () => Promise<void>;
}) {
  const linked = React.useMemo(() => derivePlaceStoryEvents(place, events), [place, events]);
  const available = React.useMemo(() => events.filter((event) => event.novelId === place.novelId && !event.locationIds.includes(place.id) && isValidNovelRouteId(event.id)).sort(compareTimelineEvents), [events, place.novelId, place.id]);
  const [eventId, setEventId] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const request = React.useRef<AbortController | null>(null);
  const selectorId = React.useId();
  React.useEffect(() => () => request.current?.abort(), []);

  const mutate = async (id: string, link: boolean) => {
    if (pending) return;
    const controller = new AbortController(); request.current = controller;
    setPending(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/timeline-events/${encodeURIComponent(id)}/place?novelId=${encodeURIComponent(place.novelId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ locationId: place.id, linked: link, expectedLinked: !link })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Could not update the event place");
      }
      if (controller.signal.aborted) return;
      await onChanged();
      if (controller.signal.aborted) return;
      setEventId(""); setMessage(link ? "Event linked" : "Event unlinked");
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not update the event place");
    } finally { if (!controller.signal.aborted) setPending(false); }
  };

  return <section aria-label="Story Events" className="grid gap-3 rounded-md border border-border/60 p-3">
    <h3 className="text-sm font-semibold">Story Events ({linked.length})</h3>
    {linked.length ? <ol className="grid gap-2">{linked.map((event) => <li key={event.id} className="flex flex-wrap items-start justify-between gap-2 rounded border p-2">
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <Link href={routeForTimelineEvent(place.novelId, event.id)} className="text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">{event.title}</Link>
        <p className="text-xs text-muted-foreground">{event.internalDate || "No date"}{event.isSpoiler ? " · Spoiler" : ""}</p>
      </div>
      <Button type="button" variant="ghost" size="sm" disabled={pending} aria-label={`Unlink event ${event.title}`} onClick={() => void mutate(event.id, false)}>Unlink</Button>
    </li>)}</ol> : <p className="text-sm text-muted-foreground">No story events linked yet</p>}
    <form onSubmit={(event) => { event.preventDefault(); if (available.some((item) => item.id === eventId)) void mutate(eventId, true); }} className="grid gap-2">
      <Label htmlFor={selectorId}>Timeline event</Label>
      <Select value={eventId} onValueChange={setEventId} disabled={pending || !available.length}>
        <SelectTrigger className="min-w-0" id={selectorId}><SelectValue placeholder="Select event" /></SelectTrigger>
        <SelectContent className="max-h-[min(24rem,var(--radix-select-content-available-height))] max-w-[calc(100vw-2rem)] [overflow-wrap:anywhere]">{available.map((event) => <SelectItem key={event.id} value={event.id}>{event.internalDate ? `${event.internalDate} · ` : ""}{event.title}</SelectItem>)}</SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">Events can have multiple Places. Linking or unlinking here preserves their other associations.</p>
      <Button type="submit" disabled={pending || !available.some((event) => event.id === eventId)}>{pending ? "Saving…" : "Link event"}</Button>
    </form>
    {error ? <div className="grid gap-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => { void onChanged().then(() => { setError(""); setEventId(""); }).catch(() => setError("Could not refresh events. Please retry.")); }}>Reload events</Button></div> : null}
    {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
  </section>;
}
