"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { matchCharacterHighlights, type HighlightCharacter } from "@/lib/character-highlight";

const preferenceKey = "monogatari:character-highlights:v1";

// A native textarea remains the only manuscript surface. This presentation
// preference never creates a second renderer or persists decoration markup.
export function CharacterHighlightPreview({ content, characters, onEnabledChange }: { novelId: string; content: string; characters: HighlightCharacter[]; onEnabledChange?: (enabled: boolean) => void }) {
  const [enabled, setEnabled] = React.useState(false);
  React.useEffect(() => { try { setEnabled(localStorage.getItem(preferenceKey) === "on"); } catch { /* in-memory preference */ } }, []);
  const matches = React.useMemo(() => enabled ? matchCharacterHighlights(content, characters) : [], [characters, content, enabled]);
  React.useEffect(() => onEnabledChange?.(enabled), [enabled, onEnabledChange]);
  const update = (next: boolean) => { setEnabled(next); try { localStorage.setItem(preferenceKey, next ? "on" : "off"); } catch { /* in-memory preference */ } };
  return <Button type="button" size="sm" variant={enabled ? "secondary" : "outline"} aria-pressed={enabled} onClick={() => update(!enabled)}>{enabled ? `Characters · ${matches.length}` : "Characters"}</Button>;
}

export function CharacterHighlightOverlay({ content, characters, enabled, scrollTop }: { content: string; characters: HighlightCharacter[]; enabled: boolean; scrollTop: number }) {
  const matches = React.useMemo(() => enabled ? matchCharacterHighlights(content, characters) : [], [characters, content, enabled]);
  if (!enabled) return null;
  let cursor = 0;
  return <pre aria-hidden="true" className="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre-wrap break-words font-typewriter text-base leading-8 text-editor-foreground sm:text-lg" style={{ transform: `translateY(${-scrollTop}px)` }}>{matches.flatMap((match) => { const before = content.slice(cursor, match.start); cursor = match.end; return [before, <mark key={`${match.start}:${match.character.id}`} className="rounded-sm bg-primary-subtle px-0.5 text-inherit">{content.slice(match.start, match.end)}</mark>]; })}{matches.length ? content.slice(cursor) : content}</pre>;
}
