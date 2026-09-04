"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { noteLinkTypes } from "@/lib/note-contract";
import { defaultNoteFilters, encodePrivateNoteSearch, noteFilterParams, parseNoteFilters, type NoteCatalogFilter, type NoteCatalogResult, type NoteCatalogItem } from "@/lib/note-catalog";
import { noteCatalogHref } from "@/lib/note-navigation";
import type { NoteTargetOption } from "./note-form-dialog";
import type { Note } from "@/lib/studio-domain";
import { NoteDetailDialog } from "./note-detail-dialog";

export function NotesEmptyState({ total, onAdd, onClear }: { total: number; onAdd: () => void; onClear: () => void }) {
  return <section className="rounded-lg border p-6 text-center"><h2 className="text-lg font-semibold">{total === 0 ? "No notes yet" : "No notes match these filters"}</h2>
    <p className="my-3 text-sm text-muted-foreground">{total === 0 ? "Capture ideas, continuity details and questions, then organize them with tags and story attachments." : "Try another search or clear your filters."}</p>
    <Button onClick={total === 0 ? onAdd : onClear}>{total === 0 ? "Add your first note" : "Clear filters"}</Button></section>;
}

export function NotesCatalog({ novelId, selectedNoteId, version, options, onAddNote, onEditNote, onTagsLoaded }: {
  novelId: string; version: number; options: NoteTargetOption[]; onAddNote: () => void; onEditNote: (note: Note) => void;
  onTagsLoaded: (tags: string[]) => void;
  selectedNoteId?: string;
}) {
  const router = useRouter(), searchParams = useSearchParams();
  const publicQuery = noteFilterParams({ ...parseNoteFilters(new URLSearchParams(searchParams.toString())), search: "" }).toString();
  const [filter, setFilter] = React.useState<NoteCatalogFilter>(() => parseNoteFilters(new URLSearchParams(publicQuery)));
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [result, setResult] = React.useState<NoteCatalogResult | null>(null), [loading, setLoading] = React.useState(true), [error, setError] = React.useState("");
  const [reload, setReload] = React.useState(0), [actionError, setActionError] = React.useState("");
  const [pending, setPending] = React.useState(false), busy = React.useRef(false), mounted = React.useRef(true);
  const addButtonRef = React.useRef<HTMLButtonElement>(null);
  const [tagId, setTagId] = React.useState(""), [tagName, setTagName] = React.useState(""), [confirmDelete, setConfirmDelete] = React.useState(false);
  const [tagMessage, setTagMessage] = React.useState("");
  const uid = React.useId();
  React.useEffect(() => { setFilter(current => ({ ...parseNoteFilters(new URLSearchParams(publicQuery)), search: current.search })); }, [publicQuery]);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  React.useEffect(() => { const timer = setTimeout(() => setDebouncedSearch(filter.search), 300); return () => clearTimeout(timer); }, [filter.search]);
  const query = noteFilterParams({ ...filter, search: "" }).toString();
  React.useEffect(() => {
    const abort = new AbortController(); setLoading(true); setError("");
    void fetch(`/api/notes?novelId=${encodeURIComponent(novelId)}${query ? `&${query}` : ""}`, { signal: abort.signal, cache: "no-store", headers: { "X-Note-Search": encodePrivateNoteSearch(debouncedSearch) } })
      .then(async response => { if (!response.ok) throw new Error("Could not load notes. Retry when ready."); return response.json() as Promise<NoteCatalogResult>; })
      .then(data => { if (!abort.signal.aborted) { setResult(data); onTagsLoaded(data.tags.map(tag => tag.name)); } })
      .catch(() => { if (!abort.signal.aborted) setError("Could not load notes. Retry when ready."); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [novelId, query, debouncedSearch, reload, version, onTagsLoaded]);
  const change = (values: Partial<NoteCatalogFilter>) => { setFilter(current => ({ ...current, ...values, page: 1 })); };
  const clear = () => { setFilter({ ...defaultNoteFilters }); setDebouncedSearch(""); router.replace(noteCatalogHref(novelId, defaultNoteFilters, selectedNoteId)!, { scroll: false }); };
  const updateNote = async (note: NoteCatalogItem, fields: object) => {
    if (busy.current) return; busy.current = true; setPending(true); setActionError("");
    try {
      const response = await fetch(`/api/notes/${encodeURIComponent(note.id)}?novelId=${encodeURIComponent(novelId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: note.revision, ...fields }) });
      if (!response.ok) throw new Error();
      if (mounted.current) setReload(value => value + 1);
    } catch { if (mounted.current) setActionError("Could not update this note. Refresh the catalog and retry."); }
    finally { busy.current = false; if (mounted.current) setPending(false); }
  };
  const manageTag = async (method: "POST" | "PATCH" | "DELETE") => {
    if (busy.current) return; busy.current = true; setPending(true); setTagMessage("");
    const tag = result?.tags.find(item => item.id === tagId);
    try {
      const response = await fetch(`/api/notes/tags?novelId=${encodeURIComponent(novelId)}`, { method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tagName, ...(method !== "POST" ? { id: tagId, expectedName: tag?.name } : {}), ...(method === "DELETE" ? { confirmed: true } : {}) }) });
      if (!response.ok) { const body = await response.json(); throw new Error(typeof body.error === "string" ? body.error : "Could not update tag."); }
      if (mounted.current) { setTagId(""); setTagName(""); setConfirmDelete(false); setTagMessage("Tags updated."); setReload(value => value + 1); }
    } catch (caught) { if (mounted.current) setTagMessage(caught instanceof Error ? caught.message : "Could not update tag."); }
    finally { busy.current = false; if (mounted.current) setPending(false); }
  };
  const select = (label: string, name: string, value: string, choices: { value: string; label: string }[], onChange: (value: string) => void) => <div className="grid min-w-0 gap-1"><Label htmlFor={`${uid}-${name}`}>{label}</Label><select id={`${uid}-${name}`} className="h-10 w-full min-w-0 rounded border bg-background px-2" value={value} onChange={event => onChange(event.target.value)}>{choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></div>;
  return <div className="grid min-w-0 gap-4">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Story notes</h1><Button ref={addButtonRef} onClick={onAddNote}>Add note</Button></header>
    <details className="note-filters min-w-0 rounded-lg border p-4"><summary className="cursor-pointer font-medium focus-visible:outline focus-visible:outline-2 md:hidden">Filters</summary><section aria-label="Note filters" className="note-filter-fields mt-3 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3 md:mt-0">
      <div className="grid min-w-0 gap-1"><Label htmlFor={`${uid}-search`}>Search title and content</Label><Input id={`${uid}-search`} maxLength={200} value={filter.search} onChange={event => change({ search: event.target.value })} /></div>
      {select("Tag", "tag", filter.tag, [{ value: "", label: "All tags" }, ...(result?.hasUntagged ? [{ value: "untagged", label: "Untagged" }] : []), ...(result?.tags ?? []).map(tag => ({ value: tag.id, label: tag.name }))], tag => change({ tag }))}
      {select("Status", "status", filter.status, [{ value: "all", label: "All statuses" }, { value: "open", label: "Open" }, { value: "resolved", label: "Resolved" }], status => change({ status: status as NoteCatalogFilter["status"] }))}
      {select("Archive", "archive", filter.archived, [{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }, { value: "all", label: "All notes" }], archived => change({ archived: archived as NoteCatalogFilter["archived"] }))}
      {select("Entity type", "entityType", filter.entityType, [{ value: "", label: "All entity types" }, ...noteLinkTypes.map(type => ({ value: type, label: type === "TimelineEvent" ? "Timeline Event" : type }))], type => change({ entityType: type as NoteCatalogFilter["entityType"], entity: "" }))}
      {filter.entityType ? select("Entity", "entity", filter.entity, [{ value: "", label: "All of this type" }, ...(result?.entityType === filter.entityType ? result.entities : options.filter(option => option.novelId === novelId && option.type === filter.entityType)).map(option => ({ value: option.id, label: option.title }))], entity => change({ entity })) : null}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filter.pinned} onChange={event => change({ pinned: event.target.checked })} />Pinned only</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filter.pinnedFirst} onChange={event => change({ pinnedFirst: event.target.checked })} />Pinned first (otherwise last updated)</label>
      <Button variant="outline" onClick={clear}>Clear filters</Button>
    </section></details>
    <details className="min-w-0 rounded-lg border p-3"><summary className="cursor-pointer font-medium focus-visible:ring-2 focus-visible:ring-ring">Manage reusable tags</summary>
      <fieldset disabled={pending || loading} className="mt-3 grid min-w-0 gap-3">
        {select("Existing tag", "manageTag", tagId, [{ value: "", label: "Create new tag" }, ...(result?.tags ?? []).map(tag => ({ value: tag.id, label: tag.name }))], id => { setTagId(id); setTagName(result?.tags.find(tag => tag.id === id)?.name ?? ""); setConfirmDelete(false); setTagMessage(""); })}
        <Label htmlFor={`${uid}-tagName`}>Tag name</Label><Input id={`${uid}-tagName`} maxLength={50} value={tagName} onChange={event => { setTagName(event.target.value); setConfirmDelete(false); }} />
        <div className="flex flex-wrap gap-2"><Button disabled={!tagName.trim()} onClick={() => void manageTag(tagId ? "PATCH" : "POST")}>{tagId ? "Rename tag" : "Create tag"}</Button>
          {tagId ? <Button variant="outline" onClick={() => setConfirmDelete(true)}>Delete tag…</Button> : null}</div>
        {confirmDelete ? <div className="rounded border p-3"><p>Delete this tag from every note in this novel? Notes and their content will remain intact.</p><div className="mt-2 flex flex-wrap gap-2"><Button variant="destructive" onClick={() => void manageTag("DELETE")}>Confirm delete tag</Button><Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button></div></div> : null}
      </fieldset>
      {tagMessage ? <p role="status" className="mt-2 text-sm">{tagMessage}</p> : null}
    </details>
    {actionError ? <p role="alert">{actionError} <Button variant="outline" onClick={() => setReload(value => value + 1)}>Refresh</Button></p> : null}
    {error ? <div role="alert">{error} <Button onClick={() => setReload(value => value + 1)}>Retry</Button></div> : loading || filter.search !== debouncedSearch ? <p role="status">Loading notes…</p> : result ? <>
      {!result.items.length ? <NotesEmptyState total={result.total} onAdd={onAddNote} onClear={clear} /> : <>
        <p role="status" className="text-sm text-muted-foreground">{result.matched} notes · Page {result.page} of {result.pages}</p>
        <ul className="grid min-w-0 gap-3 lg:grid-cols-2">{result.items.map(note => <li key={note.id} className="grid min-w-0 content-start gap-2 rounded-lg border p-4 [overflow-wrap:anywhere]">
          <h2 className="line-clamp-2 font-semibold">{note.title}</h2><p className="text-sm text-muted-foreground">{note.pinned ? "Pinned · " : ""}{note.workflowStatus === "done" ? "Resolved" : note.workflowStatus === "open" || note.workflowStatus === "in_progress" ? "Open" : "Informational"}{note.archivedAt ? " · Archived" : ""} · Updated {new Date(note.updatedAt).toLocaleString()}</p>
          <p className="line-clamp-3 whitespace-pre-wrap text-sm">{note.snippet}{note.snippet.length >= 240 ? "…" : ""}</p>
          <div className="flex flex-wrap gap-2">{note.tagSummaries.slice(0, 3).map(tag => <Button key={tag.id} variant="outline" className="h-auto max-w-full min-w-0 text-left" onClick={() => change({ tag: tag.id })}><span className="truncate">{tag.name}</span></Button>)}{note.tags.length > 3 ? <span className="text-sm">+{note.tags.length - 3} tags</span> : null}{!note.tags.length ? <span className="text-sm text-muted-foreground">Untagged</span> : null}</div>
          {note.links.length ? <p className="line-clamp-2 text-sm text-muted-foreground">{note.links.slice(0, 3).map(link => `${link.type}: ${link.title}${link.archived ? " (archived)" : ""}`).join(" · ")}</p> : null}
          {note.links.length > 3 ? <span className="text-sm">+{note.links.length - 3} attachments</span> : null}
          <div className="flex flex-wrap gap-2"><Link href={noteCatalogHref(novelId, filter, note.id)!} scroll={false} aria-current={selectedNoteId === note.id ? "page" : undefined} aria-label={`Open note: ${note.title}`} className="rounded-md border px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2">Open</Link><Button variant="outline" disabled={pending || loading} onClick={() => void updateNote(note, { pinned: !note.pinned })}>{note.pinned ? "Unpin" : "Pin"}</Button>{["open", "in_progress", "done"].includes(note.workflowStatus ?? "") ? <Button variant="outline" disabled={pending || loading} onClick={() => void updateNote(note, { workflowStatus: note.workflowStatus === "done" ? "open" : "done" })}>{note.workflowStatus === "done" ? "Reopen" : "Resolve"}</Button> : null}</div>
        </li>)}</ul>
        <nav aria-label="Notes pages" className="flex flex-wrap gap-2"><Button variant="outline" disabled={result.page <= 1} onClick={() => setFilter(current => ({ ...current, page: result.page - 1 }))}>Previous</Button><Button variant="outline" disabled={result.page >= result.pages} onClick={() => setFilter(current => ({ ...current, page: result.page + 1 }))}>Next</Button></nav>
      </>}
    </> : null}
    {selectedNoteId ? <NoteDetailDialog key={`${novelId}:${selectedNoteId}`} novelId={novelId} noteId={selectedNoteId} version={version} returnFocusRef={addButtonRef} onClose={() => router.push(noteCatalogHref(novelId, filter)!, { scroll: false })} onDeleted={() => router.replace(noteCatalogHref(novelId, filter)!, { scroll: false })} onEdit={onEditNote} onChanged={() => setReload(value => value + 1)} /> : null}
  </div>;
}
