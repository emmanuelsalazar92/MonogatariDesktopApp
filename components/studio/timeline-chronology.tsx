"use client";
import Link from "next/link";
import { TimelineStoryLink } from "./timeline-story-link";
import { chronologicalGroups, chronologyLabel } from "@/lib/timeline-chronology";
import { routeForCharacter, routeForPlace, routeForTimelineEvent } from "@/lib/studio-routes";
import type { TimelineEventSummary } from "@/lib/studio-domain";
import type { RelationshipSinceOption } from "@/lib/relationship-since";

export function TimelineChronology({ events, novelId, showSpoilers, selectedId, characters, places, storyOptions, catalogQuery }: {
  events: TimelineEventSummary[]; novelId: string; showSpoilers: boolean; selectedId?: string;
  characters: { id: string; novelId: string; name: string; archivedAt?: string | null }[]; places: { id: string; novelId: string; name: string; status?: string }[];
  storyOptions: RelationshipSinceOption[];
  catalogQuery?: string;
}) {
  const groups = chronologicalGroups(events, novelId, showSpoilers);
  const people = new Map(characters.filter(person => person.novelId === novelId).map(person => [person.id, person]));
  const locations = new Map(places.filter(place => place.novelId === novelId).map(place => [place.id, place]));
  const positions = new Map(storyOptions.map(option => [`${option.kind}:${option.id}`, option.label]));
  const linkClass = "rounded text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
  if (!groups.length) return <p role="status">No visible events match these filters.</p>;
  return <ol aria-label="Chronological events" className="ml-2 min-w-0 border-l-2 border-border pl-5">
    {groups.map(group => <li key={group.key} className="relative min-w-0 pb-6 last:pb-0">
      <span aria-hidden="true" className="absolute -left-[27px] top-1 size-3 rounded-full border-2 border-primary bg-background" />
      <h3 className="font-semibold [overflow-wrap:anywhere]">{group.label}</h3>
      {group.events.length > 1 ? <p className="text-xs text-muted-foreground">Shared position · display order by event ID, not time</p> : null}
      <ol aria-label={`Events at ${group.label}`} className="mt-3 grid min-w-0 gap-3">
        {group.events.map(event => {
          const kind = event.sceneId ? "scene" : event.chapterId ? "chapter" : "volume";
          const target = event.sceneId || event.chapterId || event.volumeId;
          return <li key={event.id} className="min-w-0 space-y-2 rounded-lg border bg-card p-4 [overflow-wrap:anywhere]">
            <h4 className="font-semibold"><Link className={linkClass} href={`${routeForTimelineEvent(novelId, event.id)}${catalogQuery ? `?${catalogQuery}` : showSpoilers ? "?spoilers=true" : ""}`} aria-current={event.id === selectedId ? "page" : undefined}>{event.title}</Link></h4>
            <p className="text-sm">When: {chronologyLabel(event)}{event.isSpoiler ? " · Spoiler" : ""}{event.archivedAt ? " · Archived" : ""}</p>
            <p className="text-sm text-muted-foreground">Told in: {positions.get(`${kind}:${target}`) ?? (target ? "Structure target unavailable" : "Not told in Structure")}</p>
            <TimelineStoryLink event={event} novelId={novelId} options={storyOptions} />
            <ul aria-label="Linked characters and places" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {event.characterIds.map(id => { const person = people.get(id); return person ? <li key={`c:${id}`}><Link className={linkClass} href={routeForCharacter(person.novelId, person.id)}>{person.name}{person.archivedAt ? " (Archived)" : ""}</Link></li> : <li key={`c:${id}`}>Character unavailable</li>; })}
              {event.locationIds.map(id => { const place = locations.get(id); return place ? <li key={`p:${id}`}><Link className={linkClass} href={routeForPlace(place.novelId, place.id)}>{place.name}{place.status === "archived" ? " (Archived)" : ""}</Link></li> : <li key={`p:${id}`}>Place unavailable</li>; })}
            </ul>
          </li>;
        })}
      </ol>
    </li>)}
  </ol>;
}
