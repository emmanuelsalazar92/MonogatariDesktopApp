"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { TimelinePositionFields, type TimelinePositionForm } from "./timeline-position-fields";
import { readTimelineEvent, createEventSaveLock } from "@/lib/timeline-event";
import type { RelationshipSinceOption } from "@/lib/relationship-since";
import type { TimelineEvent } from "@/lib/studio-domain";

type EventForm = TimelinePositionForm & { title: string; description: string; isSpoiler: boolean; locationIds: string[]; characterIds: string[] };
export function TimelineEventDialog({ novelId, event = null, options, characters, places, onClose, onSaved }: {
  novelId: string; event?: TimelineEvent | null; options: RelationshipSinceOption[];
  characters: { id: string; novelId: string; name: string }[]; places: { id: string; novelId: string; name: string }[];
  onClose: () => void; onSaved: () => Promise<void>;
}) {
  // Freeze identity and draft at opening; background refreshes never overwrite an edit.
  const [context] = React.useState(() => ({ novelId, id: event?.id, revision: event?.positionRevision }));
  const [invoker] = React.useState(() => typeof document !== "undefined" ? document.activeElement : null);
  const [form, setForm] = React.useState<EventForm>(() => event ? { ...event, characterIds: [...event.characterIds], locationIds: [...event.locationIds] } : {
    title: "", internalDate: "", chronologyKind: "manual", relativeDay: null, relativeMinute: null,
    volumeId: "", chapterId: "", sceneId: "", locationIds: [], characterIds: [], description: "", isSpoiler: false
  });
  const [pending, setPending] = React.useState(false), [committed, setCommitted] = React.useState(false), [error, setError] = React.useState("");
  const lock = React.useMemo(createEventSaveLock, []), titleRef = React.useRef<HTMLInputElement>(null);
  const formId = React.useId();
  const availableCharacters = characters.filter(person => person.novelId === context.novelId);
  const availablePlaces = places.filter(place => place.novelId === context.novelId);
  const close = () => { if (!lock.busy) onClose(); };
  const save = async () => {
    if (!lock.acquire()) return;
    try {
      const parsed = readTimelineEvent(form);
      if (!parsed.ok || (context.id && form.sortIndex === undefined)) { setError(parsed.ok ? "Manual order is required" : parsed.error); return; }
      setPending(true); setError("");
      if (!committed) {
        const response = await fetch(`/api/timeline-events${context.id ? `/${encodeURIComponent(context.id)}` : ""}?novelId=${encodeURIComponent(context.novelId)}`, {
          method: context.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...parsed.data, ...(context.id ? { positionRevision: context.revision } : {}) })
        });
        if (!response.ok) throw new Error(response.status === 409 ? "Event or linked data changed. Cancel and reload before saving." : "Could not save event. Check the fields and linked entities.");
        setCommitted(true);
      }
      await onSaved(); onClose();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save event"); }
    finally { lock.release(); setPending(false); }
  };
  return <Dialog open modal onOpenChange={next => { if (!next) close(); }}>
    {/* Reuse the opaque surface and bounded header/body/footer pattern from Relationships. */}
    <DialogContent className="relationship-dialog" aria-modal="true" closeDisabled={pending}
      onOpenAutoFocus={e => { e.preventDefault(); titleRef.current?.focus({ preventScroll: true }); }}
      onCloseAutoFocus={e => { e.preventDefault(); if (invoker instanceof HTMLElement && invoker.isConnected) invoker.focus(); }}
      onEscapeKeyDown={e => { if (lock.busy) e.preventDefault(); }} onInteractOutside={e => { if (lock.busy) e.preventDefault(); }}>
      <DialogHeader className="relationship-dialog-header"><DialogTitle>{context.id ? "Edit Timeline Event" : "Add Timeline Event"}</DialogTitle><DialogDescription>Keep chronological order separate from where the event is told.</DialogDescription></DialogHeader>
      <form id={formId} className="relationship-dialog-body" aria-busy={pending} onSubmit={e => { e.preventDefault(); void save(); }}>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {pending ? <p role="status" className="text-sm">Saving event…</p> : null}
        <fieldset disabled={pending || committed} className="grid min-w-0 gap-4">
          <div className="grid gap-2"><Label htmlFor={`${formId}-title`}>Event Title</Label><Input ref={titleRef} id={`${formId}-title`} required maxLength={200} value={form.title} onChange={e => setForm(current => ({ ...current, title: e.target.value }))} /></div>
          <TimelinePositionFields value={form} onChange={position => setForm(current => ({ ...current, ...position }))} options={options} requireOrder={Boolean(context.id)} />
          <fieldset className="grid min-w-0 gap-2"><legend className="mb-2 text-sm font-medium">Linked Places (optional)</legend>
            {availablePlaces.length ? <div className="max-h-32 overflow-y-auto overscroll-contain rounded border p-2">{availablePlaces.map(place => <label key={place.id} className="flex items-start gap-2 p-1 text-sm [overflow-wrap:anywhere]">
              <input type="checkbox" checked={form.locationIds.includes(place.id)} onChange={e => setForm(current => ({ ...current, locationIds: e.target.checked ? [...current.locationIds, place.id] : current.locationIds.filter(id => id !== place.id) }))} />{place.name}
            </label>)}</div> : <p className="text-sm text-muted-foreground">No places available.</p>}
            {form.locationIds.some(id => !availablePlaces.some(place => place.id === id)) ? <p role="alert">A linked place is unavailable. Cancel and reload before editing.</p> : null}
          </fieldset>
          <fieldset className="grid min-w-0 gap-2"><legend className="mb-2 text-sm font-medium">Linked Characters (optional)</legend>
            {availableCharacters.length ? <div className="max-h-32 overflow-y-auto overscroll-contain rounded border p-2">{availableCharacters.map(person => <label key={person.id} className="flex items-start gap-2 p-1 text-sm [overflow-wrap:anywhere]">
              <input type="checkbox" checked={form.characterIds.includes(person.id)} onChange={e => setForm(current => ({ ...current, characterIds: e.target.checked ? [...current.characterIds, person.id] : current.characterIds.filter(id => id !== person.id) }))} />{person.name}
            </label>)}</div> : <p className="text-sm text-muted-foreground">No characters available.</p>}
            {form.characterIds.some(id => !availableCharacters.some(person => person.id === id)) ? <p role="alert">A linked character is unavailable. Cancel and reload before editing.</p> : null}
          </fieldset>
          <details className="min-w-0 rounded border p-3"><summary className="cursor-pointer font-medium focus-visible:ring-2 focus-visible:ring-ring">Details (optional)</summary>
            <div className="mt-3 grid gap-3"><Label htmlFor={`${formId}-description`}>Description</Label><Textarea id={`${formId}-description`} maxLength={5000} value={form.description} onChange={e => setForm(current => ({ ...current, description: e.target.value }))} />
              <div className="flex items-center justify-between gap-2"><Label htmlFor={`${formId}-spoiler`}>Spoiler event</Label><Switch id={`${formId}-spoiler`} disabled={pending || committed} checked={form.isSpoiler} onCheckedChange={isSpoiler => setForm(current => ({ ...current, isSpoiler }))} /></div>
            </div>
          </details>
        </fieldset>
      </form>
      <DialogFooter className="relationship-dialog-footer"><Button type="button" variant="outline" disabled={pending} onClick={close}>Cancel</Button><Button type="submit" form={formId} disabled={pending}>{pending ? "Saving…" : committed ? "Retry refresh" : "Save Event"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
