"use client";
import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { resolveSceneAnnotations, type SceneAnnotationSummary } from "@/lib/scene-annotation-anchor";
import { routeForNote } from "@/lib/studio-routes";
import { isValidNovelRouteId } from "@/lib/studio-routes";
import { NoteUpdatesContext } from "./note-capture";

const preferenceKey = "monogatari:scene-annotation-markers:v1";
type Response = { items: SceneAnnotationSummary[]; truncated: boolean };

export function SceneAnnotations({ novelId, sceneId, content, manuscriptRef }: { novelId: string; sceneId: string; content: string; manuscriptRef: React.RefObject<HTMLTextAreaElement | null> }) {
  const version = React.useContext(NoteUpdatesContext);
  const [data, setData] = React.useState<Response | null>(null), [error, setError] = React.useState(false), [retry, setRetry] = React.useState(0);
  const [visible, setVisible] = React.useState(true), [selected, setSelected] = React.useState<SceneAnnotationSummary | null>(null);
  React.useEffect(() => { try { setVisible(localStorage.getItem(preferenceKey) !== "off"); } catch { /* keep in-memory preference */ } }, []);
  React.useEffect(() => {
    const abort = new AbortController(); setData(null); setError(false); setSelected(null);
    void fetch(`/api/scenes/${encodeURIComponent(sceneId)}/annotations?novelId=${encodeURIComponent(novelId)}`, { signal: abort.signal, cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<Response>; })
      .then(value => {
        if (!value || typeof value.truncated !== "boolean" || !Array.isArray(value.items) || value.items.length > 100 || !value.items.every(note => note && isValidNovelRouteId(note.id) && typeof note.title === "string" && typeof note.quotedText === "string" && note.quotedText.length <= 10_000 && typeof note.matchable === "boolean" && typeof note.workflowStatus === "string")) throw new Error();
        if (!abort.signal.aborted) setData(value);
      })
      .catch(() => { if (!abort.signal.aborted) setError(true); });
    return () => abort.abort();
  }, [novelId, retry, sceneId, version]);
  const resolved = React.useMemo(() => data ? resolveSceneAnnotations(content, data.items) : [], [content, data]);
  const setMarkers = (next: boolean) => { setVisible(next); setSelected(null); try { localStorage.setItem(preferenceKey, next ? "on" : "off"); } catch { /* preference remains in memory */ } };
  React.useEffect(() => {
    if (!selected) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setSelected(null); requestAnimationFrame(() => manuscriptRef.current?.focus({ preventScroll: true })); } };
    document.addEventListener("keydown", escape); return () => document.removeEventListener("keydown", escape);
  }, [manuscriptRef, selected]);
  const open = (note: SceneAnnotationSummary) => setSelected(note);
  const close = () => { setSelected(null); requestAnimationFrame(() => manuscriptRef.current?.focus({ preventScroll: true })); };
  return <section aria-label="Scene annotations" className="mx-auto mt-3 grid max-w-4xl min-w-0 gap-2 rounded-lg border p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-medium">Scene annotations</h3><p className="text-xs text-muted-foreground">Exact quotes are resolved locally on every render; positions are never saved.</p></div><Button type="button" size="sm" variant="outline" aria-pressed={visible} onClick={() => setMarkers(!visible)}>{visible ? "Annotation markers On" : "Annotation markers Off"}</Button></div>
    {error ? <div role="alert" className="text-sm">Annotations are temporarily unavailable. Notes remain safe. <Button type="button" size="sm" variant="outline" onClick={() => setRetry(value => value + 1)}>Retry</Button></div> : null}
    {!error && !data ? <p role="status" className="text-sm text-muted-foreground">Loading annotations…</p> : null}
    {visible && data ? resolved.length ? <>
      <p role="status" className="text-sm text-muted-foreground">{resolved.filter(item => item.status === "anchored").length} anchored · {resolved.filter(item => item.status === "unanchored").length} unanchored</p>
      <ul className="grid gap-2">{resolved.map(note => <li key={note.id} className="min-w-0"><button type="button" className="flex w-full min-w-0 items-start gap-2 rounded border-l-4 p-2 text-left focus-visible:outline focus-visible:outline-2" onClick={() => open(note)}><span aria-hidden="true">{note.status === "anchored" ? "◆" : "◇"}</span><span className="min-w-0"><strong className="block truncate">{note.title}</strong><span className="line-clamp-2 text-sm text-muted-foreground">{note.status === "anchored" ? "Anchored" : "Unanchored"}: {note.quotedText}</span></span></button></li>)}</ul>
      {data.truncated ? <p role="status" className="text-sm text-muted-foreground">Only the first 100 annotations are shown. All Notes remain available in Story notes.</p> : null}
    </> : <p className="text-sm text-muted-foreground">No quoted annotations linked to this Scene.</p> : null}
    {selected ? <section role="dialog" aria-label={`Annotation: ${selected.title}`} className="grid gap-2 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lift"><div className="flex flex-wrap justify-between gap-2"><h4 className="font-semibold">{selected.title}</h4><Button type="button" size="sm" variant="ghost" onClick={close}>Close</Button></div><p className="text-sm">{resolved.find(item => item.id === selected.id)?.status === "anchored" ? "Exact quote found once in the current manuscript." : "Unanchored: the quote is missing, ambiguous or outside matching limits."}</p><blockquote className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded border-l-4 bg-muted p-2 text-sm [overflow-wrap:anywhere]">{selected.quotedText}</blockquote><Link href={routeForNote(novelId, selected.id)} className="w-fit text-primary underline focus-visible:outline focus-visible:outline-2">Open full Note</Link></section> : null}
  </section>;
}
