export type HighlightCharacter = {
  id: string; name: string; aliases: string[]; role?: string; personality?: string;
  wayOfSpeaking?: string; goal?: string; fear?: string;
};
export type CharacterHighlight = { start: number; end: number; text: string; character: HighlightCharacter; matchedBy: string };

const word = /[\p{L}\p{N}_]/u;
const boundary = (text: string, start: number, end: number) =>
  (start === 0 || !word.test(text[start - 1])) && (end === text.length || !word.test(text[end]));

// Matching is NFC-normalized and case-insensitive. Longest unambiguous names win;
// pronouns and fuzzy/semantic matches are intentionally outside this contract.
export function matchCharacterHighlights(text: string, characters: HighlightCharacter[]): CharacterHighlight[] {
  const source = text.normalize("NFC"), folded = source.toLocaleLowerCase();
  const terms = new Map<string, { label: string; characters: HighlightCharacter[] }>();
  for (const character of characters) for (const raw of [character.name, ...(character.aliases ?? [])]) {
    const label = raw.normalize("NFC").trim(), key = label.toLocaleLowerCase();
    if (!label || !key) continue;
    const entry = terms.get(key) ?? { label, characters: [] };
    if (!entry.characters.some(item => item.id === character.id)) entry.characters.push(character);
    terms.set(key, entry);
  }
  const candidates: CharacterHighlight[] = [];
  for (const [key, entry] of terms) {
    if (entry.characters.length !== 1) continue;
    let from = 0;
    while (from <= folded.length - key.length) {
      const start = folded.indexOf(key, from);
      if (start < 0) break;
      const end = start + key.length;
      if (boundary(source, start, end)) candidates.push({ start, end, text: source.slice(start, end), character: entry.characters[0], matchedBy: entry.label });
      from = Math.max(end, start + 1);
    }
  }
  candidates.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start) || a.character.id.localeCompare(b.character.id));
  const result: CharacterHighlight[] = [];
  for (const match of candidates) if (!result.some(item => match.start < item.end && match.end > item.start)) result.push(match);
  return result;
}

