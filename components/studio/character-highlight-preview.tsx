"use client";
import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { matchCharacterHighlights, type HighlightCharacter } from "@/lib/character-highlight";
import { routeForCharacter } from "@/lib/studio-routes";

const preferenceKey = "monogatari:character-highlights:v1";
export function CharacterHighlightPreview({ novelId, content, characters }: { novelId: string; content: string; characters: HighlightCharacter[] }) {
  const [enabled, setEnabled] = React.useState(false), [selected, setSelected] = React.useState<HighlightCharacter | null>(null);
  const trigger = React.useRef<HTMLButtonElement | null>(null);
  React.useEffect(() => { try { setEnabled(localStorage.getItem(preferenceKey) === "on"); } catch { /* unavailable local preference */ } }, []);
  const update = (next: boolean) => { setEnabled(next); setSelected(null); try { localStorage.setItem(preferenceKey, next ? "on" : "off"); } catch { /* visual preference remains in memory */ } };
  const matches = React.useMemo(() => enabled ? matchCharacterHighlights(content, characters) : [], [characters, content, enabled]);
  React.useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setSelected(null); requestAnimationFrame(() => trigger.current?.focus()); } };
    document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close);
  }, [selected]);
  let cursor = 0;
  return <section className="mx-auto mt-3 grid max-w-4xl min-w-0 gap-2" aria-label="Character highlights">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-medium">Character highlights</h3><p className="text-xs text-muted-foreground">Case-insensitive full-name and alias matches; ambiguous names are not highlighted.</p></div><Button type="button" size="sm" variant="outline" aria-pressed={enabled} onClick={() => update(!enabled)}>{enabled ? "Highlights On" : "Highlights Off"}</Button></div>
    {enabled ? <div className="relative rounded-lg border bg-editor p-4 font-typewriter leading-8 text-editor-foreground sm:p-8">
      <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{matches.flatMap((match, index) => {
        const before = content.slice(cursor, match.start); cursor = match.end;
        return [before, <button key={`${match.start}:${match.character.id}`} type="button" className="rounded-sm bg-primary-subtle px-0.5 text-editor-foreground underline decoration-primary/45 decoration-1 underline-offset-4 hover:bg-primary-subtle-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" onClick={event => { trigger.current = event.currentTarget; setSelected(match.character); }} aria-label={`Character: ${match.character.name}`}>{content.slice(match.start, match.end)}</button>, index === matches.length - 1 ? content.slice(cursor) : ""];
      })}{matches.length ? null : content}</p>
      {selected ? <section role="dialog" aria-label={`Character summary: ${selected.name}`} className="sticky bottom-2 mt-3 grid gap-2 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lift">
        <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">{selected.name}</h4><Button type="button" size="sm" variant="ghost" onClick={() => { setSelected(null); requestAnimationFrame(() => trigger.current?.focus()); }}>Close</Button></div>
        <dl className="grid gap-1 text-sm">{[["Role", selected.role], ["Personality", selected.personality], ["Way of speaking", selected.wayOfSpeaking], ["Goal", selected.goal], ["Fear", selected.fear]].filter(([, value]) => value).map(([label, value]) => <React.Fragment key={label}><dt className="font-medium">{label}</dt><dd>{value}</dd></React.Fragment>)}</dl>
        <Link href={routeForCharacter(novelId, selected.id)} className="w-fit rounded text-primary underline focus-visible:outline focus-visible:outline-2">Open full profile</Link>
      </section> : null}
    </div> : null}
  </section>;
}
