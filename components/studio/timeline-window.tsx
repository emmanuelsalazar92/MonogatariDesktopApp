"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { TimelineChronology } from "./timeline-chronology";
import { timelineWindow } from "@/lib/timeline-read";

export function TimelineWindow(props: React.ComponentProps<typeof TimelineChronology>) {
  const [requested, setRequested] = React.useState(0), heading = React.useRef<HTMLParagraphElement>(null);
  const window = timelineWindow(props.events, requested);
  const move = (page: number) => { setRequested(page); heading.current?.focus(); };
  return <div className="min-w-0 space-y-4">
    <p ref={heading} tabIndex={-1} role="status" className="text-sm text-muted-foreground">Page {window.page + 1} of {window.pages}. Equal positions can continue on the next page.</p>
    <TimelineChronology {...props} events={window.events} />
    {window.pages > 1 ? <nav aria-label="Timeline pages" className="flex flex-wrap gap-3"><Button variant="outline" disabled={window.page === 0} onClick={() => move(window.page - 1)}>Previous events</Button><Button variant="outline" disabled={window.page + 1 === window.pages} onClick={() => move(window.page + 1)}>Next events</Button></nav> : null}
  </div>;
}
