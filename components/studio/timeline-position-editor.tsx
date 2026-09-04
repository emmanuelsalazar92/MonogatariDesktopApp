"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { TimelineEventDialog } from "./timeline-event-dialog";
import type { RelationshipSinceOption } from "@/lib/relationship-since";
import type { TimelineEvent } from "@/lib/studio-domain";

export function TimelinePositionEditor({ event, options, characters, places, onChanged }: {
  event: TimelineEvent; options: RelationshipSinceOption[];
  characters: { id: string; novelId: string; name: string }[]; places: { id: string; novelId: string; name: string }[];
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  return <><Button size="sm" variant="outline" onClick={() => setOpen(true)}>Edit Event</Button>
    {open ? <TimelineEventDialog novelId={event.novelId} event={event} options={options} characters={characters} places={places} onClose={() => setOpen(false)} onSaved={onChanged} /> : null}
  </>;
}
