"use client";

import * as React from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { characterPlaceRelationshipTypes, type Character, type CharacterPlaceLink, type CharacterPlaceRelationshipType, type Location, type TimelineEventSummary } from "@/lib/studio-domain";
import { defaultCharacterPlaceRelationshipType, derivePlaceCharacters } from "@/lib/character-place";
import { compareTimelineEvents, derivePlaceStoryEvents } from "@/lib/timeline-place";
import { isValidNovelRouteId, routeForCharacter, routeForPage, routeForTimelineEvent } from "@/lib/studio-routes";
import type { PlaceSceneSummary } from "@/lib/scene-place";

type ConnectionKind = "character" | "scene" | "event";
type CharacterConnection = ReturnType<typeof derivePlaceCharacters>[number];
const connectionMenuItemClass = "rounded px-3 py-2 text-left hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function PlaceConnections({ place, characters, links, events, onChanged }: {
  place: Location;
  characters: Character[];
  links: CharacterPlaceLink[];
  events: TimelineEventSummary[];
  onChanged: () => Promise<void>;
}) {
  const linkedCharacters = React.useMemo(() => derivePlaceCharacters(place, characters, links), [place, characters, links]);
  const linkedScenes = place.linkedScenes ?? [];
  const linkedEvents = React.useMemo(() => derivePlaceStoryEvents(place, events), [place, events]);
  const [dialog, setDialog] = React.useState<{ kind: ConnectionKind; editCharacter?: CharacterConnection } | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState("");
  const request = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => request.current?.abort(), []);

  const mutate = async (operation: "unlink-character" | "unlink-scene" | "unlink-event", id: string) => {
    if (pending) return;
    const controller = new AbortController(); request.current = controller;
    setPending(true); setError("");
    try {
      let response: Response;
      if (operation === "unlink-character") {
        response = await fetch(`/api/characters/${encodeURIComponent(id)}/places?novelId=${encodeURIComponent(place.novelId)}`, {
          method: "DELETE", headers: { "Content-Type": "application/json" }, signal: controller.signal,
          body: JSON.stringify({ novelId: place.novelId, locationId: place.id })
        });
      } else if (operation === "unlink-scene") {
        response = await fetch(`/api/places/${encodeURIComponent(place.id)}/scenes?novelId=${encodeURIComponent(place.novelId)}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, signal: controller.signal,
          body: JSON.stringify({ novelId: place.novelId, addSceneIds: [], removeSceneIds: [id] })
        });
      } else {
        response = await fetch(`/api/timeline-events/${encodeURIComponent(id)}/place?novelId=${encodeURIComponent(place.novelId)}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, signal: controller.signal,
          body: JSON.stringify({ novelId: place.novelId, locationId: place.id, linked: false, expectedLinked: true })
        });
      }
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Could not update this connection");
      if (!controller.signal.aborted) await onChanged();
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not update this connection");
    } finally { if (!controller.signal.aborted) setPending(false); }
  };

  return <section aria-label="Connections" className="grid gap-4 rounded-md border border-border/60 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="text-sm font-semibold">Connections</h3><p className="text-sm text-muted-foreground">Related characters, scenes, and story events.</p></div>
      <Button type="button" variant="outline" size="sm" onClick={() => { setError(""); setDialog({ kind: "character" }); }}>Add connection</Button>
    </div>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <ConnectionGroup label="Characters" count={linkedCharacters.length} empty="No linked characters yet">
      {linkedCharacters.map((character) => <li key={character.characterId} className="flex flex-wrap items-start justify-between gap-2 rounded border p-2">
        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]"><Link href={routeForCharacter(place.novelId, character.characterId)} className="text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">{character.name}</Link><p className="text-xs text-muted-foreground">{character.relationshipType}{character.archived ? " · Archived" : ""}</p></div>
        <ConnectionMenu label={`Character actions: ${character.name}`}>
          <Link href={routeForCharacter(place.novelId, character.characterId)} role="menuitem" className={connectionMenuItemClass}>Open</Link>
          <button type="button" role="menuitem" className={connectionMenuItemClass} onClick={() => { setError(""); setDialog({ kind: "character", editCharacter: character }); }}>Edit relationship</button>
          <button type="button" role="menuitem" className={`${connectionMenuItemClass} text-destructive`} disabled={pending} onClick={() => void mutate("unlink-character", character.characterId)}>Unlink</button>
        </ConnectionMenu>
      </li>)}
    </ConnectionGroup>
    <ConnectionGroup label="Scenes" count={linkedScenes.length} empty="No linked scenes yet">
      {linkedScenes.map((scene) => <li key={scene.id} className="flex flex-wrap items-start justify-between gap-2 rounded border p-2"><Link href={routeForPage("editor", place.novelId, scene.id)} className="min-w-0 flex-1 text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring [overflow-wrap:anywhere]">{scene.label}</Link><ConnectionMenu label={`Scene actions: ${scene.label}`}><Link href={routeForPage("editor", place.novelId, scene.id)} role="menuitem" className={connectionMenuItemClass}>Open</Link><button type="button" role="menuitem" className={`${connectionMenuItemClass} text-destructive`} disabled={pending} onClick={() => void mutate("unlink-scene", scene.id)}>Unlink</button></ConnectionMenu></li>)}
    </ConnectionGroup>
    <ConnectionGroup label="Events" count={linkedEvents.length} empty="No linked events yet">
      {linkedEvents.map((event) => <li key={event.id} className="flex flex-wrap items-start justify-between gap-2 rounded border p-2"><div className="min-w-0 flex-1 [overflow-wrap:anywhere]"><Link href={routeForTimelineEvent(place.novelId, event.id)} className="text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">{event.title}</Link><p className="text-xs text-muted-foreground">{event.internalDate || "No date"}{event.isSpoiler ? " · Spoiler" : ""}</p></div><ConnectionMenu label={`Event actions: ${event.title}`}><Link href={routeForTimelineEvent(place.novelId, event.id)} role="menuitem" className={connectionMenuItemClass}>Open</Link><button type="button" role="menuitem" className={`${connectionMenuItemClass} text-destructive`} disabled={pending} onClick={() => void mutate("unlink-event", event.id)}>Unlink</button></ConnectionMenu></li>)}
    </ConnectionGroup>
    {dialog ? <ConnectionDialog place={place} characters={characters} linkedCharacterIds={new Set(linkedCharacters.map((character) => character.characterId))} events={events} dialog={dialog} onClose={() => setDialog(null)} onChanged={onChanged} /> : null}
  </section>;
}

function ConnectionGroup({ label, count, empty, children }: { label: string; count: number; empty: string; children: React.ReactNode }) {
  return <section aria-label={`${label} connections`} className="grid gap-2"><h4 className="text-sm font-semibold">{label} ({count})</h4>{count ? <ul className="grid gap-2">{children}</ul> : <p className="text-sm text-muted-foreground">{empty}</p>}</section>;
}

function ConnectionMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return <details className="relative shrink-0" onClick={(event) => { const target = event.target as HTMLElement; if (target.closest('[role="menuitem"]')) event.currentTarget.removeAttribute("open"); }}>
    <summary aria-label={label} aria-haspopup="menu" className="flex size-8 cursor-pointer list-none items-center justify-center rounded text-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"><MoreHorizontal aria-hidden="true" className="size-4" /></summary>
    <div role="menu" className="absolute right-0 z-20 mt-1 grid w-40 rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-lift">{children}</div>
  </details>;
}

function ConnectionDialog({ place, characters, linkedCharacterIds, events, dialog, onClose, onChanged }: {
  place: Location; characters: Character[]; linkedCharacterIds: Set<string>; events: TimelineEventSummary[];
  dialog: { kind: ConnectionKind; editCharacter?: CharacterConnection }; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const editing = Boolean(dialog.editCharacter);
  const [kind, setKind] = React.useState<ConnectionKind>(dialog.kind);
  const [selectedId, setSelectedId] = React.useState(dialog.editCharacter?.characterId ?? "");
  const [relationshipType, setRelationshipType] = React.useState<CharacterPlaceRelationshipType>(dialog.editCharacter?.relationshipType ?? defaultCharacterPlaceRelationshipType);
  const [scenes, setScenes] = React.useState<Array<PlaceSceneSummary & { linked: boolean }>>([]);
  const [loadingScenes, setLoadingScenes] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState("");
  const request = React.useRef<AbortController | null>(null);
  const availableCharacters = React.useMemo(() => characters.filter((character) => character.novelId === place.novelId && (editing || !linkedCharacterIds.has(character.id))), [characters, editing, linkedCharacterIds, place.novelId]);
  const availableEvents = React.useMemo(() => events.filter((event) => event.novelId === place.novelId && !event.locationIds.includes(place.id) && isValidNovelRouteId(event.id)).sort(compareTimelineEvents), [events, place.id, place.novelId]);
  React.useEffect(() => () => request.current?.abort(), []);
  React.useEffect(() => {
    if (kind !== "scene") return;
    const controller = new AbortController(); request.current = controller; setLoadingScenes(true); setError("");
    void fetch(`/api/places/${encodeURIComponent(place.id)}/scenes?novelId=${encodeURIComponent(place.novelId)}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Could not load scenes");
      if (!controller.signal.aborted) setScenes(payload as Array<PlaceSceneSummary & { linked: boolean }>);
    }).catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not load scenes"); }).finally(() => { if (!controller.signal.aborted) setLoadingScenes(false); });
    return () => controller.abort();
  }, [kind, place.id, place.novelId]);
  const options = kind === "character" ? availableCharacters : kind === "scene" ? scenes.filter((scene) => !scene.linked) : availableEvents;
  const submit = async () => {
    if (!selectedId || pending || (kind === "scene" && loadingScenes)) return;
    const controller = new AbortController(); request.current = controller; setPending(true); setError("");
    try {
      let response: Response;
      if (kind === "character") response = await fetch(`/api/characters/${encodeURIComponent(selectedId)}/places?novelId=${encodeURIComponent(place.novelId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ novelId: place.novelId, locationId: place.id, relationshipType }) });
      else if (kind === "scene") response = await fetch(`/api/places/${encodeURIComponent(place.id)}/scenes?novelId=${encodeURIComponent(place.novelId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ novelId: place.novelId, addSceneIds: [selectedId], removeSceneIds: [] }) });
      else response = await fetch(`/api/timeline-events/${encodeURIComponent(selectedId)}/place?novelId=${encodeURIComponent(place.novelId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ novelId: place.novelId, locationId: place.id, linked: true, expectedLinked: false }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Could not add this connection");
      if (!controller.signal.aborted) { await onChanged(); onClose(); }
    } catch (caught) { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not add this connection"); }
    finally { if (!controller.signal.aborted) setPending(false); }
  };
  const changeKind = (next: ConnectionKind) => { setKind(next); setSelectedId(""); setError(""); };
  return <Dialog open modal onOpenChange={(open) => { if (!open && !pending) onClose(); }}><DialogContent closeDisabled={pending} className="max-h-[calc(100dvh-2rem)] overflow-y-auto"><DialogHeader><DialogTitle>{editing ? "Edit relationship" : "Add connection"}</DialogTitle><DialogDescription>{editing ? "Update the character’s relationship to this place." : "Choose one entity to connect. Connections retain each entity’s existing ownership and integrity checks."}</DialogDescription></DialogHeader>
    {!editing ? <div className="grid gap-2"><Label htmlFor="connection-kind">Connection type</Label><Select value={kind} onValueChange={(value) => changeKind(value as ConnectionKind)} disabled={pending}><SelectTrigger id="connection-kind"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="character">Character</SelectItem><SelectItem value="scene">Scene</SelectItem><SelectItem value="event">Event</SelectItem></SelectContent></Select></div> : null}
    <div className="grid gap-2"><Label htmlFor="connection-entity">{kind === "character" ? "Character" : kind === "scene" ? "Scene" : "Event"}</Label><Select value={selectedId} onValueChange={setSelectedId} disabled={pending || loadingScenes || (editing && kind === "character")}><SelectTrigger id="connection-entity"><SelectValue placeholder={loadingScenes ? "Loading scenes…" : `Select ${kind}`} /></SelectTrigger><SelectContent>{options.map((item) => <SelectItem key={item.id} value={item.id}>{kind === "event" && "internalDate" in item && item.internalDate ? `${item.internalDate} · ` : ""}{kind === "scene" ? (item as PlaceSceneSummary).label : "name" in item ? item.name : item.title}</SelectItem>)}</SelectContent></Select>{!loadingScenes && !options.length ? <p className="text-sm text-muted-foreground">No available {kind}s to connect.</p> : null}</div>
    {kind === "character" ? <div className="grid gap-2"><Label htmlFor="connection-relationship">Relationship</Label><Select value={relationshipType} onValueChange={(value) => setRelationshipType(value as CharacterPlaceRelationshipType)} disabled={pending}><SelectTrigger id="connection-relationship"><SelectValue /></SelectTrigger><SelectContent>{characterPlaceRelationshipTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div> : null}
    {kind === "event" ? <p className="text-xs text-muted-foreground">Events can have multiple Places; this adds only this Place association.</p> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}<DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancel</Button><Button type="button" disabled={!selectedId || pending || loadingScenes} onClick={() => void submit()}>{pending ? "Saving…" : editing ? "Save relationship" : "Add connection"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
