import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = await readFile(resolve("components/studio/characters-screen.tsx"), "utf8");

test("Character detail rail and cards use shrinkable layout tracks rather than fixed widths", () => {
  assert.match(source, /xl:grid-cols-\[minmax\(0,1fr\)_minmax\(0,25rem\)\]/);
  assert.match(source, /surface-elevated w-full min-w-0 max-w-full/);
  assert.match(source, /sm:grid-cols-\[90px_minmax\(0,1fr\)\]/);
  assert.doesNotMatch(source, /xl:grid-cols-\[1fr_400px\]/);
});

test("long Story Connections text wraps inside shrinkable cards while controls remain available", () => {
  for (const value of ["flex min-w-0 items-start gap-2", "break-words [overflow-wrap:anywhere]", "size-3 shrink-0", "flex min-w-0 flex-col gap-2 sm:flex-row", "grid min-w-0 gap-2", "max-w-[calc(100vw-2rem)] [overflow-wrap:anywhere]"]) assert.ok(source.includes(value), `missing responsive constraint: ${value}`);
  assert.doesNotMatch(source, /block truncate text-xs text-muted-foreground>\{scene\.volumeTitle\}/);
});

test("Identity and header content can wrap without using global overflow clipping", () => {
  assert.match(source, /First appearance[\s\S]*block break-words \[overflow-wrap:anywhere\]/);
  assert.match(source, /CardTitle[\s\S]*min-w-0 break-words/);
  assert.doesNotMatch(source, /overflow-x-hidden/);
});
