"use client";
import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import type { Note } from "@/lib/studio-domain";
import { noteAttachmentHref, readNoteDetail } from "@/lib/note-detail";

export function NoteDetailDialog({ novelId, noteId, version, onClose, onDeleted, onEdit, onChanged, returnFocusRef }: {
  novelId: string; noteId: string; version: number; onClose: () => void; onEdit: (note: Note) => void; onChanged: () => void;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
  onDeleted?: () => void;
}) {
  const [note, setNote] = React.useState<Note | null>(null), [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(""), [stale, setStale] = React.useState(false), [reload, setReload] = React.useState(0);
  const [pending, setPending] = React.useState(false), [confirmDelete, setConfirmDelete] = React.useState(false);
  const busy = React.useRef(false), alive = React.useRef(true), titleRef = React.useRef<HTMLHeadingElement>(null), cancelRef = React.useRef<HTMLButtonElement>(null), deleteRef = React.useRef<HTMLButtonElement>(null);
  const refreshRef = React.useRef<HTMLButtonElement>(null);
  const [invoker] = React.useState(() => typeof document === "undefined" ? null : document.activeElement);
  const url = `/api/notes/${encodeURIComponent(noteId)}?novelId=${encodeURIComponent(novelId)}`;
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  React.useEffect(() => {
    const abort = new AbortController(); setLoading(true); setError(""); setConfirmDelete(false);
    void fetch(url, { signal: abort.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error();
      const next = readNoteDetail(await response.json(), novelId, noteId);
      if (!next) throw new Error();
      if (!abort.signal.aborted) { setNote(next); setStale(false); }
    }).catch(() => { if (!abort.signal.aborted) { setError("Could not load this note. Close to return to the catalog, or retry."); setStale(true); } })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [url, novelId, noteId, version, reload]);
  React.useEffect(() => { if (confirmDelete) cancelRef.current?.focus(); else deleteRef.current?.focus(); }, [confirmDelete]);
  React.useEffect(() => { if (error && !pending && !loading) refreshRef.current?.focus(); }, [error, pending, loading]);
  const close = () => { if (!busy.current) onClose(); };
  const mutate = async (fields: object, deleting = false) => {
    if (!note || loading || stale || busy.current || (deleting && !confirmDelete)) return;
    busy.current = true; setPending(true); setError("");
    try {
      const response = await fetch(url, { method: deleting ? "DELETE" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: note.revision, ...fields }) });
      if (!response.ok) throw new Error(response.status === 409 ? "This note changed. Refresh and review it before trying again." : "Could not update this note. Refresh to verify its current state before retrying.");
      if (!alive.current) return;
      if (!deleting) {
        const next = readNoteDetail(await response.json(), novelId, noteId);
        if (!next) throw new Error("Refresh to verify the saved note.");
        if (!alive.current) return;
        setNote(next);
      }
      onChanged();
      if (deleting) (onDeleted ?? onClose)();
    } catch (caught) {
      if (alive.current) { setError(caught instanceof Error ? caught.message : "Could not update note."); setStale(true); setConfirmDelete(false); }
    } finally { busy.current = false; if (alive.current) setPending(false); }
  };
  const disabled = pending || loading || stale;
  return <Dialog open modal onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="relationship-dialog" closeDisabled={pending}
      onOpenAutoFocus={event => { event.preventDefault(); titleRef.current?.focus(); }}
      onCloseAutoFocus={event => { event.preventDefault(); if (invoker instanceof HTMLElement && invoker.isConnected) invoker.focus(); else returnFocusRef.current?.focus(); }}
      onEscapeKeyDown={event => { if (busy.current) event.preventDefault(); else if (confirmDelete) { event.preventDefault(); setConfirmDelete(false); deleteRef.current?.focus(); } }}
      onInteractOutside={event => event.preventDefault()}>
      <DialogHeader className="relationship-dialog-header"><DialogTitle ref={titleRef} tabIndex={-1}>Note detail</DialogTitle><DialogDescription>Read and manage this note without changing its linked story entities.</DialogDescription></DialogHeader>
      <div className="relationship-dialog-body" aria-busy={pending || loading}>
        {loading ? <p role="status">Loading note…</p> : null}
        {pending ? <p role="status">Saving changes…</p> : null}
        {error ? <div role="alert"><p>{error}</p><Button ref={refreshRef} variant="outline" disabled={pending || loading} onClick={() => setReload(value => value + 1)}>Refresh note</Button></div> : null}
        {note ? <>
          <h2 className="text-xl font-semibold [overflow-wrap:anywhere]">{note.title}</h2>
          <p className="text-sm text-muted-foreground">{note.pinned ? "Pinned · " : ""}{note.workflowStatus === "done" ? "Resolved" : note.workflowStatus === "open" || note.workflowStatus === "in_progress" ? "Open" : "Informational"}{note.archivedAt ? " · Archived" : ""}</p>
          <dl className="grid gap-1 text-sm"><dt className="font-medium">Updated</dt><dd>{new Date(note.updatedAt).toLocaleString()}</dd>{note.createdAt ? <><dt className="font-medium">Created</dt><dd>{new Date(note.createdAt).toLocaleString()}</dd></> : null}</dl>
          <div role="group" aria-label="Note actions" className="flex flex-wrap gap-2"><Button variant="outline" disabled={disabled || confirmDelete} onClick={() => void mutate({ pinned: !note.pinned })}>{note.pinned ? "Unpin" : "Pin"}</Button>{["open", "in_progress", "done"].includes(note.workflowStatus ?? "") ? <Button variant="outline" disabled={disabled || confirmDelete} onClick={() => void mutate({ workflowStatus: note.workflowStatus === "done" ? "open" : "done" })}>{note.workflowStatus === "done" ? "Reopen" : "Resolve"}</Button> : null}<Button variant="outline" disabled={disabled || confirmDelete} onClick={() => void mutate({ archivedAt: note.archivedAt ? null : new Date().toISOString() })}>{note.archivedAt ? "Restore" : "Archive"}</Button><Button ref={deleteRef} variant="destructive" disabled={disabled || confirmDelete} onClick={() => setConfirmDelete(true)}>Delete…</Button></div>
          {confirmDelete ? <section role="group" aria-label="Delete note confirmation" className="rounded border border-destructive p-3"><h3 className="font-semibold">Permanently delete this note?</h3><p>This removes its content, {note.tags.length} tag associations and {note.links?.length ?? 0} story attachments. Linked Characters, Scenes and all other story entities remain intact. Shared tags are kept. This cannot be undone.</p></section> : null}
          <section aria-label="Note content" className="whitespace-pre-wrap [overflow-wrap:anywhere]">{note.content || <p className="text-muted-foreground">No content yet.</p>}</section>
          {note.quotedText ? <section aria-label="Quoted Scene context"><h3 className="font-medium">Quoted Scene context</h3><blockquote className="mt-1 max-h-52 overflow-y-auto whitespace-pre-wrap rounded border-l-4 bg-muted p-3 [overflow-wrap:anywhere]">{note.quotedText}</blockquote></section> : null}
          <section aria-label="Tags"><h3 className="font-medium">Tags</h3>{note.tags.length ? <ul className="flex flex-wrap gap-2">{note.tags.map(tag => <li key={tag} className="rounded border px-2 py-1 text-sm [overflow-wrap:anywhere]">{tag}</li>)}</ul> : <p className="text-sm text-muted-foreground">Untagged</p>}</section>
          <section aria-label="Story attachments"><h3 className="font-medium">Story attachments</h3>{note.links?.length ? <ul className="grid gap-2">{note.links.map(link => {
            const href = noteAttachmentHref(novelId, link);
            return <li key={`${link.type}:${link.id}`} className="text-sm [overflow-wrap:anywhere]">{href && !pending ? <Link href={href} className="text-primary underline focus-visible:outline focus-visible:outline-2">{link.type}: {link.title}</Link> : <span>{link.type}: {link.title}{link.archived ? " (archived; unavailable for navigation)" : ""}</span>}</li>;
          })}</ul> : <p className="text-sm text-muted-foreground">No story attachments.</p>}</section>
        </> : null}
      </div>
      <DialogFooter className="relationship-dialog-footer flex-wrap">
        {confirmDelete ? <><Button ref={cancelRef} variant="outline" disabled={pending} onClick={() => { setConfirmDelete(false); deleteRef.current?.focus(); }}>Cancel deletion</Button><Button variant="destructive" disabled={disabled} onClick={() => void mutate({ confirmed: true }, true)}>Confirm delete note</Button></> : <>
          <Button variant="outline" disabled={pending} onClick={close}>Close</Button>
          {note ? <Button disabled={disabled} onClick={() => onEdit(note)}>Edit</Button> : null}
        </>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
