"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import type { Location } from "@/lib/studio-domain";
import type { PlaceSceneSummary } from "@/lib/scene-place";
import { routeForPage } from "@/lib/studio-routes";

export function PlaceScenes({ place, onChanged }: { place: Location; onChanged: () => Promise<void> }) {
  const [open, setOpen] = React.useState(false);
  return <section className="grid gap-2" aria-label="Linked scenes">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Linked scenes</h3><Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>Link scenes</Button></div>
    {place.linkedScenes?.length ? <ul className="space-y-2 text-sm [overflow-wrap:anywhere]">{place.linkedScenes.map((scene) => <li key={scene.id}><Link href={routeForPage("editor", place.novelId, scene.id)} className="text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">{scene.label}</Link></li>)}</ul> : <p className="text-sm text-muted-foreground">Not linked yet</p>}
    {open ? <ScenePicker place={place} onClose={() => setOpen(false)} onChanged={onChanged} /> : null}
  </section>;
}

function ScenePicker({ place, onClose, onChanged }: { place: Location; onClose: () => void; onChanged: () => Promise<void> }) {
  const [invoker] = React.useState(() => document.activeElement);
  const [options, setOptions] = React.useState<Array<PlaceSceneSummary & { linked: boolean }>>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [attempt, setAttempt] = React.useState(0);
  const controller = React.useRef<AbortController | null>(null);
  const url = `/api/places/${encodeURIComponent(place.id)}/scenes?novelId=${encodeURIComponent(place.novelId)}`;
  React.useEffect(() => {
    const request = new AbortController();
    controller.current = request;
    setLoading(true); setError("");
    void fetch(url, { cache: "no-store", signal: request.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Could not load scenes. Retry to refresh the list.");
      const result = await response.json() as Array<PlaceSceneSummary & { linked: boolean }>;
      if (request.signal.aborted) return;
      setOptions(result); setSelected(new Set(result.filter((scene) => scene.linked).map((scene) => scene.id))); setLoading(false);
    }).catch((caught) => { if (!request.signal.aborted) { setError(caught.message); setLoading(false); } });
    return () => { request.abort(); controller.current?.abort(); };
  }, [url, attempt]);
  const save = async () => {
    setSaving(true); setError("");
    const request = new AbortController(); controller.current = request;
    try {
      const response = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, signal: request.signal,
        body: JSON.stringify({ novelId: place.novelId,
          addSceneIds: options.filter((scene) => !scene.linked && selected.has(scene.id)).map((scene) => scene.id),
          removeSceneIds: options.filter((scene) => scene.linked && !selected.has(scene.id)).map((scene) => scene.id) }) });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error ?? "Could not save scene links"); }
      await onChanged();
      if (!request.signal.aborted) onClose();
    } catch (caught) { if (!request.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not save scene links"); }
    finally { if (!request.signal.aborted) setSaving(false); }
  };
  return <Dialog open modal onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent aria-modal="true" closeDisabled={saving} className="max-h-[calc(100dvh-2rem)] overflow-y-auto" onCloseAutoFocus={(event) => { event.preventDefault(); if (invoker instanceof HTMLElement && invoker.isConnected) invoker.focus(); }}>
      <DialogHeader><DialogTitle>Link scenes</DialogTitle><DialogDescription>Select scenes in narrative order (up to 200 changes per save). Archived scenes stay linked but are excluded from this list and the derived count.</DialogDescription></DialogHeader>
      <Input autoFocus aria-label="Search scenes" placeholder="Search scenes" value={query} onChange={(event) => setQuery(event.target.value)} />
      {loading ? <p role="status">Loading scenes…</p> : null}
      <fieldset disabled={loading || saving} className="grid gap-2"><legend className="sr-only">Scenes to link</legend>
        {options.filter((scene) => scene.label.toLowerCase().includes(query.toLowerCase())).map((scene) => <label key={scene.id} className="flex items-start gap-2 rounded border p-2 text-sm [overflow-wrap:anywhere]">
          <input type="checkbox" checked={selected.has(scene.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(scene.id); else next.delete(scene.id); return next; })} />{scene.label}
        </label>)}
      </fieldset>
      {!loading && !options.length && !error ? <p>No active scenes available.</p> : null}
      {error ? <div role="alert" className="text-sm text-destructive">{error}<Button type="button" variant="outline" disabled={saving} onClick={() => setAttempt((value) => value + 1)}>Reload scenes</Button></div> : null}
      <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button type="button" disabled={loading || saving || (!options.length && Boolean(error))} onClick={() => void save()}>{saving ? "Saving…" : "Save links"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
