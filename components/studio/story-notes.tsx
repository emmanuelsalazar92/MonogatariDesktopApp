"use client";
import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { NoteCaptureTarget } from "@/lib/note-capture";
import type { NoteCatalogResult } from "@/lib/note-catalog";
import { relatedNotesHref } from "@/lib/note-navigation";
import { isValidNovelRouteId } from "@/lib/studio-routes";
import { NoteUpdatesContext } from "./note-capture";

export function StoryNotes({ target }: { target: NoteCaptureTarget }) {
  const version = React.useContext(NoteUpdatesContext), [retry, setRetry] = React.useState(0);
  const href = relatedNotesHref(target.novelId, target);
  const key = `${target.novelId}:${target.type}:${target.id}`;
  const [state, setState] = React.useState<{ key: string; data?: NoteCatalogResult; error?: boolean }>({ key: "" });
  React.useEffect(() => {
    const abort = new AbortController(); setState({ key });
    if (!href) { setState({ key, error: true }); return; }
    const params = new URLSearchParams({ novelId: target.novelId, entityType: target.type, entity: target.id, archived: "all" });
    void fetch(`/api/notes?${params}`, { signal: abort.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error();
      const data = await response.json() as NoteCatalogResult;
      if (!Array.isArray(data.items) || !data.items.every(note => note.novelId === target.novelId && typeof note.id === "string" && isValidNovelRouteId(note.id) && typeof note.title === "string" && typeof note.snippet === "string" && note.links?.some(link => link.type === target.type && link.id === target.id))) throw new Error();
      if (!abort.signal.aborted) setState({ key, data });
    }).catch(() => { if (!abort.signal.aborted) setState({ key, error: true }); });
    return () => abort.abort();
  }, [key, href, target.novelId, target.type, target.id, version, retry]);
  const current = state.key === key ? state : null;
  return <section aria-label="Related notes" className="grid min-w-0 gap-2 rounded-lg border p-3">
    <h3 className="font-semibold">Notes</h3>
    {current?.error ? <div role="alert"><p className="text-sm">Could not load related notes.</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>Retry notes</Button></div>
      : !current?.data ? <p role="status" className="text-sm">Loading related notes…</p>
      : current.data.items.length ? <>
        <ul className="grid min-w-0 gap-3">{current.data.items.slice(0, 5).map(note => <li key={note.id} className="min-w-0 text-sm [overflow-wrap:anywhere]">
          <Link href={relatedNotesHref(target.novelId, target, note.id)!} className="font-medium text-primary underline focus-visible:outline focus-visible:outline-2">{note.title}</Link>
          {note.archivedAt ? <span> (Archived)</span> : null}
          <p className="line-clamp-2 whitespace-pre-wrap text-muted-foreground">{note.snippet.slice(0, 160)}</p>
        </li>)}</ul>
        <Link href={href!} className="text-sm text-primary underline focus-visible:outline focus-visible:outline-2">View all {current.data.matched} related notes</Link>
      </> : <p className="text-sm text-muted-foreground">No notes linked to this {target.type === "TimelineEvent" ? "event" : target.type.toLowerCase()} yet.</p>}
  </section>;
}
