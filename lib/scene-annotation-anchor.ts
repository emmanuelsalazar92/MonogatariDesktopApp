export const MAX_ANNOTATIONS_PER_SCENE = 100;
export const MAX_ANCHOR_QUOTE_LENGTH = 10_000;
export const MAX_ANCHOR_SCENE_LENGTH = 500_000;
const MAX_MATCH_EVENTS = 10_000;

export type SceneAnnotationSummary = { id: string; title: string; quotedText: string; matchable: boolean; workflowStatus: string };
export type ResolvedSceneAnnotation = SceneAnnotationSummary & { status: "anchored" | "unanchored"; index: number | null; reason?: "none" | "multiple" | "limit" };

type Node = { next: Map<string, number>; fail: number; output: number[] };

// Aho-Corasick keeps matching linear in manuscript + quote size (plus bounded match events).
// Indices are an ephemeral render result and never belong to an API or persistence payload.
export function resolveSceneAnnotations(content: string, annotations: SceneAnnotationSummary[]): ResolvedSceneAnnotation[] {
  if (content.length > MAX_ANCHOR_SCENE_LENGTH || annotations.length > MAX_ANNOTATIONS_PER_SCENE) {
    return annotations.map(note => ({ ...note, status: "unanchored", index: null, reason: "limit" }));
  }
  const source = content.normalize("NFC"), patterns: string[] = [], patternFor = new Map<string, number>();
  const mapping: Array<number | null> = annotations.map(note => {
    if (!note.matchable || !note.quotedText || note.quotedText.length > MAX_ANCHOR_QUOTE_LENGTH) return null;
    const quote = note.quotedText.normalize("NFC");
    if (!quote) return null;
    const known = patternFor.get(quote);
    if (known !== undefined) return known;
    const index = patterns.length; patterns.push(quote); patternFor.set(quote, index); return index;
  });
  const nodes: Node[] = [{ next: new Map(), fail: 0, output: [] }];
  patterns.forEach((pattern, patternIndex) => {
    let state = 0;
    for (let i = 0; i < pattern.length; i++) {
      const character = pattern[i]; let next = nodes[state].next.get(character);
      if (next === undefined) { next = nodes.length; nodes[state].next.set(character, next); nodes.push({ next: new Map(), fail: 0, output: [] }); }
      state = next;
    }
    nodes[state].output.push(patternIndex);
  });
  const queue: number[] = [];
  for (const next of nodes[0].next.values()) queue.push(next);
  for (let head = 0; head < queue.length; head++) {
    const state = queue[head];
    for (const [character, next] of nodes[state].next) {
      queue.push(next); let fallback = nodes[state].fail;
      while (fallback && !nodes[fallback].next.has(character)) fallback = nodes[fallback].fail;
      nodes[next].fail = nodes[fallback].next.get(character) ?? 0;
      nodes[next].output.push(...nodes[nodes[next].fail].output);
    }
  }
  const counts = patterns.map(() => 0), first = patterns.map(() => -1); let state = 0, events = 0, limited = false;
  scan: for (let i = 0; i < source.length; i++) {
    const character = source[i];
    while (state && !nodes[state].next.has(character)) state = nodes[state].fail;
    state = nodes[state].next.get(character) ?? 0;
    for (const patternIndex of nodes[state].output) {
      if (++events > MAX_MATCH_EVENTS) { limited = true; break scan; }
      if (counts[patternIndex] < 2) { counts[patternIndex]++; if (counts[patternIndex] === 1) first[patternIndex] = i - patterns[patternIndex].length + 1; }
    }
  }
  return annotations.map((note, index) => {
    const pattern = mapping[index];
    if (limited || pattern === null) return { ...note, status: "unanchored", index: null, reason: "limit" };
    if (counts[pattern] === 1) return { ...note, status: "anchored", index: first[pattern] };
    return { ...note, status: "unanchored", index: null, reason: counts[pattern] ? "multiple" : "none" };
  });
}

