"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { noteLinkTypes, readNoteInput, type NoteLinkInput } from "@/lib/note-contract";
import type { Note } from "@/lib/studio-domain";
import type { NoteCaptureDraft } from "@/lib/note-capture";
import { useNoteDraft } from "./use-note-draft";
import { noteDraftConflict } from "@/lib/note-draft";
import type { NoteDraftFields } from "@/lib/note-draft";

export type NoteTargetOption = NoteLinkInput & { title: string; novelId: string; archived?: boolean };

export function NoteFormDialog({ novelId, note = null, capture, options, availableTags = [], onClose, onSaved }: {
  novelId: string; note?: Note | null; options: NoteTargetOption[];
  availableTags?: string[];
  capture?: NoteCaptureDraft | null;
  onClose: () => void; onSaved: () => Promise<void>;
}) {
  // Capture the opening revision and draft; snapshot refreshes must not overwrite user input.
  const [context] = React.useState(() => ({ novelId, id: note?.id, revision: note?.revision, valid: (!note || note.novelId === novelId) && (!capture || capture.novelId === novelId) }));
  const [invoker] = React.useState(() => typeof document === "undefined" ? null : document.activeElement);
  const [title, setTitle] = React.useState(note?.title ?? capture?.title ?? "");
  const [content, setContent] = React.useState(note?.content ?? capture?.content ?? "");
  const [quotedText, setQuotedText] = React.useState(note?.quotedText ?? capture?.quotedText ?? "");
  const [tags, setTags] = React.useState<string[]>(() => [...(note?.tags ?? [])]);
  const [newTag, setNewTag] = React.useState("");
  const [workflowStatus, setWorkflowStatus] = React.useState<NoteDraftFields["workflowStatus"]>(() => ["open", "in_progress", "done"].includes(note?.workflowStatus ?? "") ? note!.workflowStatus as NoteDraftFields["workflowStatus"] : "informational");
  const [initialWorkflow] = React.useState(workflowStatus);
  const [links, setLinks] = React.useState<NoteLinkInput[]>(() => note?.links?.map(({ type, id }) => ({ type, id })) ?? (capture ? [{ type: capture.target.type, id: capture.target.id }] : []));
  const [initialLinks] = React.useState(note?.links ?? (capture ? [{ type: capture.target.type, id: capture.target.id, title: capture.target.title, archived: false }] : []));
  const [targetType, setTargetType] = React.useState<NoteLinkInput["type"]>("Character");
  const [search, setSearch] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false), [committed, setCommitted] = React.useState(false);
  const busy = React.useRef(false), titleRef = React.useRef<HTMLInputElement>(null), attachRef = React.useRef<HTMLDetailsElement>(null);
  const formId = React.useId();
  const [baseline] = React.useState(() => note ? { title: note.title, content: note.content, quotedText: note.quotedText ?? "", tags: [...note.tags], newTag: "", links: note.links?.map(({ type, id }) => ({ type, id })) ?? [] } : { title: "", content: "", quotedText: "", tags: [], newTag: "", links: [] });
  const draft = useNoteDraft({ novelId: context.novelId, noteId: context.id ?? null, revision: context.revision ?? null,
    fields: { title, content, quotedText, tags, newTag, links, workflowStatus }, baseline: { ...baseline, workflowStatus: initialWorkflow },
    onRestore: fields => { setTitle(fields.title); setContent(fields.content); setQuotedText(fields.quotedText); setTags(fields.tags); setNewTag(fields.newTag); setLinks(fields.links); setWorkflowStatus(fields.workflowStatus ?? initialWorkflow); }
  });
  const recovery = draft.candidates[0];
  const hasRecovery = Boolean(recovery);
  const recoveryRef = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    if (draft.ready) (hasRecovery ? recoveryRef.current : titleRef.current)?.focus({ preventScroll: true });
  }, [draft.ready, hasRecovery]);
  const available = options.filter(option => option.novelId === context.novelId);
  // Preserve historical selections even when an archived target is absent from active selectors.
  const targets = [...available, ...initialLinks.filter(link => !available.some(option => option.type === link.type && option.id === link.id)).map(link => ({ ...link, novelId: context.novelId }))];
  const selected = (target: NoteLinkInput) => links.some(link => link.type === target.type && link.id === target.id);
  const close = () => { if (!busy.current && draft.persist()) onClose(); };
  const errorFor = (field: string) => errors[field] ? <p id={`${formId}-${field}-error`} role="alert" className="text-sm text-destructive">{errors[field]}</p> : null;
  const save = async () => {
    if (busy.current || (!committed && (draft.conflict || recovery || !draft.ready))) return;
    busy.current = true;
    try {
      if (!committed) {
        const next: Record<string, string> = {};
        const tagValues = [...tags, ...(newTag.trim() ? [newTag.trim()] : [])];
        if (!title.trim() || title.trim().length > 200) next.title = "Enter a title (1–200 characters).";
        if (content.length > 100000) next.content = "Content must be at most 100,000 characters.";
        if (quotedText.length > 100000) next.quotedText = "Quoted context must be at most 100,000 characters.";
        if (tagValues.length > 50 || tagValues.some(tag => tag.length > 50)) next.tags = "Use at most 50 tags, up to 50 characters each.";
        if (links.length > 500 || links.some(link => !targets.some(target => target.type === link.type && target.id === link.id))) next.links = "Review the selected story targets (maximum 500).";
        if (!context.valid || (context.id && !Number.isInteger(context.revision))) next.general = "Reload this note before editing.";
        setErrors(next);
        if (Object.keys(next).length) {
          if (next.links && attachRef.current) attachRef.current.open = true;
          document.getElementById(`${formId}-${Object.keys(next)[0]}`)?.focus();
          return;
        }
        const input = readNoteInput({ title: title.trim(), content, quotedText, tags: tagValues, links, workflowStatus }, context.novelId);
        if (!input) { setErrors({ links: "Invalid story targets. Review the attachments." }); if (attachRef.current) attachRef.current.open = true; return; }
        setPending(true);
        draft.markAttempt();
        const response = await fetch(`/api/notes${context.id ? `/${encodeURIComponent(context.id)}` : ""}?novelId=${encodeURIComponent(context.novelId)}`, {
          method: context.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, ...(context.id ? { revision: context.revision } : {}) })
        });
        if (!response.ok) {
          if (response.status === 409 || response.status === 400) {
            setErrors({ links: "The note or story targets changed or are invalid. Review attachments; if the note changed, cancel and reopen it. Your draft is retained here." });
            if (attachRef.current) attachRef.current.open = true;
            return;
          }
          throw new Error("Could not save note. Your draft is retained; please retry.");
        }
        setCommitted(true);
        if (!draft.markSaved()) { setErrors({ general: "Note saved, but its local draft could not be removed. Retry cleanup without saving again." }); return; }
      }
      if (committed && !draft.markSaved()) { setErrors({ general: "Note is saved. Local draft cleanup is still unavailable; retry or discard it when reopening." }); return; }
      setPending(true);
      await onSaved(); onClose();
    } catch (error) { setErrors({ general: error instanceof Error ? error.message : "Could not save note. Please retry." }); }
    finally { busy.current = false; setPending(false); }
  };
  return <Dialog open modal onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="relationship-dialog" closeDisabled={pending}
      onOpenAutoFocus={event => { event.preventDefault(); titleRef.current?.focus({ preventScroll: true }); }}
      onCloseAutoFocus={event => { event.preventDefault(); if (invoker instanceof HTMLElement && invoker.isConnected) {
        if (invoker instanceof HTMLButtonElement && invoker.disabled) invoker.closest('[role="dialog"]')?.querySelector<HTMLElement>('[tabindex="-1"]')?.focus();
        else invoker.focus({ preventScroll: true });
      } }}
      onEscapeKeyDown={event => { if (busy.current) event.preventDefault(); }}
      onInteractOutside={event => event.preventDefault()}>
      <DialogHeader className="relationship-dialog-header"><DialogTitle>{context.id ? "Edit Note" : "Add Note"}</DialogTitle><DialogDescription>Capture a note and optionally attach it to your story.</DialogDescription></DialogHeader>
      <form id={formId} noValidate className="relationship-dialog-body" aria-busy={pending} onSubmit={event => { event.preventDefault(); void save(); }}>
        {errorFor("general")}
        <p role="status" className="text-sm text-muted-foreground">{committed ? "Saved to SQLite" : recovery ? "Local draft available" : draft.dirty ? draft.savedAt ? "Unsaved changes · Local draft saved" : "Unsaved changes · Saving local draft…" : "No unsaved changes"}</p>
        {draft.message ? <p role="alert" className="text-sm text-destructive">{draft.message}</p> : null}
        {recovery ? <section aria-label="Draft recovery" className="grid gap-2 rounded border p-3">
          <h3 ref={recoveryRef} tabIndex={-1} className="font-semibold">Recover local draft?</h3><p className="text-sm">Saved locally {new Date(recovery.savedAt).toLocaleString()}. Nothing will replace this form until you choose Recover.</p>
          {noteDraftConflict(recovery, context.revision ?? null) ? <p role="alert">SQLite has a different revision. Recovery requires review before overwriting the current version.</p> : null}
          {recovery.attemptedSave ? <p role="alert">A previous Save was attempted. Check Story Notes first: it may already have succeeded.</p> : null}
          <p className="line-clamp-2 text-sm [overflow-wrap:anywhere]">{recovery.fields.title || "Untitled draft"}</p>
          <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => draft.recover(recovery)}>Recover draft</Button><Button type="button" variant="outline" onClick={() => draft.discardCandidate(recovery)}>Discard stored draft</Button><Button type="button" variant="outline" onClick={draft.continueCurrent}>Continue without recovery</Button></div>
          {draft.candidates.length > 1 ? <p className="text-sm">{draft.candidates.length} saved sessions. Discarding this draft offers the next one.</p> : null}
        </section> : null}
        {draft.conflict ? <section aria-label="Draft revision conflict" className="grid gap-2 rounded border p-3"><p role="alert">Recovered draft is based on another revision. Save is blocked until you review the current SQLite content below. You may discard the draft to keep SQLite unchanged.</p><details><summary className="cursor-pointer">Current SQLite version</summary><h3 className="font-semibold [overflow-wrap:anywhere]">{note?.title}</h3><p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{note?.content}</p></details><Button type="button" variant="outline" onClick={draft.acceptCurrentRevision}>I reviewed the current version; allow replacing it</Button></section> : null}
        {!recovery && draft.dirty && !committed ? <div className="grid gap-2">{draft.discarding ? <><p>Discard these unsaved changes and their local draft?</p><div className="flex flex-wrap gap-2"><Button type="button" variant="destructive" disabled={pending} onClick={draft.discard}>Confirm discard draft</Button><Button type="button" variant="outline" disabled={pending} onClick={() => draft.setDiscarding(false)}>Keep writing</Button></div></> : <Button type="button" variant="outline" disabled={pending} onClick={() => draft.setDiscarding(true)}>Discard draft…</Button>}</div> : null}
        {pending ? <p role="status">{committed ? "Refreshing notes…" : "Saving note…"}</p> : null}
        <fieldset disabled={pending || committed || Boolean(recovery) || !draft.ready} className="grid min-w-0 gap-4">
          <label className="flex items-center gap-2 text-sm"><input id={`${formId}-workflow`} type="checkbox" checked={workflowStatus !== "informational"} onChange={event => setWorkflowStatus(event.target.checked ? "open" : "informational")} />Track as actionable</label>
          {workflowStatus !== "informational" ? <p className="text-sm text-muted-foreground">{workflowStatus === "done" ? "Resolved" : "Open"} · Resolve or reopen from note actions.</p> : null}
          {capture ? <p className="text-sm text-muted-foreground">From {capture.target.type}: {capture.target.title}. Story attachments can be changed below.</p> : null}
          {quotedText ? <div className="grid gap-2"><Label>Quoted Scene context</Label><blockquote className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded border-l-4 bg-muted p-3 text-sm [overflow-wrap:anywhere]">{quotedText}</blockquote>{errorFor("quotedText")}</div> : null}
          <div className="grid gap-2"><Label htmlFor={`${formId}-title`}>Title (required)</Label><Input ref={titleRef} id={`${formId}-title`} required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? `${formId}-title-error` : undefined} />{errorFor("title")}</div>
          <div className="grid gap-2"><Label htmlFor={`${formId}-content`}>Content</Label><Textarea id={`${formId}-content`} rows={5} maxLength={100000} value={content} onChange={event => setContent(event.target.value)} aria-invalid={Boolean(errors.content)} aria-describedby={errors.content ? `${formId}-content-error` : undefined} />{errorFor("content")}</div>
          <div className="grid min-w-0 gap-2"><Label htmlFor={`${formId}-tags`}>Tags (optional)</Label>
            <div className="flex min-w-0 gap-2"><Input className="min-w-0" id={`${formId}-tags`} list={`${formId}-known-tags`} placeholder="Choose or create a tag" value={newTag} maxLength={50} onChange={event => setNewTag(event.target.value)} aria-invalid={Boolean(errors.tags)} aria-describedby={errors.tags ? `${formId}-tags-error` : undefined} /><Button type="button" variant="outline" disabled={!newTag.trim() || tags.length >= 50} onClick={() => { setTags(current => [...current.filter(tag => tag.toLocaleLowerCase() !== newTag.trim().toLocaleLowerCase()), newTag.trim()]); setNewTag(""); }}>Add tag</Button></div>
            <datalist id={`${formId}-known-tags`}>{availableTags.map(tag => <option key={tag} value={tag} />)}</datalist>
            {tags.length ? <ul className="grid gap-1">{tags.map((tag, index) => <li key={index} className="flex min-w-0 items-center justify-between gap-2 text-sm"><span className="[overflow-wrap:anywhere]">{tag}</span><Button type="button" variant="ghost" onClick={() => setTags(current => current.filter((_, position) => position !== index))} aria-label={`Remove tag ${tag}`}>Remove</Button></li>)}</ul> : null}
            {errorFor("tags")}</div>
          <details ref={attachRef} className="min-w-0 rounded border p-3">
            <summary className="cursor-pointer font-medium focus-visible:ring-2 focus-visible:ring-ring">Attach to story ({links.length})</summary>
            <div className="mt-3 grid min-w-0 gap-3">
              {errorFor("links")}
              {links.length ? <ul className="grid gap-2">{links.map(link => <li key={`${link.type}:${link.id}`} className="flex min-w-0 items-center justify-between gap-2 text-sm"><span className="[overflow-wrap:anywhere]">{link.type}: {targets.find(target => target.type === link.type && target.id === link.id)?.title ?? "Unavailable target"}</span><Button type="button" variant="outline" onClick={() => setLinks(current => current.filter(item => item.type !== link.type || item.id !== link.id))} aria-label={`Remove ${link.type} attachment ${targets.find(target => target.type === link.type && target.id === link.id)?.title ?? "unavailable target"}`}>Remove</Button></li>)}</ul> : <p className="text-sm text-muted-foreground">No story attachments.</p>}
              <Label htmlFor={`${formId}-links`}>Target type</Label><select id={`${formId}-links`} className="h-10 min-w-0 rounded border bg-background px-2" value={targetType} onChange={event => { setTargetType(event.target.value as NoteLinkInput["type"]); setSearch(""); }} aria-invalid={Boolean(errors.links)} aria-describedby={errors.links ? `${formId}-links-error` : undefined}>{noteLinkTypes.map(type => <option key={type} value={type}>{type === "TimelineEvent" ? "Timeline Event" : type}</option>)}</select>
              <Label htmlFor={`${formId}-search`}>Find targets by name</Label><Input id={`${formId}-search`} value={search} onChange={event => setSearch(event.target.value)} />
              <fieldset className="grid min-w-0 gap-2"><legend className="mb-2 text-sm">Select {targetType === "TimelineEvent" ? "Timeline Events" : targetType} targets</legend>
                {targets.filter(target => target.type === targetType && target.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(target => <label key={`${target.type}:${target.id}`} className="flex items-start gap-2 text-sm [overflow-wrap:anywhere]"><input type="checkbox" checked={selected(target)} onChange={event => setLinks(current => event.target.checked ? [...current, { type: target.type, id: target.id }] : current.filter(link => link.type !== target.type || link.id !== target.id))} />{target.title}{target.archived ? " (archived)" : ""}</label>)}
                {!targets.some(target => target.type === targetType && target.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())) ? <p className="text-sm text-muted-foreground">No available targets match.</p> : null}
              </fieldset>
            </div>
          </details>
        </fieldset>
      </form>
      <DialogFooter className="relationship-dialog-footer"><Button type="button" variant="outline" disabled={pending} onClick={close}>Cancel</Button><Button type="submit" form={formId} disabled={pending || (!committed && (draft.conflict || Boolean(recovery) || !draft.ready))}>{pending ? "Saving…" : committed ? "Retry cleanup / refresh" : "Save Note"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
