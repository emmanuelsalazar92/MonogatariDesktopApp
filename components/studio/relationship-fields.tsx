"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { relationshipDefinitions, type RelationshipSince } from "@/lib/character-relationship";
import type { RelationshipSinceOption } from "@/lib/relationship-since";

export type RelationshipFormValues = RelationshipSince & {
  fromCharacterId: string; toCharacterId: string; relationshipType: string;
  status: string; description: string; notes: string; isSpoiler: boolean;
};

export function RelationshipFields({ form, onChange, characters, sinceOptions, saving, firstFieldRef }: {
  form: RelationshipFormValues; onChange: React.Dispatch<React.SetStateAction<RelationshipFormValues>>;
  characters: { id: string; name: string }[]; sinceOptions: RelationshipSinceOption[];
  saving: boolean; firstFieldRef: React.Ref<HTMLButtonElement>;
}) {
  const type = relationshipDefinitions.find((item) => item.active && item.key === form.relationshipType);
  const update = (changes: Partial<RelationshipFormValues>) => onChange((current) => ({ ...current, ...changes }));
  const sinceValue = form.sinceTargetId ? `${form.sinceKind}:${form.sinceTargetId}` : form.sinceKind;
  const choiceClass = "max-h-[min(24rem,var(--radix-select-content-available-height))] max-w-[calc(100vw-2rem)] [overflow-wrap:anywhere]";
  return <>
    <fieldset disabled={saving} className="grid min-w-0 gap-3">
      <legend className="sr-only">Essential</legend>
      <div className="grid min-w-0 gap-3 sm:grid-cols-3">
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="relationship-from">From Character</Label>
          <Select value={form.fromCharacterId} disabled={saving} onValueChange={(id) => update({ fromCharacterId: id, ...(form.toCharacterId === id ? { toCharacterId: "" } : {}) })}>
            <SelectTrigger ref={firstFieldRef} id="relationship-from" className="min-w-0"><SelectValue placeholder="Select character" /></SelectTrigger>
            <SelectContent className={choiceClass}>{characters.map((character) => <SelectItem key={character.id} value={character.id}>{character.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="relationship-type">Relationship Type</Label>
          <Select value={form.relationshipType} disabled={saving} onValueChange={(relationshipType) => update({ relationshipType })}>
            <SelectTrigger id="relationship-type" className="min-w-0"><SelectValue placeholder="Select type" /></SelectTrigger>
            <SelectContent className={choiceClass}>{relationshipDefinitions.filter((item) => item.active).map((item) => <SelectItem key={item.key} value={item.key}>{item.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="relationship-to">To Character</Label>
          <Select value={form.toCharacterId} disabled={saving} onValueChange={(toCharacterId) => update({ toCharacterId })}>
            <SelectTrigger id="relationship-to" className="min-w-0"><SelectValue placeholder="Select character" /></SelectTrigger>
            <SelectContent className={choiceClass}>{characters.filter((item) => item.id !== form.fromCharacterId).map((character) => <SelectItem key={character.id} value={character.id}>{character.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div aria-live="polite" className="text-xs text-muted-foreground">
        {type ? <><p>Category: {type.category} · Direction: {type.direction}</p><p>From → To: {type.labelFromTo} · To → From: {type.labelToFrom}</p></> : "Category and direction are derived from the selected type."}
      </div>
    </fieldset>
    <details className="min-w-0 rounded-md border p-3">
      <summary className="cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Story context <span className="text-sm font-normal text-muted-foreground">(optional)</span></summary>
      <fieldset disabled={saving} className="mt-3 grid min-w-0 gap-3">
        <legend className="sr-only">Story context</legend>
        <div className="grid gap-2"><Label htmlFor="relationship-status">Status</Label><Input id="relationship-status" maxLength={80} value={form.status} placeholder="Optional" onChange={(event) => update({ status: event.target.value })} /></div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="relationship-since">Since</Label>
          <Select value={sinceValue} disabled={saving} onValueChange={(value) => {
            const [kind, id] = value.split(":");
            update({ sinceKind: kind as RelationshipSince["sinceKind"], sinceTargetId: id ?? null, since: "" });
          }}>
            <SelectTrigger id="relationship-since" className="min-w-0" aria-describedby="relationship-since-help"><SelectValue /></SelectTrigger>
            <SelectContent className={choiceClass}>
              <SelectItem value="unknown">Unknown</SelectItem><SelectItem value="before_story">Before story</SelectItem><SelectItem value="custom">Custom text</SelectItem>
              {form.sinceTargetId && !sinceOptions.some((option) => `${option.kind}:${option.id}` === sinceValue && !option.archived) ? <SelectItem value={sinceValue} disabled>Structure target unavailable — choose another</SelectItem> : null}
              {sinceOptions.filter((option) => !option.archived).map((option) => <SelectItem key={`${option.kind}:${option.id}`} value={`${option.kind}:${option.id}`}>{option.kind}: {option.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <p id="relationship-since-help" className="text-xs text-muted-foreground">Structure links follow current titles. Custom text is not linked to Structure.</p>
        </div>
        {form.sinceKind === "custom" ? <div className="grid gap-2"><Label htmlFor="relationship-since-custom">Custom Since</Label><Input id="relationship-since-custom" required maxLength={120} value={form.since} onChange={(event) => update({ since: event.target.value })} /></div> : null}
        <div className="flex items-center justify-between gap-3"><Label htmlFor="relationship-spoiler">Spoiler relationship</Label><Switch id="relationship-spoiler" disabled={saving} checked={form.isSpoiler} onCheckedChange={(isSpoiler) => update({ isSpoiler })} /></div>
      </fieldset>
    </details>
    <details className="min-w-0 rounded-md border p-3">
      <summary className="cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Advanced details</summary>
      {/* Keep controlled fields mounted: collapsing never discards the draft. */}
      <fieldset disabled={saving} className="mt-3 grid min-w-0 gap-3">
        <legend className="sr-only">Advanced details</legend>
        <div className="grid gap-2"><Label htmlFor="relationship-description">Description</Label><Textarea id="relationship-description" maxLength={2000} value={form.description} onChange={(event) => update({ description: event.target.value })} /></div>
        <div className="grid gap-2"><Label htmlFor="relationship-notes">Continuity Notes</Label><Textarea id="relationship-notes" maxLength={5000} value={form.notes} onChange={(event) => update({ notes: event.target.value })} /></div>
      </fieldset>
    </details>
  </>;
}
