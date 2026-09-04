import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Notes stay local and private by construction", () => {
  const sources = ["components/studio/notes-catalog.tsx", "components/studio/note-form-dialog.tsx", "components/studio/note-detail-dialog.tsx", "components/studio/story-notes.tsx", "lib/db/notes.ts", "lib/db/note-catalog.ts", "app/api/notes/route.ts", "app/api/notes/[noteId]/route.ts"].map(read).join("\n");
  assert.doesNotMatch(sources, /notion|openai|send to ai|console\.|analytics/i);
  assert.doesNotMatch(read("components/studio/notes-catalog.tsx"), /noteFilterParams\(\{ \.\.\.filter, search: debouncedSearch/);
  assert.match(read("app/api/notes/route.ts"), /params\.delete\("search"\)/);
  assert.match(read("app/api/notes/errors.ts"), /Could not update Notes/);
});

test("Catalog/detail hardening is bounded, isolated and stale-link safe", () => {
  const catalog = read("lib/db/note-catalog.ts"), list = read("components/studio/notes-catalog.tsx"), detail = read("components/studio/note-detail-dialog.tsx"), schema = read("prisma/schema.prisma");
  assert.match(catalog, /substr\(n\.content,1,240\)/); assert.match(catalog, /LIMIT 50 OFFSET/);
  assert.doesNotMatch(catalog, /content: true|searchText: true/);
  assert.match(list, /abort\.abort\(\)/); assert.match(detail, /abort\.abort\(\)/);
  assert.match(detail, /archived; unavailable for navigation/); assert.match(list, /\(archived\)/);
  for (const index of [/@@index\(\[novelId, archivedAt, updatedAt, id\]\)/, /@@index\(\[novelId, workflowStatus, updatedAt\]\)/, /@@index\(\[novelId, pinned, updatedAt\]\)/]) assert.match(schema, index);
});
