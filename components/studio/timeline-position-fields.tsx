"use client";
import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { RelationshipSinceOption } from "@/lib/relationship-since";

export type TimelinePositionForm = {
  sortIndex?: number; internalDate: string; chronologyKind: "manual" | "relative";
  relativeDay: number | null; relativeMinute: number | null;
  volumeId: string; chapterId: string; sceneId: string;
};

export function TimelinePositionFields({ value, onChange, options, requireOrder = false }: {
  value: TimelinePositionForm; onChange: (value: TimelinePositionForm) => void;
  options: RelationshipSinceOption[]; requireOrder?: boolean;
}) {
  const id = React.useId();
  const update = (part: Partial<TimelinePositionForm>) => onChange({ ...value, ...part });
  const story = value.sceneId ? `scene:${value.sceneId}` : value.chapterId ? `chapter:${value.chapterId}` : value.volumeId ? `volume:${value.volumeId}` : "none";
  return <fieldset className="grid min-w-0 gap-3">
    <legend className="mb-2 font-medium">Chronological Position</legend>
    <p className="text-sm text-muted-foreground">Numeric order is independent of where the event is told. Equal values are simultaneous, with stable ID ordering.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-2"><Label htmlFor={`${id}-order`}>Manual order</Label><Input id={`${id}-order`} type="number" min={-1000000000} max={1000000000} step={1} required={requireOrder} value={value.sortIndex ?? ""} placeholder="Append after last event" onChange={e => update({ sortIndex: e.target.value === "" ? undefined : Number(e.target.value) })} /></div>
      <div className="grid gap-2"><Label htmlFor={`${id}-label`}>Display label (optional)</Label><Input id={`${id}-label`} maxLength={200} value={value.internalDate} placeholder="Day 03 / 20 years earlier" onChange={e => update({ internalDate: e.target.value })} /></div>
    </div>
    <div className="grid gap-2"><Label htmlFor={`${id}-kind`}>Time precision</Label><Select value={value.chronologyKind} onValueChange={kind => update({ chronologyKind: kind as "manual" | "relative", ...(kind === "manual" ? { relativeDay: null, relativeMinute: null } : {}) })}>
      <SelectTrigger id={`${id}-kind`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">Manual / unknown date</SelectItem><SelectItem value="relative">Relative day / time</SelectItem></SelectContent>
    </Select></div>
    {value.chronologyKind === "relative" ? <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-2"><Label htmlFor={`${id}-day`}>Relative day</Label><Input id={`${id}-day`} type="number" step={1} min={-1000000000} max={1000000000} required value={value.relativeDay ?? ""} onChange={e => update({ relativeDay: e.target.value === "" ? null : Number(e.target.value) })} /></div>
      <div className="grid gap-2"><Label htmlFor={`${id}-minute`}>Minute of day (optional, 0–1439)</Label><Input id={`${id}-minute`} type="number" step={1} min={0} max={1439} value={value.relativeMinute ?? ""} onChange={e => update({ relativeMinute: e.target.value === "" ? null : Number(e.target.value) })} /></div>
    </div> : null}
    <div className="grid min-w-0 gap-2"><Label htmlFor={`${id}-story`}>Story Position (optional)</Label><Select value={story} onValueChange={target => {
      const [kind, targetId] = target.split(":");
      update({ volumeId: kind === "volume" ? targetId : "", chapterId: kind === "chapter" ? targetId : "", sceneId: kind === "scene" ? targetId : "" });
    }}><SelectTrigger id={`${id}-story`} className="min-w-0"><SelectValue /></SelectTrigger><SelectContent className="max-h-72 max-w-[calc(100vw-2rem)] [overflow-wrap:anywhere]">
      <SelectItem value="none">Not told in Structure</SelectItem>
      {story !== "none" && !options.some(option => `${option.kind}:${option.id}` === story) ? <SelectItem value={story} disabled>Structure target unavailable</SelectItem> : null}
      {options.map(option => <SelectItem key={`${option.kind}:${option.id}`} value={`${option.kind}:${option.id}`}>{option.kind}: {option.label}{option.archived ? " (Archived)" : ""}</SelectItem>)}
    </SelectContent></Select></div>
  </fieldset>;
}
