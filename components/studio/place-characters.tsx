"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { characterPlaceRelationshipTypes, type Character, type CharacterPlaceLink, type CharacterPlaceRelationshipType } from "@/lib/studio-domain";
import { defaultCharacterPlaceRelationshipType, derivePlaceCharacters } from "@/lib/character-place";
import { routeForCharacter } from "@/lib/studio-routes";

export function PlaceCharacters({ place, characters, links, onChanged }: {
  place: { id: string; novelId: string };
  characters: Character[];
  links: CharacterPlaceLink[];
  onChanged: () => Promise<void>;
}) {
  const linked = React.useMemo(() => derivePlaceCharacters(place, characters, links), [place, characters, links]);
  const linkedIds = new Set(linked.map((character) => character.characterId));
  const available = characters.filter((character) => character.novelId === place.novelId && !linkedIds.has(character.id));
  const [characterId, setCharacterId] = React.useState("");
  const [relationshipType, setRelationshipType] = React.useState<CharacterPlaceRelationshipType>(defaultCharacterPlaceRelationshipType);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const request = React.useRef<AbortController | null>(null);
  const selectorId = React.useId();
  React.useEffect(() => () => request.current?.abort(), []);

  const mutate = async (method: "POST" | "DELETE", id: string) => {
    if (pending) return;
    setPending(true); setError(""); setMessage("");
    const controller = new AbortController(); request.current = controller;
    try {
      // Both Bibles intentionally use MD-97's endpoint and its canonical join.
      const response = await fetch(`/api/characters/${encodeURIComponent(id)}/places?novelId=${encodeURIComponent(place.novelId)}`, {
        method, headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ locationId: place.id, ...(method === "POST" ? { relationshipType } : {}) })
      });
      if (!response.ok) { const payload = await response.json(); throw new Error(payload.error ?? "Could not update linked characters"); }
      if (controller.signal.aborted) return;
      await onChanged();
      if (controller.signal.aborted) return;
      setCharacterId(""); setMessage(method === "POST" ? "Character linked" : "Character unlinked");
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not update linked characters");
    } finally { if (!controller.signal.aborted) setPending(false); }
  };

  return <section aria-label="Linked characters" className="grid gap-3 rounded-md border border-border/60 p-3">
    <h3 className="text-sm font-semibold">Linked characters ({linked.length})</h3>
    {linked.length ? <ul className="grid gap-2">{linked.map((character) => <li key={character.characterId} className="flex flex-wrap items-start justify-between gap-2 rounded border p-2">
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <Link href={routeForCharacter(place.novelId, character.characterId)} className="text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">{character.name}</Link>
        <p className="text-xs text-muted-foreground">{character.relationshipType}{character.archived ? " · Archived" : ""}</p>
      </div>
      <Button type="button" variant="ghost" size="sm" disabled={pending} aria-label={`Unlink ${character.name}`} onClick={() => void mutate("DELETE", character.characterId)}>Unlink</Button>
    </li>)}</ul> : <p className="text-sm text-muted-foreground">No linked characters yet</p>}
    <form onSubmit={(event) => { event.preventDefault(); if (available.some((character) => character.id === characterId)) void mutate("POST", characterId); }} className="grid gap-2">
      <Label htmlFor={selectorId}>Character</Label>
      <Select value={characterId} onValueChange={setCharacterId} disabled={pending || !available.length}>
        <SelectTrigger className="min-w-0" id={selectorId}><SelectValue placeholder="Select character" /></SelectTrigger>
        <SelectContent className="max-h-[min(24rem,var(--radix-select-content-available-height))] max-w-[calc(100vw-2rem)] [overflow-wrap:anywhere]">{available.map((character) => <SelectItem key={character.id} value={character.id}>{character.name}{character.archivedAt ? " (Archived)" : ""}</SelectItem>)}</SelectContent>
      </Select>
      <Label htmlFor={`${selectorId}-type`}>Relationship</Label>
      <Select value={relationshipType} onValueChange={(value) => setRelationshipType(value as CharacterPlaceRelationshipType)} disabled={pending}>
        <SelectTrigger id={`${selectorId}-type`}><SelectValue /></SelectTrigger>
        <SelectContent>{characterPlaceRelationshipTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
      </Select>
      <Button type="submit" disabled={pending || !available.some((character) => character.id === characterId)}>{pending ? "Saving…" : "Link character"}</Button>
    </form>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
  </section>;
}
