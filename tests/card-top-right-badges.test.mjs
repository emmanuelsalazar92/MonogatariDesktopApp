import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const shared = await readFile(resolve("components/studio/shared.tsx"), "utf8");
const characters = await readFile(resolve("components/studio/characters-screen.tsx"), "utf8");
const page = await readFile(resolve("app/page.tsx"), "utf8");

test("Character and Place upper-right badges share a deliberate top inset", () => {
  assert.match(shared, /cardTopRightBadgeClass = "mt-1 shrink-0 max-w-full"/);
  assert.match(characters, /cn\(cardTopRightBadgeClass, "flex items-center/);
  assert.match(characters, /StatusBadge status=\{character.status\} translate=\{translate\} className=\{cardTopRightBadgeClass\}/);
  assert.match(page, /Badge variant="outline" className=\{cardTopRightBadgeClass\}/);
  assert.match(characters, /CardContent className="grid gap-3 p-5 sm:grid-cols-\[52px_minmax\(0,1fr\)\]"/);
  assert.match(page, /CardContent className="space-y-4 p-5"/);
});
